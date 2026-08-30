use sha2::{Digest, Sha256};
use std::path::PathBuf;
use tauri::Manager;

struct ShaderFile {
    url: &'static str,
    local: &'static str,
    sha256: &'static str,
}

struct Pack {
    id: &'static str,
    files: &'static [ShaderFile],
}

const PACKS: &[Pack] = &[
    Pack {
        id: "fsrcnnx",
        files: &[
            ShaderFile { url: "https://github.com/igv/FSRCNN-TensorFlow/releases/download/1.1/FSRCNNX_x2_16-0-4-1.glsl", local: "FSRCNNX_x2_16-0-4-1.glsl", sha256: "d5a24a271e5d9a3f7f7a053b150c460a44c25b3cf7f770857d57cc3a2e1c9965" },
            ShaderFile { url: "https://github.com/igv/FSRCNN-TensorFlow/releases/download/1.1/FSRCNNX_x2_8-0-4-1.glsl", local: "FSRCNNX_x2_8-0-4-1.glsl", sha256: "e800dbc5c1c95185cc82216c597724533ff5f2880179f256eef600f03e8dc2ae" },
        ],
    },
    Pack {
        id: "fsr",
        files: &[ShaderFile { url: "https://gist.githubusercontent.com/agyild/82219c545228d70c5604f865ce0b0ce5/raw/2623d743b9c23f500ba086f05b385dcb1557e15d/FSR.glsl", local: "FSR.glsl", sha256: "56d8597fc6b7bf6d13f8c3b2bdf1cdc43b06175d51746aab44cf1dca16929b9e" }],
    },
    Pack {
        id: "cas",
        files: &[
            ShaderFile { url: "https://gist.githubusercontent.com/agyild/bbb4e58298b2f86aa24da3032a0d2ee6/raw/10e4ca1b6ef173b64391ce2c81b9a95fcd095931/CAS.glsl", local: "CAS.glsl", sha256: "a945e104f1c7dfa9ffff447e14ea94f661e87f96010df79e1e8a0da2899a9823" },
            ShaderFile { url: "https://gist.githubusercontent.com/agyild/bbb4e58298b2f86aa24da3032a0d2ee6/raw/10e4ca1b6ef173b64391ce2c81b9a95fcd095931/CAS-scaled.glsl", local: "CAS-scaled.glsl", sha256: "fe678abb821e72f839f3f3a6af0105c543a1a9d9ae6c927185cfd400cebab217" },
        ],
    },
    Pack {
        id: "nis",
        files: &[
            ShaderFile { url: "https://gist.githubusercontent.com/agyild/7e8951915b2bf24526a9343d951db214/raw/05f00864228871ffd157daa9beb2db8fa7412cfa/NVScaler.glsl", local: "NVScaler.glsl", sha256: "bac778ec0108d272e4dad97794a3c257e65bbebd52aa762f95bce930cbd6b73c" },
            ShaderFile { url: "https://gist.githubusercontent.com/agyild/7e8951915b2bf24526a9343d951db214/raw/05f00864228871ffd157daa9beb2db8fa7412cfa/NVSharpen.glsl", local: "NVSharpen.glsl", sha256: "3d51ac2a9da18284c1f77e46a019e783eac0c609924e6b32e8011889f54f9a12" },
        ],
    },
    Pack {
        id: "sgsr",
        files: &[ShaderFile { url: "https://gist.githubusercontent.com/agyild/7715b6b1f38427839d58f80884902cab/raw/0ac71744883918af581f0824435e46b3b364a0d0/SGSR.glsl", local: "SGSR.glsl", sha256: "10a3d1ada2c439607caac32de2a5adceab1cd1580261511aaf67bafd415065fe" }],
    },
    Pack {
        id: "krig",
        files: &[ShaderFile { url: "https://gist.githubusercontent.com/igv/a015fc885d5c22e6891820ad89555637/raw/038064821c5f768dfc6c00261535018d5932cdd5/KrigBilateral.glsl", local: "KrigBilateral.glsl", sha256: "8a4798abb77b83646fce0d71985ddfd14c9806e3be486e8fc7f5a5a8bd940cb0" }],
    },
    Pack {
        id: "ssimsuperres",
        files: &[ShaderFile { url: "https://gist.githubusercontent.com/igv/2364ffa6e81540f29cb7ab4c9bc05b6b/raw/15d93440d0a24fc4b8770070be6a9fa2af6f200b/SSimSuperRes.glsl", local: "SSimSuperRes.glsl", sha256: "a8b27115840c60045250411b375e0188000217258ad776eeb51724c97815460f" }],
    },
    Pack {
        id: "adaptive-sharpen",
        files: &[ShaderFile { url: "https://gist.githubusercontent.com/igv/8a77e4eb8276753b54bb94c1c50c317e/raw/572f59099cd0e3eb5e321a6da0a3d90a7382e2dc/adaptive-sharpen.glsl", local: "adaptive-sharpen.glsl", sha256: "827fb3d662ac9a91b4075e9117fe6e1dbc1c06d85959ba719cdb954dfb7fb8e4" }],
    },
    Pack {
        id: "ravu",
        files: &[
            ShaderFile { url: "https://raw.githubusercontent.com/bjin/mpv-prescalers/b3f0a59d68f33b7162051ea5970a5169558f0ea2/ravu-lite-r3.hook", local: "ravu-lite-r3.hook", sha256: "59e77e138444f23db718988b015b9f496b1517f79efeb75806066d7e7ba8e928" },
            ShaderFile { url: "https://raw.githubusercontent.com/bjin/mpv-prescalers/b3f0a59d68f33b7162051ea5970a5169558f0ea2/ravu-lite-r4.hook", local: "ravu-lite-r4.hook", sha256: "46905b8a09a41867b351431ae1cb828e371ae1b64c4abe247e3f4acdc22c9704" },
            ShaderFile { url: "https://raw.githubusercontent.com/bjin/mpv-prescalers/b3f0a59d68f33b7162051ea5970a5169558f0ea2/ravu-lite-r2.hook", local: "ravu-lite-r2.hook", sha256: "1e76048329c64eed47103f6f5e9f7c943e0f28f1779d65fc815b267f6ac5d760" },
        ],
    },
    Pack {
        id: "nnedi3",
        files: &[
            ShaderFile { url: "https://raw.githubusercontent.com/bjin/mpv-prescalers/b3f0a59d68f33b7162051ea5970a5169558f0ea2/nnedi3-nns32-win8x4.hook", local: "nnedi3-nns32-win8x4.hook", sha256: "a0d5e3a82394715c3961598ea90f62518959ec3f836e7ba62558a3196ef1bb0b" },
            ShaderFile { url: "https://raw.githubusercontent.com/bjin/mpv-prescalers/b3f0a59d68f33b7162051ea5970a5169558f0ea2/nnedi3-nns64-win8x4.hook", local: "nnedi3-nns64-win8x4.hook", sha256: "ad6b260942aef9489a389ae19ba8067930e8d26c63a82fb6e23901f570da9329" },
            ShaderFile { url: "https://raw.githubusercontent.com/bjin/mpv-prescalers/b3f0a59d68f33b7162051ea5970a5169558f0ea2/nnedi3-nns128-win8x4.hook", local: "nnedi3-nns128-win8x4.hook", sha256: "aecaf97f3546208beef703be6d659c78160bf88d02d55991548c3f236889f24e" },
        ],
    },
    Pack {
        id: "hdr-toys",
        files: &[
            ShaderFile { url: "https://raw.githubusercontent.com/natural-harmonia-gropius/hdr-toys/78aa356900e956f9347e4ada281092098a6d88a9/shaders/hdr-toys/utils/clip_both.glsl", local: "clip_both.glsl", sha256: "fa9465a233f14cdef394aadb7debe26f13d84d1b812c28f74441e5a3c34bc434" },
            ShaderFile { url: "https://raw.githubusercontent.com/natural-harmonia-gropius/hdr-toys/78aa356900e956f9347e4ada281092098a6d88a9/shaders/hdr-toys/transfer-function/pq_inv.glsl", local: "pq_inv.glsl", sha256: "de1ec1678c1c42fd8bd3fbc843584f059d2ba0910060f3d8a329448435c00ac5" },
            ShaderFile { url: "https://raw.githubusercontent.com/natural-harmonia-gropius/hdr-toys/78aa356900e956f9347e4ada281092098a6d88a9/shaders/hdr-toys/transfer-function/hlg_inv.glsl", local: "hlg_inv.glsl", sha256: "34c1837eb593758daa99b2bb595b293e27445bc1a51979f633cb93fbfe4cfe5e" },
            ShaderFile { url: "https://raw.githubusercontent.com/natural-harmonia-gropius/hdr-toys/78aa356900e956f9347e4ada281092098a6d88a9/shaders/hdr-toys/transfer-function/bt1886.glsl", local: "bt1886.glsl", sha256: "0e29134a89c04cc7d40cc87331004afb7b393f2b1ec4f96c88e50848cf4dc6d5" },
            ShaderFile { url: "https://raw.githubusercontent.com/natural-harmonia-gropius/hdr-toys/78aa356900e956f9347e4ada281092098a6d88a9/shaders/hdr-toys/tone-mapping/astra.glsl", local: "astra.glsl", sha256: "9845482a3f8d8a331082b19e7ddeb5e1520a472e55dd514a75e57b5024e3c29a" },
            ShaderFile { url: "https://raw.githubusercontent.com/natural-harmonia-gropius/hdr-toys/78aa356900e956f9347e4ada281092098a6d88a9/shaders/hdr-toys/gamut-mapping/bottosson.glsl", local: "bottosson.glsl", sha256: "892a08c7eefdbf7e59bd3a3b46eee3637866dbacdfc67114894f784a8f0a2b98" },
        ],
    },
];

fn sha256_matches(bytes: &[u8], expected_sha256: &str) -> bool {
    format!("{:x}", Sha256::digest(bytes)) == expected_sha256
}

fn file_matches(path: &std::path::Path, expected: &str) -> bool {
    std::fs::read(path)
        .map(|bytes| sha256_matches(&bytes, expected))
        .unwrap_or(false)
}

fn find_pack(id: &str) -> Option<&'static Pack> {
    PACKS.iter().find(|p| p.id == id)
}

fn pack_dir(app: &tauri::AppHandle, id: &str) -> Result<PathBuf, String> {
    let base = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(base.join("shaders").join(id))
}

#[tauri::command]
pub fn shader_dir(app: tauri::AppHandle, id: String) -> Result<Option<String>, String> {
    let pack = match find_pack(&id) {
        Some(pack) => pack,
        None => return Ok(None),
    };
    let dir = pack_dir(&app, &id)?;
    let complete = pack
        .files
        .iter()
        .all(|file| file_matches(&dir.join(file.local), file.sha256));
    if complete {
        Ok(Some(dir.to_string_lossy().into_owned()))
    } else {
        Ok(None)
    }
}

#[tauri::command]
pub async fn shader_download(
    app: tauri::AppHandle,
    id: String,
    force: bool,
) -> Result<String, String> {
    if !crate::security_policy::known_shader_downloads_enabled() {
        return Err("remote shader downloads are disabled by security policy".into());
    }
    let pack = find_pack(&id).ok_or_else(|| format!("unknown shader pack: {}", id))?;
    let dir = pack_dir(&app, &id)?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("create dir: {}", e))?;
    let client = reqwest::Client::builder()
        .user_agent("Bear")
        .build()
        .map_err(|e| e.to_string())?;
    for file in pack.files {
        let dest = dir.join(file.local);
        if !force && file_matches(&dest, file.sha256) {
            continue;
        }
        let resp = client
            .get(file.url)
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
