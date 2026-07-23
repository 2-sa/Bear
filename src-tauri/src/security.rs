//! Shared security primitives for the Harbor native surface.
//!
//! Centralizes SSRF rejection, destination path canonicalization, and shared
//! response-size constants so that `http_fetch`, `download`, `save_text_file`,
//! and the torrent engine cannot drift apart. Anything that crosses a trust
//! boundary (the WebView, remote addon stream URLs, the cast SDK) must funnel
//! through here before touching the network or filesystem.

use std::net::{IpAddr, SocketAddr};
use std::path::{Component, Path, PathBuf};
use std::sync::mpsc::{sync_channel, SyncSender, TrySendError};
use std::sync::OnceLock;

use tauri::{AppHandle, Manager};

/// Maximum response body accepted from a remote HTTP source. Reused by
/// `http_fetch` and `download` so the cap cannot drift.
pub const MAX_HTTP_RESPONSE_BYTES: usize = 16 * 1024 * 1024;
pub const MAX_HTTP_REQUEST_BYTES: usize = 16 * 1024 * 1024;

const SECURITY_LOG_CAPACITY: usize = 256;

#[derive(Clone, Copy)]
pub enum SecurityDecision {
    Allowed,
    Blocked,
    Failed,
}

impl SecurityDecision {
    fn as_str(self) -> &'static str {
        match self {
            Self::Allowed => "allowed",
            Self::Blocked => "blocked",
            Self::Failed => "failed",
        }
    }
}

struct SecurityEvent {
    category: &'static str,
    decision: SecurityDecision,
    reason: &'static str,
}

fn security_log_sender() -> &'static SyncSender<SecurityEvent> {
    static SENDER: OnceLock<SyncSender<SecurityEvent>> = OnceLock::new();
    SENDER.get_or_init(|| {
        let (sender, receiver) = sync_channel::<SecurityEvent>(SECURITY_LOG_CAPACITY);
        let _ = std::thread::Builder::new()
            .name("harbor-security-log".to_string())
            .spawn(move || {
                while let Ok(event) = receiver.recv() {
                    eprintln!(
                        "[harbor::security] category={} decision={} reason={}",
                        event.category,
                        event.decision.as_str(),
                        event.reason
                    );
                }
            });
        sender
    })
}

/// Best-effort security logging. The caller never waits for disk or console
/// output, and event fields must be fixed redacted labels rather than user
/// input, URLs, headers, tokens, or payloads.
pub fn log_security_event(
    category: &'static str,
    decision: SecurityDecision,
    reason: &'static str,
) {
    match security_log_sender().try_send(SecurityEvent {
        category,
        decision,
        reason,
    }) {
        Ok(()) | Err(TrySendError::Full(_)) => {}
        Err(TrySendError::Disconnected(_)) => {
            // Logging must never block or fail the guarded operation.
        }
    }
}

/// Returns `Ok(url)` only if every resolved address for the host is outside
/// SSRF-relevant private ranges. Performs the lookup up-front so a hostname
/// that resolves to loopback / link-local / RFC1918 / CGNAT / cloud-metadata
/// is rejected before `reqwest` opens the connection.
pub async fn assert_safe_url(raw: &str) -> Result<url::Url, String> {
    Ok(resolve_safe_url(raw).await?.url)
}

pub struct ResolvedSafeUrl {
    pub url: url::Url,
    pub addresses: Vec<SocketAddr>,
}

/// Resolves and validates a URL while retaining the approved socket
/// addresses. Native HTTP callers can pin reqwest to these addresses so DNS
/// cannot change between this security decision and the TCP connection.
pub async fn resolve_safe_url(raw: &str) -> Result<ResolvedSafeUrl, String> {
    resolve_url(raw, false).await
}

/// Resolve a URL explicitly supplied by the user for a local addon or media
/// service. Only literal loopback/RFC1918/ULA addresses and localhost are
/// admitted; arbitrary hostnames may not resolve into private space.
pub async fn resolve_user_approved_url(raw: &str) -> Result<ResolvedSafeUrl, String> {
    resolve_url(raw, true).await
}

async fn resolve_url(
    raw: &str,
    allow_user_private: bool,
) -> Result<ResolvedSafeUrl, String> {
    let url = url::Url::parse(raw).map_err(|e| format!("bad url: {e}"))?;
    let scheme = url.scheme();
    if scheme != "http" && scheme != "https" {
        return Err(format!("disallowed scheme: {scheme}"));
    }
    let host = url
        .host_str()
        .ok_or_else(|| "url has no host".to_string())?
        .trim_start_matches('[')
        .trim_end_matches(']');
    let port = url
        .port_or_known_default()
        .ok_or_else(|| "url has no known port".to_string())?;
    if let Ok(ip) = host.parse::<IpAddr>() {
        if is_blocked_ip(ip) && !(allow_user_private && is_user_private_ip(ip)) {
            log_security_event("network", SecurityDecision::Blocked, "private_ip");
            return Err(format!("blocked private address: {ip}"));
        }
        return Ok(ResolvedSafeUrl {
            url,
            addresses: vec![SocketAddr::new(ip, port)],
        });
    }
    let localhost = allow_user_private && host.trim_end_matches('.').eq_ignore_ascii_case("localhost");
    let key = format!("{host}:{port}");
    let resolved = tokio::net::lookup_host(&key)
        .await
        .map_err(|e| format!("dns lookup for {host}: {e}"))?;
    let mut addresses = Vec::new();
    for addr in resolved {
        let ip = addr.ip();
        if is_blocked_ip(ip) && !(localhost && ip.is_loopback()) {
            log_security_event("network", SecurityDecision::Blocked, "private_dns");
            return Err(format!("blocked resolved address for {host}: {ip}"));
        }
        if !addresses.contains(&addr) {
            addresses.push(addr);
        }
    }
    if addresses.is_empty() {
        return Err(format!("no address resolved for {host}"));
    }
    Ok(ResolvedSafeUrl { url, addresses })
}

pub(crate) fn is_user_private_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => v4.is_loopback() || v4.is_private(),
        IpAddr::V6(v6) => v6.is_loopback() || is_ipv6_unique_local(&v6),
    }
}

/// True if `ip` is in any range that should never be reachable from a
/// WebView-initiated fetch (loopback, RFC1918, link-local, CGNAT,
/// unspecified, broadcast, IPv6-mapped-v4 of the above).
pub fn is_blocked_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            v4.is_loopback()
                || v4.is_private()
                || v4.is_link_local()
                || v4.is_unspecified()
                || v4.is_broadcast()
                || v4.is_multicast()
                || v4.is_documentation()
                || is_cgnat_v4(&v4)
                || is_benchmark_v4(&v4)
        }
        IpAddr::V6(v6) => {
            v6.is_loopback()
                || v6.is_unspecified()
                || v6.is_multicast()
                || is_ipv6_link_local(&v6)
                || is_ipv6_unique_local(&v6)
                || is_ipv4_mapped_v6_blocked(&v6)
        }
    }
}

fn is_cgnat_v4(v4: &std::net::Ipv4Addr) -> bool {
    let o = v4.octets();
    // 100.64.0.0/10 — RFC 6598 carrier-grade NAT.
    o[0] == 100 && (o[1] & 0xc0) == 64
}

fn is_benchmark_v4(v4: &std::net::Ipv4Addr) -> bool {
    let o = v4.octets();
    o[0] == 198 && (o[1] == 18 || o[1] == 19)
}

fn is_ipv6_link_local(v6: &std::net::Ipv6Addr) -> bool {
    let o = v6.octets();
    o[0] == 0xfe && (o[1] & 0xc0) == 0x80
}

fn is_ipv6_unique_local(v6: &std::net::Ipv6Addr) -> bool {
    v6.octets()[0] & 0xfe == 0xfc
}

fn is_ipv4_mapped_v6_blocked(v6: &std::net::Ipv6Addr) -> bool {
    let o = v6.octets();
    let mapped = o[0..10].iter().all(|b| *b == 0) && o[10] == 0xff && o[11] == 0xff;
    if !mapped {
        return false;
    }
    let v4 = std::net::Ipv4Addr::new(o[12], o[13], o[14], o[15]);
    is_blocked_ip(IpAddr::V4(v4))
}

/// Reject any path containing lexing `..` components — these can escape the
/// parent regardless of canonicalization (which is also performed later).
pub fn reject_traversal(path: &Path) -> Result<(), String> {
    if path
        .components()
        .any(|c| matches!(c, Component::ParentDir))
    {
        return Err(format!("path contains '..': {}", path.display()));
    }
    Ok(())
}

/// Resolve `dest` to a canonical path and require it to be inside one of the
/// app-owned or user-media directories. Symlinks that escape the allowlist
/// are caught because the canonicalized target is checked.
pub fn assert_safe_dest(app: &AppHandle, raw: &str) -> Result<PathBuf, String> {
    let path = Path::new(raw);
    reject_traversal(path)?;
    let candidate = best_effort_canonicalize(path);
    let roots = media_roots(app);
    if roots.iter().any(|root| candidate.starts_with(root)) {
        return Ok(candidate);
    }
    Err(format!(
        "destination '{}' is outside the allowed media/data directories",
        candidate.display()
    ))
}

/// Resolve `dest` for `save_text_file` to app-owned, media, and temp
/// directories. Unlike `assert_safe_dest` (which targets binary downloads),
/// this accepts any filename because subtitle files have dynamic names
/// (e.g. `autosync-{timestamp}.srt`). The directory-root scoping prevents a
/// compromised frontend from planting files in system locations (`~/.ssh/`,
/// `C:\Windows\`, `/etc/`). The path must still pass traversal rejection.
pub fn assert_safe_text_dest(app: &AppHandle, raw: &str) -> Result<PathBuf, String> {
    let path = Path::new(raw);
    reject_traversal(path)?;
    let candidate = best_effort_canonicalize(path);
    let parent = candidate
        .parent()
        .ok_or_else(|| "save_text_file: destination has no parent".to_string())?;
    let roots = media_roots(app);
    if roots.iter().any(|root| parent.starts_with(root)) {
        return Ok(candidate);
    }
    Err(format!(
        "save_text_file: destination '{}' is outside allowed media/data/temp directories",
        candidate.display()
    ))
}

/// Returns the configured torrent cache root (`cfg.dir` joined with the
/// canonical `harbor-stream-cache` leaf) restricted to the app data dir if
/// `cfg.dir` is unset, or rejected if the configured path is not within a
/// known media/data directory.
pub fn assert_safe_engine_dir(app: &AppHandle, cfg_dir: Option<&str>) -> Result<PathBuf, String> {
    if let Some(custom) = cfg_dir.map(str::trim).filter(|s| !s.is_empty()) {
        let path = Path::new(custom);
        reject_traversal(path)?;
        let canonical = best_effort_canonicalize(path);
        let roots = media_roots(app);
        if !roots.iter().any(|root| canonical.starts_with(root)) {
            return Err(format!(
                "torrent engine dir '{}' is outside the allowed media/data directories",
                canonical.display()
            ));
        }
        return Ok(canonical.join("harbor-stream-cache"));
    }
    app.path()
        .app_cache_dir()
        .map(|d| d.join("engine"))
        .map_err(|e| e.to_string())
}

fn media_roots(app: &AppHandle) -> Vec<PathBuf> {
    let mut roots = app_roots(app);
    let path = app.path();
    for root in [
        path.download_dir(),
        path.video_dir(),
        path.audio_dir(),
        path.picture_dir(),
        path.document_dir(),
        path.desktop_dir(),
        path.public_dir(),
        path.temp_dir(),
    ] {
        if let Ok(r) = root {
            push_canonical(&mut roots, r);
        }
    }
    roots
}

fn app_roots(app: &AppHandle) -> Vec<PathBuf> {
    let mut roots = Vec::new();
    let path = app.path();
    for root in [
        path.app_cache_dir(),
        path.app_config_dir(),
        path.app_data_dir(),
        path.app_local_data_dir(),
    ] {
        if let Ok(r) = root {
            push_canonical(&mut roots, r);
        }
    }
    roots
}

fn push_canonical(roots: &mut Vec<PathBuf>, root: PathBuf) {
    if let Ok(c) = std::fs::canonicalize(&root) {
        roots.push(c);
    } else {
        roots.push(root);
    }
}

/// Canonicalize as far as the filesystem allows. For non-existent leaves
/// (the common download case where the file does not exist yet), append the
/// remainder lexically so the returned path is still comparable against
/// allowlist roots.
fn best_effort_canonicalize(path: &Path) -> PathBuf {
    if let Ok(c) = std::fs::canonicalize(path) {
        return c;
    }
    let mut head = PathBuf::new();
    let mut tail = PathBuf::new();
    for comp in path.components() {
        if tail.as_os_str().is_empty() {
            head.push(comp.as_os_str());
            if let Ok(c) = std::fs::canonicalize(&head) {
                head = c;
            }
        } else {
            tail.push(comp.as_os_str());
        }
    }
    if tail.as_os_str().is_empty() {
        head
    } else {
        head.join(tail)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn blocks_loopback_and_private_v4() {
        assert!(is_blocked_ip("127.0.0.1".parse().unwrap()));
        assert!(is_blocked_ip("10.0.0.1".parse().unwrap()));
        assert!(is_blocked_ip("192.168.1.1".parse().unwrap()));
        assert!(is_blocked_ip("172.16.0.1".parse().unwrap()));
        assert!(is_blocked_ip("169.254.169.254".parse().unwrap()));
        assert!(is_blocked_ip("100.64.0.1".parse().unwrap()));
        assert!(is_blocked_ip("0.0.0.0".parse().unwrap()));
        assert!(is_blocked_ip("198.18.0.1".parse().unwrap()));
        assert!(is_blocked_ip("224.0.0.1".parse().unwrap()));
        assert!(!is_blocked_ip("1.1.1.1".parse().unwrap()));
        assert!(!is_blocked_ip("8.8.8.8".parse().unwrap()));
    }

    #[test]
    fn blocks_ipv6_loopback_and_mapped_private() {
        assert!(is_blocked_ip("::1".parse().unwrap()));
        assert!(is_blocked_ip("::ffff:127.0.0.1".parse().unwrap()));
        assert!(is_blocked_ip("fe80::1".parse().unwrap()));
        assert!(is_blocked_ip("fd00::1".parse().unwrap()));
        assert!(!is_blocked_ip("2606:4700:4700::1111".parse().unwrap()));
    }

    #[test]
    fn user_private_policy_is_narrow() {
        assert!(is_user_private_ip("127.0.0.1".parse().unwrap()));
        assert!(is_user_private_ip("192.168.1.20".parse().unwrap()));
        assert!(is_user_private_ip("fd00::1".parse().unwrap()));
        assert!(!is_user_private_ip("169.254.169.254".parse().unwrap()));
        assert!(!is_user_private_ip("100.64.0.1".parse().unwrap()));
        assert!(!is_user_private_ip("8.8.8.8".parse().unwrap()));
    }

    #[test]
    fn traversal_is_rejected_lexically() {
        reject_traversal(Path::new("/tmp/../etc/passwd")).expect_err("must reject");
        reject_traversal(Path::new("/tmp/ok.bin")).expect("must allow");
    }
}
