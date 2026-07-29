const ANILIST_TOKEN_URL = "https://anilist.co/api/v2/oauth/token";
const TOKEN_PATH = "/v1/anilist/token";
const MAX_REQUEST_BYTES = 4096;
const MAX_RESPONSE_BYTES = 16384;
const ALLOWED_ORIGINS = new Set([
  "http://localhost:1420",
  "http://127.0.0.1:1420",
  "http://tauri.localhost",
  "https://tauri.localhost",
  "tauri://localhost",
]);

class PayloadTooLargeError extends Error {}

function securityHeaders(request) {
  const headers = new Headers({
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  });
  const origin = request.headers.get("Origin");
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }
  return headers;
}

function jsonResponse(request, status, body, extraHeaders) {
  const headers = securityHeaders(request);
  for (const [name, value] of Object.entries(extraHeaders ?? {})) headers.set(name, value);
  return new Response(JSON.stringify(body), { status, headers });
}

async function readLimitedText(stream, limit) {
  if (!stream) return "";
  const reader = stream.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel("payload too large");
        throw new PayloadTooLargeError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

async function readJson(stream, limit) {
  const text = await readLimitedText(stream, limit);
  return JSON.parse(text);
}

function isValidCode(value) {
  return typeof value === "string" && /^[A-Za-z0-9._~-]{8,2048}$/.test(value);
}

function hasExactKeys(body, expected) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  const keys = Object.keys(body);
  return keys.length === expected.length && expected.every((key) => keys.includes(key));
}

function isAllowedOrigin(request) {
  const origin = request.headers.get("Origin");
  return !origin || ALLOWED_ORIGINS.has(origin);
}

async function exchangeAniListCode(request, env, body, upstreamFetch) {
  if (!env.ANILIST_CLIENT_SECRET || !env.ANILIST_CLIENT_ID || !env.ANILIST_REDIRECT_URI) {
    return jsonResponse(request, 503, { error: "AniList login is not configured" });
  }
  if (!hasExactKeys(body, ["code"]) || !isValidCode(body.code)) {
    return jsonResponse(request, 400, { error: "Invalid authorization code" });
  }

  let upstream;
  try {
    upstream = await upstreamFetch(ANILIST_TOKEN_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        grant_type: "authorization_code",
        client_id: env.ANILIST_CLIENT_ID,
        client_secret: env.ANILIST_CLIENT_SECRET,
        redirect_uri: env.ANILIST_REDIRECT_URI,
        code: body.code,
      }),
    });
  } catch {
    return jsonResponse(request, 502, { error: "AniList is temporarily unavailable" });
  }

  let tokenData;
  try {
    tokenData = await readJson(upstream.body, MAX_RESPONSE_BYTES);
  } catch {
    return jsonResponse(request, 502, { error: "AniList returned an invalid response" });
  }

  if (!upstream.ok) {
    if (upstream.status === 400 || upstream.status === 401 || upstream.status === 403) {
      return jsonResponse(request, 400, { error: "AniList rejected that authorization code" });
    }
    return jsonResponse(request, 502, { error: "AniList is temporarily unavailable" });
  }

  if (typeof tokenData.access_token !== "string" || tokenData.access_token.length < 16) {
    return jsonResponse(request, 502, { error: "AniList did not return an access token" });
  }

  return jsonResponse(request, 200, { access_token: tokenData.access_token });
}

export async function handleRequest(request, env, upstreamFetch = fetch) {
  const url = new URL(request.url);
  if (url.pathname !== TOKEN_PATH) {
    return jsonResponse(request, 404, { error: "Not Found" });
  }

  if (!isAllowedOrigin(request)) {
    return jsonResponse(request, 403, { error: "Origin not allowed" });
  }

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        ...Object.fromEntries(securityHeaders(request)),
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  if (request.method !== "POST") {
    return jsonResponse(request, 405, { error: "Method Not Allowed" }, { Allow: "POST, OPTIONS" });
  }

  const contentType = request.headers.get("Content-Type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    return jsonResponse(request, 415, { error: "Content-Type must be application/json" });
  }

  const declaredLength = Number(request.headers.get("Content-Length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    return jsonResponse(request, 413, { error: "Request too large" });
  }

  let allowed;
  try {
    allowed = await env.AUTH_RATE_LIMITER.limit({ key: "anilist-token-exchange" });
  } catch {
    return jsonResponse(request, 503, { error: "Login service temporarily unavailable" });
  }
  if (!allowed.success) {
    return jsonResponse(request, 429, { error: "Too many attempts. Try again shortly." }, { "Retry-After": "60" });
  }

  let body;
  try {
    body = await readJson(request.body, MAX_REQUEST_BYTES);
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      return jsonResponse(request, 413, { error: "Request too large" });
    }
    return jsonResponse(request, 400, { error: "Invalid JSON body" });
  }

  return exchangeAniListCode(request, env, body, upstreamFetch);
}

export default {
  async fetch(request, env) {
    return handleRequest(request, env);
  },
};
