use std::collections::HashMap;
use std::net::IpAddr;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use futures_util::StreamExt;
use serde::Serialize;
use tauri::ipc::Channel;
use tauri::{AppHandle, State};
use tokio::io::AsyncWriteExt;

use crate::security::{
    assert_safe_dest, log_security_event, resolve_safe_url, ResolvedSafeUrl, SecurityDecision,
};

pub struct DownloadState {
    tasks: Arc<Mutex<HashMap<String, Arc<AtomicBool>>>>,
}

impl DownloadState {
    pub fn new() -> Self {
        Self {
            tasks: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

/// Recover from a poisoned mutex rather than panicking the download manager.
/// We never want a single download failure to disable every subsequent one.
fn tasks_lock(
    tasks: &Arc<Mutex<HashMap<String, Arc<AtomicBool>>>>,
) -> std::sync::MutexGuard<'_, HashMap<String, Arc<AtomicBool>>> {
    tasks.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

#[derive(Clone, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum DownloadEvent {
    Started { total: Option<u64>, resumed: u64 },
    Progress { received: u64, total: Option<u64> },
    Done { received: u64 },
    Error { message: String },
    Canceled { received: u64 },
}

enum DownloadEnd {
    Canceled(u64),
    Failed(String),
}

const EMIT_INTERVAL_MS: u128 = 250;
const EMIT_BYTES: u64 = 4 * 1024 * 1024;
const MIN_VIDEO_BYTES: u64 = 512 * 1024;
const MAX_REDIRECTS: usize = 5;
const BROWSER_UA: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

fn total_from_content_range(value: &str) -> Option<u64> {
    value.rsplit('/').next().and_then(|s| s.trim().parse::<u64>().ok())
}

#[tauri::command]
pub async fn download_start(
    app: AppHandle,
    state: State<'_, DownloadState>,
    id: String,
    url: String,
    dest: String,
    headers: Option<HashMap<String, String>>,
    on_event: Channel<DownloadEvent>,
) -> Result<(), String> {
    // Destination gate — blocks traversal, symlinks escaping an allowlist
    // root, and writes to system directories.
    let safe_dest = assert_safe_dest(&app, &dest)?;

    let cancel = Arc::new(AtomicBool::new(false));
    tasks_lock(&state.tasks).insert(id.clone(), cancel.clone());

    let outcome = run_download(
        &url,
        &safe_dest.to_string_lossy(),
        &headers.unwrap_or_default(),
        &cancel,
        &on_event,
    )
    .await;
    tasks_lock(&state.tasks).remove(&id);

    match outcome {
        Ok(()) => Ok(()),
        Err(DownloadEnd::Canceled(received)) => {
            let _ = on_event.send(DownloadEvent::Canceled { received });
            Ok(())
        }
        Err(DownloadEnd::Failed(message)) => {
            let _ = on_event.send(DownloadEvent::Error {
                message: message.clone(),
            });
            Err(message)
        }
    }
}

#[tauri::command]
pub fn download_cancel(state: State<'_, DownloadState>, id: String) {
    if let Some(flag) = tasks_lock(&state.tasks).get(&id) {
        flag.store(true, Ordering::Relaxed);
    }
}

fn download_client(target: &ResolvedSafeUrl) -> Result<reqwest::Client, String> {
    let mut builder = reqwest::Client::builder()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .user_agent(BROWSER_UA);
    let host = target
        .url
        .host_str()
        .ok_or_else(|| "url has no host".to_string())?;
    if host.parse::<IpAddr>().is_err() {
        builder = builder.resolve_to_addrs(host, &target.addresses);
    }
    builder.build().map_err(|error| format!("client: {error}"))
}

fn same_authority(left: &url::Url, right: &url::Url) -> bool {
    left.scheme() == right.scheme()
        && left.host_str() == right.host_str()
        && left.port_or_known_default() == right.port_or_known_default()
}

fn download_redirect_target(
    current: &url::Url,
    response: &reqwest::Response,
) -> Result<Option<url::Url>, String> {
    if !matches!(response.status().as_u16(), 301 | 302 | 303 | 307 | 308) {
        return Ok(None);
    }
    let location = response
        .headers()
        .get(reqwest::header::LOCATION)
        .ok_or_else(|| "redirect response has no location".to_string())?
        .to_str()
        .map_err(|_| "redirect location is not valid text".to_string())?;
    let next = current
        .join(location)
        .map_err(|_| "redirect location is not a valid URL".to_string())?;
    if current.scheme() == "https" && next.scheme() != "https" {
        log_security_event(
            "download",
            SecurityDecision::Blocked,
            "redirect_downgrade",
        );
        return Err("redirect would downgrade HTTPS".to_string());
    }
    Ok(Some(next))
}

async fn run_download(
    url: &str,
    dest: &str,
    headers: &HashMap<String, String>,
    cancel: &Arc<AtomicBool>,
    on_event: &Channel<DownloadEvent>,
) -> Result<(), DownloadEnd> {
    let part = format!("{}.part", dest);

    if let Some(parent) = std::path::Path::new(dest).parent() {
        if !parent.as_os_str().is_empty() {
            tokio::fs::create_dir_all(parent)
                .await
                .map_err(|e| DownloadEnd::Failed(format!("create folder: {}", e)))?;
        }
    }

    let start_byte = match tokio::fs::metadata(&part).await {
        Ok(meta) => meta.len(),
        Err(_) => 0,
    };

    let mut current_url = url.to_string();
    let mut redirect_count = 0usize;
    let mut request_headers = headers.clone();
    let resp = loop {
        let target = resolve_safe_url(&current_url)
            .await
            .map_err(DownloadEnd::Failed)?;
        let client = download_client(&target).map_err(DownloadEnd::Failed)?;
        let has = |name: &str| {
            request_headers
                .keys()
                .any(|key| key.eq_ignore_ascii_case(name))
        };
        let mut req = client.get(target.url.clone());
        if !has("accept") {
            req = req.header(reqwest::header::ACCEPT, "*/*");
        }
        for (key, value) in &request_headers {
            req = req.header(key.as_str(), value.as_str());
        }
        if start_byte > 0 {
            req = req.header(reqwest::header::RANGE, format!("bytes={}-", start_byte));
        } else if !has("range") {
            req = req.header(reqwest::header::RANGE, "bytes=0-");
        }
        eprintln!(
            "[harbor::download] GET {} resume-from={}",
            log_host(target.url.as_str()),
            start_byte
        );
        let response = tokio::select! {
            biased;
            _ = wait_cancelled(cancel) => return Err(DownloadEnd::Canceled(start_byte)),
            result = req.send() => {
                result.map_err(|error| DownloadEnd::Failed(format!("request: {error}")))?
            },
        };
        let Some(next) = download_redirect_target(&target.url, &response)
            .map_err(DownloadEnd::Failed)?
        else {
            break response;
        };
        if redirect_count >= MAX_REDIRECTS {
            log_security_event("download", SecurityDecision::Blocked, "redirect_limit");
            return Err(DownloadEnd::Failed(format!(
                "redirect limit exceeds {MAX_REDIRECTS}"
            )));
        }
        if !same_authority(&target.url, &next) {
            request_headers.clear();
        }
        current_url = next.to_string();
        redirect_count += 1;
    };
    let status = resp.status();
    eprintln!(
        "[harbor::download] status={} content-length={:?}",
        status.as_u16(),
        resp.content_length()
    );

    if status == reqwest::StatusCode::RANGE_NOT_SATISFIABLE && start_byte > 0 {
        let _ = tokio::fs::rename(&part, dest).await;
        let _ = on_event.send(DownloadEvent::Done { received: start_byte });
        return Ok(());
    }
    if !status.is_success() {
        eprintln!("[harbor::download] upstream rejected: HTTP {}", status.as_u16());
        return Err(DownloadEnd::Failed(format!("HTTP {}", status.as_u16())));
    }

    let content_type = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_lowercase();
    let declared = resp.content_length();
    eprintln!("[harbor::download] content-type={} content-length={:?}", content_type, declared);
    let non_video = content_type.starts_with("text/")
        || content_type.contains("html")
        || content_type.contains("json")
        || content_type.contains("xml");
    if non_video || declared.map(|n| n < 65_536).unwrap_or(false) {
        // Cap the body before decoding so a chunked deceptive response cannot
        // OOM us before we slice the 500-char preview.
        const MAX_TEXT_PREVIEW_BYTES: usize = 1024 * 1024;
        let mut buf: Vec<u8> = Vec::new();
        let mut preview_stream = resp.bytes_stream();
        while let Some(chunk) = preview_stream.next().await {
            let chunk = match chunk {
                Ok(c) => c,
                Err(_) => break,
            };
            if buf.len() >= MAX_TEXT_PREVIEW_BYTES {
                break;
            }
            let remaining = MAX_TEXT_PREVIEW_BYTES - buf.len();
            if chunk.len() <= remaining {
                buf.extend_from_slice(&chunk);
            } else {
                buf.extend_from_slice(&chunk[..remaining]);
                break;
            }
        }
        let body = String::from_utf8_lossy(&buf).into_owned();
        let snippet: String = body.chars().take(500).collect();
        eprintln!(
            "[harbor::download] NON-VIDEO response ({} bytes): {}",
            body.len(),
            snippet
        );
        return Err(DownloadEnd::Failed(format!(
            "source returned a {} page, not the video: {}",
            if content_type.is_empty() { "small" } else { content_type.as_str() },
            snippet.chars().take(160).collect::<String>()
        )));
    }

    let resuming = start_byte > 0 && status == reqwest::StatusCode::PARTIAL_CONTENT;
    let total = if resuming {
        resp.headers()
            .get(reqwest::header::CONTENT_RANGE)
            .and_then(|h| h.to_str().ok())
            .and_then(total_from_content_range)
    } else {
        resp.content_length()
    };

    let mut received = if resuming { start_byte } else { 0 };
    let file = if resuming {
        tokio::fs::OpenOptions::new().append(true).open(&part).await
    } else {
        tokio::fs::File::create(&part).await
    }
    .map_err(|e| DownloadEnd::Failed(format!("open: {}", e)))?;
    let mut writer = tokio::io::BufWriter::with_capacity(1 << 20, file);

    let _ = on_event.send(DownloadEvent::Started {
        total,
        resumed: received,
    });

    let mut stream = resp.bytes_stream();
    let mut last = Instant::now();
    let mut since: u64 = 0;
    loop {
        let next = tokio::select! {
            biased;
            _ = wait_cancelled(cancel) => {
                let _ = writer.flush().await;
                return Err(DownloadEnd::Canceled(received));
            }
            n = stream.next() => n,
        };
        let Some(chunk) = next else { break };
        let bytes = chunk.map_err(|e| DownloadEnd::Failed(format!("stream: {}", e)))?;
        writer
            .write_all(&bytes)
            .await
            .map_err(|e| DownloadEnd::Failed(format!("write: {}", e)))?;
        received += bytes.len() as u64;
        since += bytes.len() as u64;
        if last.elapsed().as_millis() >= EMIT_INTERVAL_MS || since >= EMIT_BYTES {
            let _ = on_event.send(DownloadEvent::Progress { received, total });
            last = Instant::now();
            since = 0;
        }
    }

    let _ = writer.flush().await;
    drop(writer);

    if received < MIN_VIDEO_BYTES {
        eprintln!("[harbor::download] refusing {} bytes (not a video file)", received);
        let _ = tokio::fs::remove_file(&part).await;
        return Err(DownloadEnd::Failed(format!(
            "source returned only {} bytes, not the video (try a different source)",
            received
        )));
    }

    tokio::fs::rename(&part, dest)
        .await
        .map_err(|e| DownloadEnd::Failed(format!("rename: {}", e)))?;

    eprintln!("[harbor::download] done {} bytes -> {}", received, dest);
    let _ = on_event.send(DownloadEvent::Progress { received, total });
    let _ = on_event.send(DownloadEvent::Done { received });
    Ok(())
}

async fn wait_cancelled(cancel: &Arc<AtomicBool>) {
    while !cancel.load(Ordering::Relaxed) {
        tokio::time::sleep(Duration::from_millis(150)).await;
    }
}

fn log_host(url: &str) -> String {
    match url.split_once("://") {
        Some((scheme, rest)) => format!("{}://{}/…", scheme, rest.split('/').next().unwrap_or("")),
        None => url.chars().take(48).collect(),
    }
}
