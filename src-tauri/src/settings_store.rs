use tauri::Manager;

#[cfg(not(any(target_os = "android", target_os = "ios")))]
use std::collections::BTreeMap;

#[cfg(not(any(target_os = "android", target_os = "ios")))]
const SECRET_SERVICE: &str = "dev.twosa.bear.beta";

fn settings_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("settings.json"))
}

#[tauri::command]
pub fn settings_read(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let path = settings_path(&app)?;
    match std::fs::read_to_string(&path) {
        Ok(s) => Ok(Some(s)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn settings_write(app: tauri::AppHandle, content: String) -> Result<(), String> {
    let path = settings_path(&app)?;
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, content.as_bytes()).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &path).map_err(|e| e.to_string())
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn legacy_secrets_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("secrets.json"))
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn secret_index_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("secret-keys.json"))
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn parse_secret_map(content: &str) -> Result<BTreeMap<String, String>, String> {
    serde_json::from_str(content).map_err(|e| format!("invalid secret store: {e}"))
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn read_secret_index(app: &tauri::AppHandle) -> Result<Option<Vec<String>>, String> {
    let path = secret_index_path(app)?;
    match std::fs::read_to_string(path) {
        Ok(content) => serde_json::from_str(&content)
            .map(Some)
            .map_err(|e| format!("invalid secret index: {e}")),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn write_secret_index(app: &tauri::AppHandle, keys: &[String]) -> Result<(), String> {
    let path = secret_index_path(app)?;
    let content = serde_json::to_vec(keys).map_err(|e| e.to_string())?;
    std::fs::write(path, content).map_err(|e| e.to_string())
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn secret_entry(key: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(SECRET_SERVICE, key).map_err(|e| e.to_string())
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn write_secret_map(
    app: &tauri::AppHandle,
    secrets: &BTreeMap<String, String>,
) -> Result<(), String> {
    let previous = read_secret_index(app)?.unwrap_or_default();

    for (key, value) in secrets {
        secret_entry(key)?
            .set_password(value)
            .map_err(|e| format!("failed to store secret {key}: {e}"))?;
    }

    let keys: Vec<String> = secrets.keys().cloned().collect();
    write_secret_index(app, &keys)?;

    for key in previous {
        if secrets.contains_key(&key) {
            continue;
        }
        match secret_entry(&key)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => {}
            Err(e) => return Err(format!("failed to remove secret {key}: {e}")),
        }
    }

    Ok(())
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn remove_legacy_secrets(app: &tauri::AppHandle) -> Result<(), String> {
    let path = legacy_secrets_path(app)?;
    match std::fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(format!(
            "secure migration succeeded but legacy secrets could not be removed: {e}"
        )),
    }
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn migrate_legacy_secrets(
    app: &tauri::AppHandle,
) -> Result<Option<BTreeMap<String, String>>, String> {
    let path = legacy_secrets_path(app)?;
    let content = match std::fs::read_to_string(path) {
        Ok(content) => content,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(e.to_string()),
    };
    let secrets = parse_secret_map(&content)?;
    write_secret_map(app, &secrets)?;
    remove_legacy_secrets(app)?;
    Ok(Some(secrets))
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn read_secret_map(app: &tauri::AppHandle) -> Result<Option<BTreeMap<String, String>>, String> {
    let Some(keys) = read_secret_index(app)? else {
        return migrate_legacy_secrets(app);
    };

    let mut secrets = BTreeMap::new();
    for key in keys {
        let value = secret_entry(&key)?
            .get_password()
            .map_err(|e| format!("failed to read secret {key}: {e}"))?;
        secrets.insert(key, value);
    }

    // A previous migration may have stored the credentials before cleanup was
    // interrupted. Retry cleanup whenever the secure index is available.
    remove_legacy_secrets(app)?;
    Ok(Some(secrets))
}

#[tauri::command]
pub fn secrets_read(app: tauri::AppHandle) -> Result<Option<String>, String> {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        return read_secret_map(&app)?
            .map(|secrets| serde_json::to_string(&secrets).map_err(|e| e.to_string()))
            .transpose();
    }

    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        let _ = app;
        Err("persistent secret storage is unavailable on this platform".to_string())
    }
}

#[tauri::command]
pub fn secrets_write(app: tauri::AppHandle, content: String) -> Result<(), String> {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        let secrets = parse_secret_map(&content)?;
        write_secret_map(&app, &secrets)?;
        remove_legacy_secrets(&app)?;
        return Ok(());
    }

    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        let _ = (app, content);
        Err("persistent secret storage is unavailable on this platform".to_string())
    }
}

pub fn read_torrents_disabled(app: &tauri::AppHandle) -> bool {
    let Ok(path) = settings_path(app) else {
        return false;
    };
    let Ok(s) = std::fs::read_to_string(&path) else {
        return false;
    };
    parse_torrents_disabled(&s)
}

pub fn read_defer_torrent_engine(app: &tauri::AppHandle) -> bool {
    let Ok(path) = settings_path(app) else {
        return false;
    };
    let Ok(s) = std::fs::read_to_string(&path) else {
        return false;
    };
    parse_bool_flag(&s, "deferTorrentEngine")
}

fn parse_torrents_disabled(json: &str) -> bool {
    parse_bool_flag(json, "torrentsDisabled")
}

fn parse_bool_flag(json: &str, key: &str) -> bool {
    let needle = format!("\"{}\"", key);
    let Some(idx) = json.find(&needle) else {
        return false;
    };
    let rest = &json[idx + needle.len()..];
    let mut chars = rest.chars().peekable();
    while let Some(c) = chars.peek() {
        if c.is_whitespace() || *c == ':' {
            chars.next();
        } else {
            break;
        }
    }
    matches!(chars.next(), Some('t') | Some('T'))
}
