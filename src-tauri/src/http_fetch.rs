use std::collections::HashMap;
use std::future::Future;
use std::net::IpAddr;
use std::sync::Mutex;
use std::sync::OnceLock;
use std::time::Duration;

use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use futures_util::future::{AbortHandle, Abortable};
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use tokio::sync::{Semaphore, SemaphorePermit};

use crate::security::{
    is_user_private_ip, log_security_event, resolve_safe_url, resolve_user_approved_url,
    ResolvedSafeUrl,
    SecurityDecision,
    MAX_HTTP_REQUEST_BYTES as MAX_REQUEST_BYTES, MAX_HTTP_RESPONSE_BYTES as MAX_RESPONSE_BYTES,
};

const BROWSER_UA: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const DEFAULT_TIMEOUT_MS: u64 = 30_000;
const MAX_REDIRECTS: usize = 5;

/// Maximum concurrent HTTP fetch requests. This caps native work and DNS
/// lookups when the interface starts a burst of provider requests.
const MAX_CONCURRENT_FETCHES: usize = 10;

fn fetch_semaphore() -> &'static Semaphore {
    static SEM: OnceLock<Semaphore> = OnceLock::new();
    SEM.get_or_init(|| Semaphore::new(MAX_CONCURRENT_FETCHES))
}

fn active_fetches() -> &'static Mutex<HashMap<String, Option<AbortHandle>>> {
    static ACTIVE: OnceLock<Mutex<HashMap<String, Option<AbortHandle>>>> = OnceLock::new();
    ACTIVE.get_or_init(|| Mutex::new(HashMap::new()))
}

async fn acquire_fetch_permit() -> Result<SemaphorePermit<'static>, String> {
    fetch_semaphore()
        .acquire()
        .await
        .map_err(|error| format!("semaphore: {error}"))
}

async fn run_with_deadline<T>(
    duration: Duration,
    work: impl Future<Output = Result<T, String>>,
) -> Result<T, String> {
    tokio::time::timeout(duration, work)
        .await
        .unwrap_or_else(|_| Err(format!("timeout after {} ms", duration.as_millis())))
}

fn http_client(target: &ResolvedSafeUrl) -> Result<reqwest::Client, String> {
    let mut builder = reqwest::Client::builder()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(30))
        .pool_idle_timeout(Duration::from_secs(30))
        .pool_max_idle_per_host(4);
    let host = target
        .url
        .host_str()
        .ok_or_else(|| "url has no host".to_string())?;
    if host.parse::<IpAddr>().is_err() {
        builder = builder.resolve_to_addrs(host, &target.addresses);
    }
    builder.build().map_err(|e| format!("client: {e}"))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HarborFetchArgs {
    pub request_id: Option<String>,
    pub url: String,
    pub method: Option<String>,
    pub headers: Option<HashMap<String, String>>,
    pub body: Option<String>,
    pub body_base64: Option<String>,
    pub allow_private: Option<bool>,
    pub timeout_ms: Option<u64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HarborFetchResponse {
    pub status: u16,
    pub ok: bool,
    pub body: String,
    pub content_type: Option<String>,
}

#[tauri::command]
pub async fn harbor_fetch(args: HarborFetchArgs) -> Result<HarborFetchResponse, String> {
    let timeout = Duration::from_millis(args.timeout_ms.unwrap_or(DEFAULT_TIMEOUT_MS));
    let Some(request_id) = args.request_id.clone() else {
        return run_with_deadline(timeout, harbor_fetch_inner(args)).await;
    };
    let (abort_handle, abort_registration) = AbortHandle::new_pair();
    {
        let mut active = active_fetches()
            .lock()
            .map_err(|e| format!("fetch lock: {e}"))?;
        if matches!(active.remove(&request_id), Some(None)) {
            return Err("aborted".to_string());
        }
        active.insert(request_id.clone(), Some(abort_handle));
    }
    let result = run_with_deadline(timeout, async {
        Abortable::new(harbor_fetch_inner(args), abort_registration)
            .await
            .map_err(|_| "aborted".to_string())?
    })
    .await;
    if let Ok(mut active) = active_fetches().lock() {
        active.remove(&request_id);
    }
    result
}

#[tauri::command]
pub fn harbor_fetch_cancel(request_id: String) -> Result<(), String> {
    let mut active = active_fetches()
        .lock()
        .map_err(|e| format!("fetch lock: {e}"))?;
    match active.remove(&request_id) {
        Some(Some(handle)) => handle.abort(),
        Some(None) => {}
        None => {
            active.insert(request_id.clone(), None);
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(Duration::from_secs(5)).await;
                if let Ok(mut active) = active_fetches().lock() {
                    if matches!(active.get(&request_id), Some(None)) {
                        active.remove(&request_id);
                    }
                }
            });
        }
    }
    Ok(())
}

fn append_response_chunk(body: &mut Vec<u8>, chunk: &[u8], limit: usize) -> Result<(), String> {
    if body.len().saturating_add(chunk.len()) > limit {
        return Err(format!("response body exceeds {limit} bytes"));
    }
    body.extend_from_slice(chunk);
    Ok(())
}

fn same_authority(left: &url::Url, right: &url::Url) -> bool {
    left.scheme() == right.scheme()
        && left.host_str() == right.host_str()
        && left.port_or_known_default() == right.port_or_known_default()
}

fn private_authority_allowed(
    allow_private: bool,
    approved: Option<&url::Url>,
    current: &url::Url,
    redirect_count: usize,
) -> bool {
    allow_private
        && if let Some(approved) = approved {
            same_authority(approved, current)
        } else {
            redirect_count == 0
        }
}

fn redirect_target(
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
        return Err("redirect would downgrade HTTPS".to_string());
    }
    Ok(Some(next))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_body_that_exceeds_limit() {
        let mut body = Vec::new();
        append_response_chunk(&mut body, &[0; 5], 4).expect_err("oversized body must fail");
        assert!(body.is_empty());
    }

    #[test]
    fn compares_full_url_authority() {
        let a = url::Url::parse("https://example.test/a").unwrap();
        let b = url::Url::parse("https://example.test:443/b").unwrap();
        let c = url::Url::parse("https://cdn.example.test/b").unwrap();
        let d = url::Url::parse("http://example.test/b").unwrap();
        assert!(same_authority(&a, &b));
        assert!(!same_authority(&a, &c));
        assert!(!same_authority(&a, &d));
    }

    #[test]
    fn private_access_never_follows_cross_authority_redirects() {
        let local = url::Url::parse("http://192.168.1.20:8080/manifest.json").unwrap();
        let same_local = url::Url::parse("http://192.168.1.20:8080/stream").unwrap();
        let other_local = url::Url::parse("http://192.168.1.1/admin").unwrap();
        assert!(private_authority_allowed(true, None, &local, 0));
        assert!(private_authority_allowed(
            true,
            Some(&local),
            &same_local,
            1,
        ));
        assert!(!private_authority_allowed(
            true,
            Some(&local),
            &other_local,
            1,
        ));
        assert!(!private_authority_allowed(false, None, &local, 0));
    }
}

async fn harbor_fetch_inner(args: HarborFetchArgs) -> Result<HarborFetchResponse, String> {
    let _permit = acquire_fetch_permit().await?;

    let method = args.method.as_deref().unwrap_or("GET").to_uppercase();
    let parsed_method =
        reqwest::Method::from_bytes(method.as_bytes()).map_err(|e| format!("method: {}", e))?;
    let can_redirect = parsed_method == reqwest::Method::GET
        || parsed_method == reqwest::Method::HEAD
        || parsed_method == reqwest::Method::OPTIONS;
    let mut headers = args.headers.unwrap_or_default();
    let mut current_url = args.url;
    let mut redirect_count = 0usize;
    let allow_private = args.allow_private.unwrap_or(false);
    if allow_private
        && parsed_method != reqwest::Method::GET
        && parsed_method != reqwest::Method::HEAD
        && parsed_method != reqwest::Method::OPTIONS
    {
        log_security_event(
            "network",
            SecurityDecision::Blocked,
            "private_non_idempotent",
        );
        return Err("private-network requests must be idempotent".to_string());
    }
    let mut approved_private_authority: Option<url::Url> = None;
    let request_body = if let Some(encoded) = args.body_base64 {
        let bytes = B64
            .decode(encoded)
            .map_err(|_| "request body is not valid base64".to_string())?;
        if bytes.len() > MAX_REQUEST_BYTES {
            return Err(format!("request body exceeds {MAX_REQUEST_BYTES} bytes"));
        }
        Some(bytes)
    } else if let Some(body) = args.body {
        if body.len() > MAX_REQUEST_BYTES {
            return Err(format!("request body exceeds {MAX_REQUEST_BYTES} bytes"));
        }
        Some(body.into_bytes())
    } else {
        None
    };

    let res = loop {
        // SSRF gate: resolve every redirect hop, reject private ranges, then
        // pin reqwest to the approved addresses so DNS cannot change between
        // validation and connect.
        let current = url::Url::parse(&current_url).map_err(|e| format!("bad url: {e}"))?;
        let can_use_private = private_authority_allowed(
            allow_private,
            approved_private_authority.as_ref(),
            &current,
            redirect_count,
        );
        let target = if can_use_private {
            resolve_user_approved_url(&current_url).await?
        } else {
            resolve_safe_url(&current_url).await?
        };
        if redirect_count == 0
            && target
                .addresses
                .iter()
                .any(|address| is_user_private_ip(address.ip()))
        {
            approved_private_authority = Some(target.url.clone());
        }
        let client = http_client(&target)?;
        let mut req = client.request(parsed_method.clone(), target.url.clone());

        let mut has_user_agent = false;
        for (k, v) in &headers {
            if k.eq_ignore_ascii_case("user-agent") {
                has_user_agent = true;
            }
            req = req.header(k, v);
        }
        if !has_user_agent {
            req = req.header("User-Agent", BROWSER_UA);
        }
        req = req.header("Accept", "application/json, text/plain, */*");
        req = req.header("Accept-Language", "en-US,en;q=0.9");

        if let Some(body) = &request_body {
            req = req.body(body.clone());
        }

        let response = req.send().await.map_err(|e| format!("send: {e}"))?;
        let Some(next) = redirect_target(&target.url, &response).map_err(|error| {
            log_security_event("network", SecurityDecision::Blocked, "redirect_rejected");
            error
        })? else {
            break response;
        };
        if !can_redirect {
            log_security_event(
                "network",
                SecurityDecision::Blocked,
                "redirect_non_idempotent",
            );
            return Err("redirect refused for non-idempotent request".to_string());
        }
        if redirect_count >= MAX_REDIRECTS {
            log_security_event(
                "network",
                SecurityDecision::Blocked,
                "redirect_limit",
            );
            return Err(format!("redirect limit exceeds {MAX_REDIRECTS}"));
        }
        if !same_authority(&target.url, &next) {
            // Never forward caller-controlled authorization or API headers to
            // a different origin selected by a redirect response.
            headers.clear();
        }
        current_url = next.to_string();
        redirect_count += 1;
    };

    let status = res.status().as_u16();
    let ok = res.status().is_success();
    let content_type = res
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());
    if res
        .content_length()
        .is_some_and(|length| length > MAX_RESPONSE_BYTES as u64)
    {
        return Err(format!("response body exceeds {MAX_RESPONSE_BYTES} bytes"));
    }
    let mut bytes = Vec::new();
    let mut stream = res.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|error| format!("body: {error}"))?;
        append_response_chunk(&mut bytes, &chunk, MAX_RESPONSE_BYTES)?;
    }
    let body = String::from_utf8_lossy(&bytes).into_owned();

    Ok(HarborFetchResponse {
        status,
        ok,
        body,
        content_type,
    })
}
