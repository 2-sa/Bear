pub(crate) fn in_app_external_webviews_enabled() -> bool {
    false
}

pub(crate) fn signed_updates_enabled() -> bool {
    true
}

pub(crate) fn remote_native_assets_enabled() -> bool {
    false
}

#[cfg(test)]
mod tests {
    #[test]
    fn external_webviews_are_disabled_by_default() {
        assert!(!super::in_app_external_webviews_enabled());
    }

    #[test]
    fn signed_updates_are_enabled() {
        assert!(super::signed_updates_enabled());
    }

    #[test]
    fn remote_native_assets_are_disabled_by_default() {
        assert!(!super::remote_native_assets_enabled());
    }
}
