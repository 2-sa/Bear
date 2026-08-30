import { invoke } from "@tauri-apps/api/core";
import { TrackerBlockedError, isBlockedUrl, noteBlocked } from "./privacy/blocklist";

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

declare global {
  interface Window {
    __harborFetchCounts?: BridgeCounts;
  }
}

type BridgeKind = "direct" | "directFail" | "harborFetch";

type BridgeCounts = {
  total: Record<BridgeKind, number>;
  byHost: Record<string, number>;
};

const bridgeCounts: BridgeCounts = {
  total: { direct: 0, directFail: 0, harborFetch: 0 },
  byHost: {},
};
if (typeof window !== "undefined") window.__harborFetchCounts = bridgeCounts;

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function isPrivateIpv4(host: string): boolean {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!match) return false;
  const octets = match.slice(1).map(Number);
  if (octets.some((part) => part < 0 || part > 255)) return false;
  const [a, b] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

export function isPrivateNetworkUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (host === "localhost" || host.endsWith(".localhost")) return true;
    if (host.endsWith(".local") || host.endsWith(".internal")) return true;
    if (isPrivateIpv4(host)) return true;
    if (host === "::" || host === "::1") return true;
    if (
      host.startsWith("fc") ||
      host.startsWith("fd") ||
      /^fe[89ab]/.test(host) ||
      host.startsWith("ff") ||
      host.startsWith("::ffff:") ||
      host.startsWith("64:ff9b:")
    ) {
      return true;
    }
    const embedded = /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(host)?.[1];
    return !!embedded && isPrivateIpv4(embedded);
  } catch {
    return false;
  }
}

function countCrossing(kind: BridgeKind, url: string): void {
  bridgeCounts.total[kind] += 1;
  let host = "other";
  try {
    host = new URL(String(url)).hostname;
  } catch {}
  const key = `${kind}:${host}`;
  bridgeCounts.byHost[key] = (bridgeCounts.byHost[key] ?? 0) + 1;
}

// Torrentio + TorBox sit behind Cloudflare that blocks datacenter IPs, so on web they
// MUST be fetched directly from the browser's residential IP (they set CORS, so it
// works) — proxying them through the VPS gets 403'd. EVERYTHING ELSE routes through the
// VPS /api-proxy: it's required for addons that send no CORS header at all (OpenSubtitles)
// and for the CORS-less debrid REST APIs, and it's fine for the rest (Cinemeta, Comet).
const DIRECT_HOSTS = new Set(["torrentio.strem.fun", "stremio.torbox.app"]);

const PROXY_HOSTS = new Set([
  "v3-cinemeta.strem.io",
  "opensubtitles-v3.strem.io",
  "opensubtitles.strem.io",
  "opensubtitles.stremio.homes",
  "api.torbox.app",
  "api.real-debrid.com",
  "api.alldebrid.com",
  "debrid-link.com",
  "www.premiumize.me",
  "openlibrary.org",
  "covers.openlibrary.org",
  "api.deezer.com",
  "api.igdb.com",
  "images.igdb.com",
  "store.steampowered.com",
  "cdn.cloudflare.steamstatic.com",
]);

const PROXY_SUFFIXES = [
  ".elfhosted.com",
  ".strem.fun",
  ".strem.io",
  ".stremio.homes",
  ".baby-beamup.club",
  ".workers.dev",
  ".debridio.com",
  ".code.run",
  ".fly.dev",
  ".onrender.com",
  ".vercel.app",
  ".netlify.app",
  ".railway.app",
  ".deno.dev",
  ".dzcdn.net",
];

const TAURI_DIRECT_HOSTS = new Set([
  "v3-cinemeta.strem.io",
  "api.ani.zip",
  "anime-kitsu.strem.fun",
  "kitsu.io",
  "api.themoviedb.org",
  "graphql.anilist.co",
]);

const DIRECT_FAIL_LIMIT = 2;
const directFailures = new Map<string, number>();

function tauriDirectHost(url: string): string | null {
  try {
    const host = new URL(url).hostname;
    if (!TAURI_DIRECT_HOSTS.has(host)) return null;
    if ((directFailures.get(host) ?? 0) >= DIRECT_FAIL_LIMIT) return null;
    return host;
  } catch {
    return null;
  }
}

function isCancellation(e: unknown): boolean {
  const err = e as { name?: string; message?: string } | undefined;
  if (err?.name === "AbortError" || err?.name === "TimeoutError") return true;
  return /request cancell?ed/i.test(err?.message ?? "");
}

let proxyOriginCache: boolean | null = null;
function webProxyAvailable(): boolean {
  if (proxyOriginCache !== null) return proxyOriginCache;
  try {
    proxyOriginCache = /(^|\.)harbor\.site$/i.test(window.location.hostname);
  } catch {
    proxyOriginCache = false;
  }
  return proxyOriginCache;
}

function rewriteForWeb(url: string, init?: RequestInit): { url: string; init?: RequestInit } {
  if (isTauri) return { url, init };
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { url, init };
  }
  if (DIRECT_HOSTS.has(parsed.hostname)) return { url, init };
  const proxiable =
    PROXY_HOSTS.has(parsed.hostname) || PROXY_SUFFIXES.some((s) => parsed.hostname.endsWith(s));
  if (!proxiable) return { url, init };
  if (!webProxyAvailable()) return { url, init };

  const proxied = `/api-proxy/${parsed.hostname}${parsed.pathname}${parsed.search}`;
  if (!init?.headers) return { url: proxied, init };
  const out = new Headers(init.headers as HeadersInit);
  const auth = out.get("authorization");
  if (auth) {
    out.delete("authorization");
    out.set("x-harbor-auth", auth);
  }
  return { url: proxied, init: { ...init, headers: out } };
}

type HarborFetchResponse = {
  status: number;
  ok: boolean;
  body: string;
  contentType: string | null;
  headers?: Record<string, string>;
};

async function tauriHarborFetch(
  input: string,
  init?: RequestInit,
  allowPrivateNetwork = false,
  responseType?: "base64",
): Promise<Response> {
  countCrossing("harborFetch", input);
  const headers: Record<string, string> = {};
  if (init?.headers) {
    const h = new Headers(init.headers as HeadersInit);
    h.forEach((v, k) => {
      headers[k] = v;
    });
  }
  const body =
    typeof init?.body === "string"
      ? init.body
      : init?.body instanceof URLSearchParams
        ? init.body.toString()
        : init?.body
          ? JSON.stringify(init.body)
          : undefined;
  const resp = await invoke<HarborFetchResponse>("harbor_fetch", {
    args: {
      url: input,
      method: init?.method ?? "GET",
      headers,
      body,
      timeoutMs: 30000,
      allowPrivateNetwork,
      responseType,
    },
  });
  let responseBody: BodyInit = resp.body;
  if (responseType === "base64") {
    const bytes = Uint8Array.from(atob(resp.body), (character) => character.charCodeAt(0));
    responseBody = bytes.buffer as ArrayBuffer;
  }
  return new Response(responseBody, {
    status: resp.status,
    headers: resp.headers ?? (resp.contentType ? { "content-type": resp.contentType } : {}),
  });
}

const HARBOR_FETCH_DEADLINE_MS = 35000;

function withDeadline(p: Promise<Response>, signal?: AbortSignal | null): Promise<Response> {
  if (signal?.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));
  return new Promise<Response>((resolve, reject) => {
    let settled = false;
    const cleanups: Array<() => void> = [];
    const finish = (run: () => void) => {
      if (settled) return;
      settled = true;
      for (const c of cleanups) c();
      run();
    };
    const timer = setTimeout(
      () =>
        finish(() => reject(new DOMException("harbor_fetch exceeded deadline", "TimeoutError"))),
      HARBOR_FETCH_DEADLINE_MS,
    );
    cleanups.push(() => clearTimeout(timer));
    if (signal) {
      const onAbort = () => finish(() => reject(new DOMException("Aborted", "AbortError")));
      signal.addEventListener("abort", onAbort);
      cleanups.push(() => signal.removeEventListener("abort", onAbort));
    }
    p.then(
      (v) => finish(() => resolve(v)),
      (e) => finish(() => reject(e)),
    );
  });
}

async function requestInit(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<RequestInit | undefined> {
  if (!(input instanceof Request)) return init;
  const method = (init?.method ?? input.method).toUpperCase();
  let body = init?.body;
  if (body === undefined && method !== "GET" && method !== "HEAD") {
    body = await input.clone().text();
  }
  return {
    method,
    headers: init?.headers ?? input.headers,
    body,
    signal: init?.signal ?? input.signal,
  };
}

async function tauriFetch(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  allowPrivateNetwork: boolean,
  responseType?: "base64",
): Promise<Response> {
  const target = urlOf(input);
  const normalizedInit = await requestInit(input, init);
  if (allowPrivateNetwork) {
    return withDeadline(
      tauriHarborFetch(target, normalizedInit, true, responseType),
      normalizedInit?.signal,
    );
  }
  const directHost = tauriDirectHost(target);
  if (directHost && !(input instanceof Request)) {
    countCrossing("direct", target);
    const attempt = fetch(input, normalizedInit).catch((error: unknown) => {
      if (isCancellation(error)) throw error;
      countCrossing("directFail", target);
      directFailures.set(directHost, (directFailures.get(directHost) ?? 0) + 1);
      return tauriHarborFetch(target, normalizedInit, false, responseType);
    });
    return withDeadline(attempt, normalizedInit?.signal);
  }
  const exec = tauriHarborFetch(target, normalizedInit, false, responseType);
  return withDeadline(exec, normalizedInit?.signal);
}

function blockedTracker(target: string): Promise<Response> | null {
  if (!isBlockedUrl(target)) return null;
  noteBlocked();
  let host = target;
  try {
    host = new URL(target).hostname;
  } catch {}
  return Promise.reject(new TrackerBlockedError(host));
}

export const safeFetch: typeof fetch = (input, init) => {
  const target = urlOf(input);
  const tracker = blockedTracker(target);
  if (tracker) return tracker;
  if (isPrivateNetworkUrl(target)) {
    return Promise.reject(new Error(`blocked private network target: ${target}`));
  }
  if (isTauri) return tauriFetch(input, init, false);
  if (typeof input === "string") {
    const r = rewriteForWeb(input, init);
    return fetch(r.url, r.init);
  }
  return fetch(input, init);
};

export const safeLocalFetch: typeof fetch = (input, init) => {
  const target = urlOf(input);
  const tracker = blockedTracker(target);
  if (tracker) return tracker;
  if (isTauri) return tauriFetch(input, init, true);
  return fetch(input, init);
};

export const safeBinaryFetch: typeof fetch = (input, init) => {
  const target = urlOf(input);
  const tracker = blockedTracker(target);
  if (tracker) return tracker;
  if (isPrivateNetworkUrl(target)) {
    return Promise.reject(new Error(`blocked private network target: ${target}`));
  }
  if (isTauri) return tauriFetch(input, init, false, "base64");
  return fetch(input, init);
};

export const safeLocalBinaryFetch: typeof fetch = (input, init) => {
  const target = urlOf(input);
  const tracker = blockedTracker(target);
  if (tracker) return tracker;
  if (isTauri) return tauriFetch(input, init, true, "base64");
  return fetch(input, init);
};
