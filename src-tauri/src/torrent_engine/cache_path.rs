use std::path::{Path, PathBuf};

pub(crate) fn resolve(
    app_cache_dir: &Path,
    custom_dir: Option<&str>,
    mut custom_is_allowed: impl FnMut(&Path) -> bool,
) -> Result<PathBuf, String> {
    let Some(custom) = custom_dir.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(app_cache_dir.join("engine"));
    };

    let dir = PathBuf::from(custom).join("bear-beta-stream-cache");
    if !custom_is_allowed(&dir) {
        return Err("torrent cache access requires an explicit system folder selection".into());
    }
    Ok(dir)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn app_owned_cache_does_not_require_a_user_selected_scope() {
        let mut scope_checks = 0;
        let resolved = resolve(Path::new("app-cache"), None, |_| {
            scope_checks += 1;
            false
        })
        .unwrap();

        assert_eq!(resolved, PathBuf::from("app-cache").join("engine"));
        assert_eq!(scope_checks, 0);
    }

    #[test]
    fn custom_cache_still_requires_a_user_selected_scope() {
        let denied = resolve(Path::new("app-cache"), Some("custom-cache"), |_| false);
        assert!(denied.is_err());

        let allowed = resolve(Path::new("app-cache"), Some("custom-cache"), |_| true).unwrap();
        assert_eq!(
            allowed,
            PathBuf::from("custom-cache").join("bear-beta-stream-cache")
        );
    }
}
