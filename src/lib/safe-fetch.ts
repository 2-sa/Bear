import { invoke } from "@tauri-apps/api/core";
import { fetch as tauriFetchImpl } from "@tauri-apps/plugin-http";
import { TrackerBlockedError, isBlockedUrl, noteBlocked } from "./privacy/blocklist";

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

// Torrentio + TorBox sit behind Cloudflare that blocks datacenter IPs, so on web they
// MUST be fetched directly from the browser's residential IP (they set CORS, so it
// works) — proxying them through the VPS gets 403'd. EVERYTHING ELSE routes through the
// VPS /api-proxy: it's required for addons that send no CORS header at all (OpenSubtitles)
// and for the CORS-less debrid REST APIs, and it's fine for the rest (Cinemeta, Comet).
const DIRECT_HOSTS = new Set([
  "torrentio.strem.fun",
  "stremio.torbox.app",
  "api.balloonerismm.workers.dev",
]);

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
];

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
};

const MAX_NATIVE_REQUEST_BYTES = 16 * 1024 * 1024;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function abortError(): DOMException {
  return new DOMException("The operation was aborted", "AbortError");
}

async function tauriHarborFetch(
  input: string,
  init?: RequestInit,
  allowPrivate = false,
): Promise<Response> {
  if (init?.signal?.aborted) {
    throw abortError();
  }
  const requestId = crypto.randomUUID();
  const headers: Record<string, string> = {};
  if (init?.headers) {
    const h = new Headers(init.headers as HeadersInit);
    h.forEach((v, k) => {
      headers[k] = v;
    });
  }
  let body: string | undefined;
  let bodyBase64: string | undefined;
  if (typeof init?.body === "string") {
    body = init.body;
  } else if (init?.body instanceof URLSearchParams) {
    body = init.body.toString();
  } else if (init?.body) {
    const encoded = new Request(input, {
      method: init.method ?? "POST",
      headers,
      body: init.body,
    });
    encoded.headers.forEach((value, key) => {
      headers[key] = value;
    });
    const bytes = new Uint8Array(await encoded.arrayBuffer());
    if (bytes.byteLength > MAX_NATIVE_REQUEST_BYTES) {
      throw new Error(`request body exceeds ${MAX_NATIVE_REQUEST_BYTES} bytes`);
    }
    bodyBase64 = bytesToBase64(bytes);
  }
  const nativeRequest = invoke<HarborFetchResponse>("harbor_fetch", {
    args: {
      url: input,
      requestId,
      method: init?.method ?? "GET",
      headers,
      body,
      bodyBase64,
      allowPrivate,
      timeoutMs: 30000,
    },
  });
  let onAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => {
      void invoke("harbor_fetch_cancel", { requestId }).catch(() => {});
      reject(abortError());
    };
    init?.signal?.addEventListener("abort", onAbort, { once: true });
    if (init?.signal?.aborted) onAbort();
  });
  let resp: HarborFetchResponse;
  try {
    resp = await Promise.race([nativeRequest, aborted]);
  } finally {
    if (onAbort) init?.signal?.removeEventListener("abort", onAbort);
  }
  return new Response(resp.body, {
    status: resp.status,
    headers: resp.contentType ? { "content-type": resp.contentType } : {},
  });
}

export const safeFetch: typeof fetch = (input, init) => {
  const target = typeof input === "string" ? input : input instanceof URL ? input.href : null;
  if (target && isBlockedUrl(target)) {
    noteBlocked();
    let host = target;
    try {
      host = new URL(target).hostname;
    } catch {}
    return Promise.reject(new TrackerBlockedError(host));
  }
  if (isTauri) {
    if (typeof input === "string") {
      return tauriHarborFetch(input, init);
    }
    return tauriFetchImpl(input as unknown as string, init as RequestInit) as Promise<Response>;
  }
  if (typeof input === "string") {
    const r = rewriteForWeb(input, init);
    return fetch(r.url, r.init);
  }
  return fetch(input, init);
};

export const trustedLocalFetch: typeof fetch = (input, init) => {
  const target = typeof input === "string" ? input : input instanceof URL ? input.href : null;
  if (target && isBlockedUrl(target)) {
    noteBlocked();
    let host = target;
    try {
      host = new URL(target).hostname;
    } catch {}
    return Promise.reject(new TrackerBlockedError(host));
  }
  if (isTauri && target) return tauriHarborFetch(target, init, true);
  return safeFetch(input, init);
};
