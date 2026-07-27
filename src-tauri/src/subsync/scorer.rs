use std::collections::HashMap;

use super::correlate::{self, AlignmentQuality};
use super::extract;

#[path = "url_guard.rs"]
mod url_guard;

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PieceSeg {
    from_sec: f32,
    to_sec: f32,
    offset_sec: f32,
    ratio: f32,
}

#[derive(serde::Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub(crate) enum ScoreTransform {
    #[serde(rename_all = "camelCase")]
    Affine {
        offset_sec: f32,
        ratio: f32,
    },
    Piecewise {
        segments: Vec<PieceSeg>,
    },
}

fn analysis_windows(dur: f32) -> Vec<(f32, f32)> {
    if dur < 900.0 {
        let start = (dur * 0.05).max(5.0);
        let len = (dur * 0.9 - start).max(30.0);
        return vec![(start, len)];
    }
    let early = (180.0f32, 600.0f32);
    let late_len = 600.0f32;
    let late_start = (dur - late_len - 120.0).max(early.0 + early.1);
    vec![early, (late_start, late_len)]
}

fn apply_piecewise(cues: &[(f32, f32)], segs: &[PieceSeg]) -> Vec<(f32, f32)> {
    if segs.is_empty() {
        return cues.to_vec();
    }
    let last = &segs[segs.len() - 1];
    cues.iter()
        .map(|&(a, b)| {
            let seg = segs
                .iter()
                .find(|g| a >= g.from_sec && a < g.to_sec)
                .unwrap_or(last);
            (
                seg.ratio * a + seg.offset_sec,
                seg.ratio * b + seg.offset_sec,
            )
        })
        .collect()
}

async fn decode_speech(
    url: &str,
    headers: &HashMap<String, String>,
    duration_sec: f32,
) -> Vec<(f32, f32)> {
    let mut audio: Vec<(f32, f32)> = Vec::new();
    for (start, len) in analysis_windows(duration_sec) {
        if let Ok(iv) = extract::speech_intervals(url, headers, start, len).await {
            audio.extend(iv);
        }
    }
    audio
}

#[tauri::command]
pub async fn subsync_score_transform(
    app: tauri::AppHandle,
    url: String,
    headers: Option<HashMap<String, String>>,
    cues: Vec<[f32; 2]>,
    duration_sec: f32,
    transform: ScoreTransform,
) -> Result<Option<AlignmentQuality>, String> {
    if !crate::transcode::ffmpeg_present() {
        return Err("ffmpeg-unavailable".into());
    }
    url_guard::validate_media_source(&app, &url, true)?;
    if cues.len() < 4 || duration_sec < 60.0 {
        return Ok(None);
    }
    let hdrs = headers.unwrap_or_default();
    let audio = decode_speech(&url, &hdrs, duration_sec).await;
    if audio.is_empty() {
        return Ok(None);
    }
    let cue_pairs: Vec<(f32, f32)> = cues.iter().map(|c| (c[0], c[1])).collect();
    let quality = match transform {
        ScoreTransform::Affine { offset_sec, ratio } => {
            correlate::score_affine(&audio, &cue_pairs, duration_sec, offset_sec, ratio)
        }
        ScoreTransform::Piecewise { segments } => {
            let corrected = apply_piecewise(&cue_pairs, &segments);
            correlate::score_affine(&audio, &corrected, duration_sec, 0.0, 1.0)
        }
    };
    Ok(Some(quality))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn windows_short_and_long() {
        assert_eq!(analysis_windows(600.0).len(), 1);
        assert_eq!(analysis_windows(5400.0).len(), 2);
    }

    #[test]
    fn piecewise_applies_segment_by_start() {
        let cues = vec![(10.0f32, 12.0f32), (100.0f32, 102.0f32)];
        let segs = vec![
            PieceSeg {
                from_sec: 0.0,
                to_sec: 50.0,
                offset_sec: 1.0,
                ratio: 1.0,
            },
            PieceSeg {
                from_sec: 50.0,
                to_sec: 1000.0,
                offset_sec: 5.0,
                ratio: 1.0,
            },
        ];
        let out = apply_piecewise(&cues, &segs);
        assert_eq!(out[0], (11.0, 13.0));
        assert_eq!(out[1], (105.0, 107.0));
    }

    #[test]
    fn piecewise_empty_is_identity() {
        let cues = vec![(3.0f32, 4.0f32)];
        assert_eq!(apply_piecewise(&cues, &[]), cues);
    }
}
