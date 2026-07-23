export type HarborNetworkEnv = {
  DEV?: boolean;
  VITE_HARBOR_WORKER_PROXY_BASE?: string;
  VITE_HARBOR_PUBLIC_APP_ORIGIN?: string;
  VITE_HARBOR_PUBLIC_RELAY_URL?: string;
  VITE_HARBOR_PUBLIC_SITE_ORIGIN?: string;
  VITE_HARBOR_ASSET_ORIGIN?: string;
};

export type HarborNetworkConfig = {
  workerProxyBase: string | null;
  publicAppOrigin: string | null;
  publicRelayUrl: string | null;
  publicSiteOrigin: string | null;
  assetOrigin: string | null;
};

export type NetworkSecurityEvent =
  | "invalid_network_configuration"
  | "blocked_network_route"
  | "blocked_remote_asset"
  | "blocked_relay_url";

const DEFAULT_WORKER_PROXY_BASE = "https://harbor-api-proxy.xyz7.workers.dev";
const SOURCE_RELEASES_URL = "https://github.com/2-sa/Bear/releases";

function reportSecurityEvent(event: NetworkSecurityEvent, field: string): void {
  if (typeof queueMicrotask !== "function") return;
  queueMicrotask(() => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("harbor:security-event", {
          detail: { event, field, ts: Date.now() },
        }),
      );
    }
  });
}

function isPrivateHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host === "::" ||
    host === "::1"
  ) {
    return true;
  }
  if (host.includes(":")) {
    return /^(?:fc|fd|fe[89ab])/.test(host) || host.startsWith("::ffff:");
  }
  const parts = host.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return false;
  const octets = parts.map(Number);
  if (octets.some((part) => part > 255)) return true;
  const [a, b] = octets;
  return (
    a === 0 ||
    a === 10 ||
    (a === 100 && b >= 64 && b <= 127) ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function validatedEndpoint(
  raw: string | undefined,
  protocol: "https:" | "wss:",
  allowLocal: boolean,
  field: string,
  allowPath = false,
): string | null {
  if (!raw?.trim()) return null;
  try {
    const url = new URL(raw.trim());
    const valid =
      url.protocol === protocol &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      (allowPath || url.pathname === "/") &&
      !url.pathname.includes("..") &&
      !url.pathname.includes("//") &&
      (allowLocal || !isPrivateHostname(url.hostname));
    if (!valid) {
      reportSecurityEvent("invalid_network_configuration", field);
      return null;
    }
    return protocol === "wss:" ? url.href.replace(/\/$/, "") : url.origin;
  } catch {
    reportSecurityEvent("invalid_network_configuration", field);
    return null;
  }
}

export function createNetworkConfig(env: HarborNetworkEnv): HarborNetworkConfig {
  const allowLocal = env.DEV === true;
  return {
    workerProxyBase: validatedEndpoint(
      env.VITE_HARBOR_WORKER_PROXY_BASE,
      "https:",
      allowLocal,
      "worker_proxy",
    ),
    publicAppOrigin: validatedEndpoint(
      env.VITE_HARBOR_PUBLIC_APP_ORIGIN,
      "https:",
      allowLocal,
      "public_app",
    ),
    publicRelayUrl: validatedEndpoint(
      env.VITE_HARBOR_PUBLIC_RELAY_URL,
      "wss:",
      allowLocal,
      "public_relay",
      true,
    ),
    publicSiteOrigin: validatedEndpoint(
      env.VITE_HARBOR_PUBLIC_SITE_ORIGIN,
      "https:",
      allowLocal,
      "public_site",
    ),
    assetOrigin: validatedEndpoint(
      env.VITE_HARBOR_ASSET_ORIGIN,
      "https:",
      allowLocal,
      "asset_origin",
    ),
  };
}

const viteEnv = (import.meta as ImportMeta & { env?: HarborNetworkEnv }).env ?? {};
const configuredNetwork = createNetworkConfig(viteEnv);
export const NETWORK_CONFIG: HarborNetworkConfig = {
  ...configuredNetwork,
  workerProxyBase: configuredNetwork.workerProxyBase ?? DEFAULT_WORKER_PROXY_BASE,
};

export function isConfiguredWorkerUrl(raw: string): boolean {
  if (!NETWORK_CONFIG.workerProxyBase) return false;
  try {
    const url = new URL(raw);
    return (
      url.origin === NETWORK_CONFIG.workerProxyBase &&
      url.pathname.startsWith("/v1/") &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

function workerRoute(path: string): string | null {
  const base = NETWORK_CONFIG.workerProxyBase;
  return base ? `${base}${path}` : null;
}

function encodeSegment(value: string): string {
  return encodeURIComponent(value);
}

function validImdbId(value: string): boolean {
  return /^tt\d{5,12}$/.test(value);
}

function validTvdbV4Path(path: string): boolean {
  let url: URL;
  try {
    url = new URL(path, "https://route.invalid");
  } catch {
    return false;
  }
  const pathname = url.pathname;
  const allowedPath =
    /^\/search\/remoteid\/[A-Za-z0-9_.:-]{1,80}$/.test(pathname) ||
    /^\/series\/\d{1,12}\/extended$/.test(pathname) ||
    /^\/series\/\d{1,12}\/episodes\/[a-z]{1,24}(?:\/[a-z]{3})?$/.test(pathname);
  if (!allowedPath) return false;
  const allowedKeys = new Set(["meta", "short", "season", "page"]);
  for (const [key, value] of url.searchParams) {
    if (!allowedKeys.has(key)) return false;
    if (key === "meta" && value !== "translations") return false;
    if (key === "short" && value !== "true" && value !== "false") return false;
    if ((key === "season" || key === "page") && !/^\d{1,5}$/.test(value)) return false;
  }
  return true;
}

export const workerRoutes = {
  updateVersions: () => workerRoute("/v1/updates/versions-beta.json"),
  animeHero: () => workerRoute("/v1/content/hero/anime.json"),
  adSegments: () => workerRoute("/v1/updates/ad-segments.json"),
  adReport: () => workerRoute("/v1/reports/ad"),
  buildFeedback: () => workerRoute("/v1/reports/feedback"),
  bugReports: () => workerRoute("/v1/reports/bugs"),
  traktToken: () => workerRoute("/v1/oauth/trakt/token"),
  traktDeviceToken: () => workerRoute("/v1/oauth/trakt/device-token"),
  malToken: () => workerRoute("/v1/oauth/mal/token"),
  anilistToken: () => workerRoute("/v1/oauth/anilist/token"),
  tvdbImages: () => workerRoute("/v1/content/tvdb/images"),
  tvdbArtwork: () => workerRoute("/v1/content/tvdb/artwork"),
  tvdbV4(path: string): string | null {
    if (!validTvdbV4Path(path)) {
      reportSecurityEvent("blocked_network_route", "tvdb_v4");
      return null;
    }
    return workerRoute(`/v1/content/tvdb/v4${path}`);
  },
  imdbEpisodes(id: string): string | null {
    return validImdbId(id) ? workerRoute(`/v1/content/imdb/episodes/${id}`) : null;
  },
  imdbTitle(id: string): string | null {
    return validImdbId(id) ? workerRoute(`/v1/content/imdb/title/${id}`) : null;
  },
  imdbParental(id: string): string | null {
    return validImdbId(id) ? workerRoute(`/v1/content/imdb/parental/${id}`) : null;
  },
  themes(sort: string, query: string): string | null {
    const base = workerRoute("/v1/themes");
    if (!base) return null;
    const params = new URLSearchParams({ sort: sort.slice(0, 24) });
    if (query) params.set("q", query.slice(0, 120));
    return `${base}?${params.toString()}`;
  },
  themeFile(id: string): string | null {
    return workerRoute(`/v1/themes/${encodeSegment(id)}/file`);
  },
  themeRate(id: string): string | null {
    return workerRoute(`/v1/themes/${encodeSegment(id)}/rate`);
  },
  themeUpload: () => workerRoute("/v1/themes"),
  themeVisibility(id: string): string | null {
    return workerRoute(`/v1/themes/${encodeSegment(id)}/visibility`);
  },
  themeDelete(id: string): string | null {
    return workerRoute(`/v1/themes/${encodeSegment(id)}/delete`);
  },
};

export function publicDownloadUrl(): string | null {
  return NETWORK_CONFIG.publicSiteOrigin
    ? `${NETWORK_CONFIG.publicSiteOrigin}/download`
    : SOURCE_RELEASES_URL;
}

export function controlledAssetUrl(path: string): string | null {
  const origin = NETWORK_CONFIG.assetOrigin;
  if (!origin || !path.startsWith("/") || path.startsWith("//") || path.includes("..")) {
    reportSecurityEvent("blocked_remote_asset", "asset_path");
    return null;
  }
  return `${origin}${path}`;
}

export function validateControlledAssetUrl(
  raw: string | null | undefined,
  config = NETWORK_CONFIG,
): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw, config.assetOrigin ?? undefined);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !config.assetOrigin ||
      url.origin !== config.assetOrigin
    ) {
      reportSecurityEvent("blocked_remote_asset", "remote_asset");
      return null;
    }
    return url.href;
  } catch {
    reportSecurityEvent("blocked_remote_asset", "remote_asset");
    return null;
  }
}

export function validateControlledDownloadUrl(
  raw: string | null | undefined,
  config = NETWORK_CONFIG,
): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.origin !== config.workerProxyBase ||
      !url.pathname.startsWith("/v1/updates/artifacts/")
    ) {
      reportSecurityEvent("blocked_network_route", "download_url");
      return null;
    }
    return url.href;
  } catch {
    reportSecurityEvent("blocked_network_route", "download_url");
    return null;
  }
}

export function validateRelayUrl(raw: string): string | null {
  if (!raw.trim()) return null;
  const value = validatedEndpoint(raw, "wss:", false, "relay_url", true);
  if (value) return value;
  reportSecurityEvent("blocked_relay_url", "relay_url");
  return null;
}
