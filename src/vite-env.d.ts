/// <reference types="vite/client" />

declare const __APP_VERSION__: string;
declare const __IS_BETA_BUILD__: boolean;
declare const __BUILD_ID__: string;
declare const __BUILD_DATE__: string;

interface Window {
  __harborStremioDeeplink?: boolean;
  __harborInstallerOpen?: boolean;
}
