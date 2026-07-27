use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock};

use librqbit::api::{Api, TorrentIdOrHash};
use librqbit::{ManagedTorrent, Session};

use super::correlate;
use super::extract;

#[path = "url_guard.rs"]
mod url_guard;
#[path = "torrent_windows.rs"]
mod windows;

use windows::{
    center, downloaded_frac, endpoints_ready, select_windows, Geometry, Window, MIN_LEVER_SEC,
};

const RATIO_UNIT_EPS: f32 = 0.0009;

#[allow(dead_code)]
pub enum SourceMode {
    RandomAccess,
    TorrentStream,
    RestrictedStream,
}

#[allow(dead_code)]
fn is_loopback_stream(url: &str) -> bool {
    let lower = url.to_ascii_lowercase();
    let local = lower.contains("://127.0.0.1")
        || lower.contains("://localhost")
        || lower.contains("://[::1]");
    local && lower.contains("/stream/")
}

#[allow(dead_code)]
fn is_abs_path(url: &str) -> bool {
    let b = url.as_bytes();
    (b.len() > 2 && b[1] == b':' && (b[2] == b'/' || b[2] == b'\\')) || url.starts_with('/')
}

#[allow(dead_code)]
pub fn classify(url: &str, info_hash: Option<&str>) -> SourceMode {
    let has_hash = info_hash.map(|h| !h.is_empty()).unwrap_or(false);
    if is_loopback_stream(url) && has_hash {
        return SourceMode::TorrentStream;
    }
    if url.starts_with("file://") || is_abs_path(url) {
        return SourceMode::RandomAccess;
    }
    if url.to_ascii_lowercase().contains(".m3u8") {
        return SourceMode::RestrictedStream;
    }
    if url.starts_with("http://") || url.starts_with("https://") {
        return SourceMode::RandomAccess;
    }
    SourceMode::RestrictedStream
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TorrentAvailability {
    pub windows: Vec<Window>,
    pub head_ready: bool,
    pub tail_ready: bool,
    pub downloaded_frac: f32,
    pub late_region_ready: bool,
    pub file_len: u64,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TorrentSyncOut {
    pub offset_sec: f32,
    pub ratio: f32,
    pub confidence: f32,
    pub lever_sec: f32,
    pub windows: usize,
    pub ratio_locked: bool,
}

fn read_geometry(handle: &Arc<ManagedTorrent>, file_idx: usize) -> Option<Geometry> {
    handle
        .with_metadata(|m| {
            let fi = m.file_infos.get(file_idx)?;
            Some(Geometry {
                total_pieces: m.lengths.total_pieces(),
                piece_len: m.lengths.default_piece_length() as u64,
                total_len: m.lengths.total_length(),
                file_offset: fi.offset_in_torrent,
                file_len: fi.len,
            })
        })
        .ok()
        .flatten()
}

fn read_haves(session: Arc<Session>, id: TorrentIdOrHash, geo: &Geometry) -> Option<Vec<u8>> {
    let api = Api::new(session, None);
    let dump = api.api_dump_haves(id).ok()?;
    let bytes = windows::parse_have_bytes(&dump)?;
    let need = (geo.total_pieces as usize + 7) / 8;
    if bytes.len() < need {
        return None;
    }
    Some(bytes)
}

fn lookup(info_hash: &str, file_idx: usize) -> Result<(Geometry, Vec<u8>), String> {
    let session = crate::torrent_engine::current_session().ok_or("engine not ready")?;
    let id = TorrentIdOrHash::parse(info_hash).map_err(|e| e.to_string())?;
    let handle = session.get(id).ok_or("no torrent")?;
    let geo = read_geometry(&handle, file_idx).ok_or("no metadata")?;
    let haves = read_haves(session, id, &geo).ok_or("availability unavailable")?;
    Ok((geo, haves))
}

type MaskCache = Mutex<HashMap<(String, usize), (String, Vec<(f32, f32)>)>>;

fn mask_cache() -> &'static MaskCache {
    static CACHE: OnceLock<MaskCache> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn window_sig(wins: &[Window]) -> String {
    let mut s = String::new();
    for w in wins {
        s.push_str(&format!(
            "{}:{};",
            w.start_sec.round() as i64,
            w.len_sec.round() as i64
        ));
    }
    s
}

fn cached_mask(info_hash: &str, file_idx: usize, sig: &str) -> Option<Vec<(f32, f32)>> {
    let cache = mask_cache().lock().unwrap();
    let (stored, mask) = cache.get(&(info_hash.to_string(), file_idx))?;
    if stored == sig {
        Some(mask.clone())
    } else {
        None
    }
}

fn store_mask(info_hash: &str, file_idx: usize, sig: String, mask: Vec<(f32, f32)>) {
    let mut cache = mask_cache().lock().unwrap();
    cache.insert((info_hash.to_string(), file_idx), (sig, mask));
}

#[tauri::command]
pub async fn torrent_sync_availability(
    info_hash: String,
    file_idx: usize,
    duration_sec: f32,
) -> Result<TorrentAvailability, String> {
    let (geo, haves) = lookup(&info_hash, file_idx)?;
    let wins = select_windows(&haves, &geo, duration_sec, true, -1.0);
    let (head_ready, tail_ready) = endpoints_ready(&haves, &geo);
    Ok(TorrentAvailability {
        late_region_ready: wins.len() == 2,
        windows: wins,
        head_ready,
        tail_ready,
        downloaded_frac: downloaded_frac(&haves, &geo),
        file_len: geo.file_len,
    })
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn torrent_sync_subtitle(
    app: tauri::AppHandle,
    info_hash: String,
    file_idx: usize,
    url: String,
    headers: Option<HashMap<String, String>>,
    cues: Vec<[f32; 2]>,
    duration_sec: f32,
    conf_min: Option<f32>,
    want_late: Option<bool>,
    position_sec: Option<f32>,
) -> Result<Option<TorrentSyncOut>, String> {
    if !crate::transcode::ffmpeg_present() {
        return Err("ffmpeg-unavailable".into());
    }
    url_guard::validate_media_source(&app, &url, true)?;
    if cues.len() < 4 || duration_sec < 60.0 {
        return Ok(None);
    }
    let (geo, haves) = lookup(&info_hash, file_idx)?;
    let wins = select_windows(
        &haves,
        &geo,
        duration_sec,
        want_late.unwrap_or(true),
        position_sec.unwrap_or(-1.0),
    );
    if wins.is_empty() {
        return Ok(None);
    }

    let hdrs = headers.unwrap_or_default();
    let mut audio: Vec<(f32, f32)> = Vec::new();
    for w in &wins {
        if let Ok(iv) = extract::speech_intervals(&url, &hdrs, w.start_sec, w.len_sec).await {
            audio.extend(iv);
        }
    }
    if audio.is_empty() {
        return Ok(None);
    }

    let cue_pairs: Vec<(f32, f32)> = cues.iter().map(|c| (c[0], c[1])).collect();
    let Some(res) = correlate::solve(&audio, &cue_pairs, duration_sec, conf_min.unwrap_or(0.55))
    else {
        return Ok(None);
    };

    let lever = if wins.len() == 2 {
        (center(&wins[1]) - center(&wins[0])).abs()
    } else {
        0.0
    };
    let short_lever = lever < MIN_LEVER_SEC;
    if short_lever && (res.ratio - 1.0).abs() > RATIO_UNIT_EPS {
        return Ok(None);
    }

    Ok(Some(TorrentSyncOut {
        offset_sec: res.offset_sec,
        ratio: res.ratio,
        confidence: res.confidence,
        lever_sec: lever,
        windows: wins.len(),
        ratio_locked: short_lever,
    }))
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn torrent_score_transform(
    app: tauri::AppHandle,
    info_hash: String,
    file_idx: usize,
    url: String,
    headers: Option<HashMap<String, String>>,
    cues: Vec<[f32; 2]>,
    duration_sec: f32,
    offset_sec: f32,
    ratio: f32,
    position_sec: Option<f32>,
) -> Result<Option<correlate::AlignmentQuality>, String> {
    if !crate::transcode::ffmpeg_present() {
        return Err("ffmpeg-unavailable".into());
    }
    url_guard::validate_media_source(&app, &url, true)?;
    if cues.len() < 4 || duration_sec < 60.0 {
        return Ok(None);
    }
    let (geo, haves) = lookup(&info_hash, file_idx)?;
    let wins = select_windows(
        &haves,
        &geo,
        duration_sec,
        true,
        position_sec.unwrap_or(-1.0),
    );
    if wins.is_empty() {
        return Ok(None);
    }
    let sig = window_sig(&wins);

    let audio = match cached_mask(&info_hash, file_idx, &sig) {
        Some(mask) => mask,
        None => {
            let hdrs = headers.unwrap_or_default();
            let mut fresh: Vec<(f32, f32)> = Vec::new();
            for w in &wins {
                if let Ok(iv) = extract::speech_intervals(&url, &hdrs, w.start_sec, w.len_sec).await
                {
                    fresh.extend(iv);
                }
            }
            if fresh.is_empty() {
                return Ok(None);
            }
            store_mask(&info_hash, file_idx, sig, fresh.clone());
            fresh
        }
    };

    let cue_pairs: Vec<(f32, f32)> = cues.iter().map(|c| (c[0], c[1])).collect();
    let quality = correlate::score_affine(&audio, &cue_pairs, duration_sec, offset_sec, ratio);
    Ok(Some(quality))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classify_distinguishes_torrent_from_debrid() {
        assert!(matches!(
            classify("http://127.0.0.1:5312/stream/abc/0", Some("abc")),
            SourceMode::TorrentStream
        ));
        assert!(matches!(
            classify("https://real-debrid.download/d/XYZ/file.mkv", Some("abc")),
            SourceMode::RandomAccess
        ));
        assert!(matches!(
            classify("file:///m/x.mkv", None),
            SourceMode::RandomAccess
        ));
        assert!(matches!(
            classify("https://cdn.example.com/master.m3u8", None),
            SourceMode::RestrictedStream
        ));
    }

    #[test]
    fn window_sig_changes_with_window_set() {
        let a = vec![Window {
            start_sec: 30.0,
            len_sec: 600.0,
        }];
        let b = vec![
            Window {
                start_sec: 30.0,
                len_sec: 600.0,
            },
            Window {
                start_sec: 5000.0,
                len_sec: 600.0,
            },
        ];
        assert_ne!(window_sig(&a), window_sig(&b));
        assert_eq!(window_sig(&a), window_sig(&a.clone()));
    }
}
