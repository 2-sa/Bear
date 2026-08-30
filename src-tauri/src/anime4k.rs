use sha2::{Digest, Sha256};
use std::path::PathBuf;
use tauri::Manager;

const BASE: &str = "https://raw.githubusercontent.com/bloc97/Anime4K/7684e9586f8dcc738af08a1cdceb024cc184f426/glsl";

struct ShaderFile {
    remote: &'static str,
    local: &'static str,
    sha256: &'static str,
}

const FILES: &[ShaderFile] = &[
    ShaderFile { remote: "Restore/Anime4K_Clamp_Highlights.glsl", local: "Anime4K_Clamp_Highlights.glsl", sha256: "a2a9bf7fbc1d75d09660ca2e701e4d7fb0cf5457b94da47e1825032fa2b3671a" },
    ShaderFile { remote: "Restore/Anime4K_Restore_CNN_VL.glsl", local: "Anime4K_Restore_CNN_VL.glsl", sha256: "35036722733305cd4d4e57660b883bbe2569ba2914033c254327107d7b77e35e" },
    ShaderFile { remote: "Restore/Anime4K_Restore_CNN_M.glsl", local: "Anime4K_Restore_CNN_M.glsl", sha256: "67ea3ed26539e8de3b7d307688535d2ff17e8d147e11dda0247da7770dbecf41" },
    ShaderFile { remote: "Restore/Anime4K_Restore_CNN_Soft_VL.glsl", local: "Anime4K_Restore_CNN_Soft_VL.glsl", sha256: "094334b0e20c1a201fe4941c7c68de72451e5aee9efb5524d7fb82b12dca64b9" },
    ShaderFile { remote: "Restore/Anime4K_Restore_CNN_Soft_M.glsl", local: "Anime4K_Restore_CNN_Soft_M.glsl", sha256: "a78a2c76898e08e09e442a9628c64208c26e8e15789649b8755223f009794c02" },
    ShaderFile { remote: "Upscale/Anime4K_Upscale_CNN_x2_VL.glsl", local: "Anime4K_Upscale_CNN_x2_VL.glsl", sha256: "5638fe31c37c151a3443fea3451a3ef91af073f4dbb9615f6c0d1e29db11493d" },
    ShaderFile { remote: "Upscale/Anime4K_Upscale_CNN_x2_M.glsl", local: "Anime4K_Upscale_CNN_x2_M.glsl", sha256: "716e02098a68f0d648761f2b96b4dd139e1cb09b174bb369fca3aa34328fff7e" },
    ShaderFile { remote: "Upscale%2BDenoise/Anime4K_Upscale_Denoise_CNN_x2_VL.glsl", local: "Anime4K_Upscale_Denoise_CNN_x2_VL.glsl", sha256: "359c48fe5a317fbc6b706ce368401eef496e84ed98abac7a43efebca2b65d79b" },
    ShaderFile { remote: "Upscale%2BDenoise/Anime4K_Upscale_Denoise_CNN_x2_M.glsl", local: "Anime4K_Upscale_Denoise_CNN_x2_M.glsl", sha256: "8c72b042e2301fe66a45c3089720459148e2504cd72af16f9c0d5017ff14181e" },
    ShaderFile { remote: "Upscale/Anime4K_AutoDownscalePre_x2.glsl", local: "Anime4K_AutoDownscalePre_x2.glsl", sha256: "8c58291740146bd766a4d73f132775a797fe80f7d07919b5d767e27a5dc85656" },
    ShaderFile { remote: "Upscale/Anime4K_AutoDownscalePre_x4.glsl", local: "Anime4K_AutoDownscalePre_x4.glsl", sha256: "5af62d8cd844916dc1126613e13bad3beab195787f93a71200b47c6ec78f2e41" },
];

fn sha256_matches(bytes: &[u8], expected_sha256: &str) -> bool {
    format!("{:x}", Sha256::digest(bytes)) == expected_sha256
}

fn file_matches(path: &std::path::Path, expected: &str) -> bool {
    std::fs::read(path)
        .map(|bytes| sha256_matches(&bytes, expected))
        .unwrap_or(false)
}

fn shaders_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let base = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(base.join("anime4k"))
}

#[tauri::command]
pub fn anime4k_dir(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let dir = shaders_dir(&app)?;
    let complete = FILES
        .iter()
        .all(|file| file_matches(&dir.join(file.local), file.sha256));
    if complete {
        Ok(Some(dir.to_string_lossy().into_owned()))
    } else {
        Ok(None)
    }
}

#[tauri::command]
pub async fn anime4k_download(app: tauri::AppHandle, force: bool) -> Result<String, String> {
    if !crate::security_policy::known_shader_downloads_enabled() {
        return Err("remote shader downloads are disabled by security policy".into());
    }
    let dir = shaders_dir(&app)?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("create dir: {}", e))?;
    let client = reqwest::Client::builder()
        .user_agent("Bear")
        .build()
        .map_err(|e| e.to_string())?;
    for file in FILES {
        let dest = dir.join(file.local);
        if !force && file_matches(&dest, file.sha256) {
            continue;
        }
        let url = format!("{}/{}", BASE, file.remote);
        let resp = client
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("download {}: {}", file.local, e))?;
        if !resp.status().is_success() {
            return Err(format!("download {}: HTTP {}", file.local, resp.status()));
        }
        let bytes = resp
            .bytes()
            .await
            .map_err(|e| format!("read {}: {}", file.local, e))?;
        if !sha256_matches(&bytes, file.sha256) {
            return Err(format!("{} failed SHA-256 checksum verification", file.local));
        }
        std::fs::write(&dest, &bytes).map_err(|e| format!("write {}: {}", file.local, e))?;
    }
    Ok(dir.to_string_lossy().into_owned())
}
