export const ACTIVE_THEME_CONTENT_ENABLED = true;
export const CUSTOM_THEME_TOOLS_ENABLED = true;
export const EXTERNAL_THEME_STORE_ENABLED = false;
export const ADVANCED_MPV_OPTIONS_ENABLED = false;
export const IN_APP_EXTERNAL_PAGES_ENABLED = false;
export const SIGNED_UPDATES_ENABLED = true;

export function activeThemeContent(value: string | null | undefined): string {
  return ACTIVE_THEME_CONTENT_ENABLED ? (value ?? "") : "";
}
