const ANILIST_TOKEN_URL = "https://anilist.co/api/v2/oauth/token";
const TOKEN_PATH = "/v1/anilist/token";
const FEEDBACK_PATH = "/v1/feedback";
const AD_REPORT_PATH = "/v1/adreport";
const BUG_REPORT_PATH = "/v1/reports";
const SUBMISSION_PATHS = new Set([FEEDBACK_PATH, AD_REPORT_PATH, BUG_REPORT_PATH]);
const PUBLIC_CONTENT_ORIGIN = "https://harbor.site";
const PUBLIC_CONTENT_FALLBACK_ORIGIN = "https://harbor.elfhosted.com";
const PUBLIC_CONTENT_PUBLIC_ORIGIN = "https://api.7mood.net";
const ALLOWED_PUBLIC_CONTENT_ORIGINS = new Set([
  PUBLIC_CONTENT_ORIGIN,
  PUBLIC_CONTENT_FALLBACK_ORIGIN,
]);
const MAX_REQUEST_BYTES = 4096;
const MAX_SUBMISSION_JSON_BYTES = 32 * 1024;
const MAX_BUG_REPORT_BYTES = 6 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 16384;
const MAX_PUBLIC_JSON_BYTES = 2 * 1024 * 1024;
const MAX_PUBLIC_IMAGE_BYTES = 8 * 1024 * 1024;
const PUBLIC_JSON_PATHS = new Set([
  "/announcements.json",
  "/api/hero/anime.json",
  "/anime-awards.json",
  "/curated-logos.json",
  "/feed/hero-pool.json",
  "/feed/award-winners.json",
  "/updates/ad-segments.json",
  "/anime-hero-art.json",
]);
const PUBLIC_BADGE_PATH = /^\/badges\/(?:minimal|abstract|harbor-light|harbor-color)(?:\.json|\/[a-z0-9][a-z0-9._-]*\.webp)$/i;
const PUBLIC_SHADER_PATH = /^\/shaders\/[a-z0-9][a-z0-9._-]{0,80}\/(?:before|after)\.webp$/i;
const PUBLIC_SYNC_PATHS = [
  ...PUBLIC_JSON_PATHS,
  "/badges/minimal.json",
  "/badges/abstract.json",
  "/badges/harbor-light.json",
  "/badges/harbor-color.json",
];
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

async function readLimitedBytes(stream, limit) {
  if (!stream) return new Uint8Array();
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
  return bytes;
}

async function readLimitedText(stream, limit) {
  return new TextDecoder().decode(await readLimitedBytes(stream, limit));
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

function boundedString(value, max, { required = false } = {}) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if ((required && !trimmed) || trimmed.length > max) return null;
  return trimmed;
}

function submissionId(kind) {
  const date = new Date().toISOString().slice(0, 10);
  return { id: crypto.randomUUID(), date, kind };
}

async function storeSubmission(env, key, body, contentType = "application/json") {
  if (!env.PUBLIC_CONTENT_BUCKET) throw new Error("submission storage is unavailable");
  await env.PUBLIC_CONTENT_BUCKET.put(key, body, {
    httpMetadata: { contentType },
    customMetadata: { receivedAt: new Date().toISOString() },
  });
}

function validFeedback(body) {
  return body && typeof body === "object" && !Array.isArray(body)
    && boundedString(body.version, 64, { required: true }) !== null
    && boundedString(body.build, 128, { required: true }) !== null
    && Number.isInteger(body.rating) && body.rating >= 1 && body.rating <= 5
    && typeof body.beta === "boolean";
}

function validAdReport(body) {
  return body && typeof body === "object" && !Array.isArray(body)
    && boundedString(body.content, 256, { required: true }) !== null
    && boundedString(body.source, 256, { required: true }) !== null
    && Array.isArray(body.ranges) && body.ranges.length > 0 && body.ranges.length <= 100
    && body.ranges.every((range) => range && Number.isFinite(range.start)
      && Number.isFinite(range.end) && range.start >= 0 && range.end > range.start);
}

async function handleJsonSubmission(request, env, pathname) {
  let body;
  try {
    body = await readJson(request.body, MAX_SUBMISSION_JSON_BYTES);
  } catch (error) {
    return jsonResponse(request, error instanceof PayloadTooLargeError ? 413 : 400, {
      error: error instanceof PayloadTooLargeError ? "Request too large" : "Invalid JSON body",
    });
  }
  if (pathname === FEEDBACK_PATH && !validFeedback(body)) {
    return jsonResponse(request, 400, { error: "Invalid feedback" });
  }
  if (pathname === AD_REPORT_PATH && !validAdReport(body)) {
    return jsonResponse(request, 400, { error: "Invalid ad report" });
  }
  const submission = submissionId(pathname === FEEDBACK_PATH ? "feedback" : "adreport");
  try {
    await storeSubmission(
      env,
      `submissions/${submission.kind}/${submission.date}/${submission.id}.json`,
      JSON.stringify({ receivedAt: new Date().toISOString(), ...body }),
    );
  } catch {
    return jsonResponse(request, 503, { error: "Report storage temporarily unavailable" });
  }
  return jsonResponse(request, 201, { id: submission.id });
}

function formString(form, name, max, options) {
  const value = form.get(name);
  return typeof value === "string" ? boundedString(value, max, options) : null;
}

async function handleBugReport(request, env, rawContentType) {
  let bytes;
  try {
    bytes = await readLimitedBytes(request.body, MAX_BUG_REPORT_BYTES);
  } catch (error) {
    return jsonResponse(request, error instanceof PayloadTooLargeError ? 413 : 400, {
      error: error instanceof PayloadTooLargeError ? "Request too large" : "Invalid report body",
    });
  }
  let form;
  try {
    form = await new Request("https://bear.local/", {
      method: "POST",
      headers: { "Content-Type": rawContentType },
      body: bytes,
    }).formData();
  } catch {
    return jsonResponse(request, 400, { error: "Invalid multipart report" });
  }
  const summary = formString(form, "summary", 240, { required: true });
  const severity = formString(form, "severity", 16, { required: true });
  if (!summary || !["low", "normal", "high", "critical"].includes(severity ?? "")) {
    return jsonResponse(request, 400, { error: "Invalid bug report" });
  }
  const fields = {};
  for (const [name, max] of Object.entries({
    steps: 8000,
    expected: 8000,
    actual: 8000,
    reporter_name: 120,
    reporter_github: 120,
    reporter_contact: 240,
    consent_credit: 8,
    app_version: 64,
    os: 64,
    os_version: 64,
    ua: 1000,
    viewport: 64,
    locale: 64,
    diagnostics: 20000,
  })) fields[name] = formString(form, name, max) ?? "";

  const submission = submissionId("reports");
  const prefix = `submissions/reports/${submission.date}/${submission.id}`;
  const files = form.getAll("files").filter((value) => value instanceof File).slice(0, 5);
  try {
    const storedFiles = [];
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const safeName = file.name.replace(/[^a-z0-9._-]+/gi, "_").slice(0, 100) || `file-${index + 1}`;
      const key = `${prefix}/files/${index + 1}-${safeName}`;
      await storeSubmission(env, key, await file.arrayBuffer(), file.type || "application/octet-stream");
      storedFiles.push({ key, name: file.name.slice(0, 200), type: file.type, size: file.size });
    }
    await storeSubmission(env, `${prefix}/report.json`, JSON.stringify({
      id: submission.id,
      receivedAt: new Date().toISOString(),
      summary,
      severity,
      ...fields,
      files: storedFiles,
    }));
  } catch {
    return jsonResponse(request, 503, { error: "Report storage temporarily unavailable" });
  }
  return jsonResponse(request, 201, { id: submission.id });
}

function isAllowedOrigin(request) {
  const origin = request.headers.get("Origin");
  return !origin || ALLOWED_ORIGINS.has(origin);
}

function publicContentSpec(pathname) {
  if (PUBLIC_JSON_PATHS.has(pathname) || (PUBLIC_BADGE_PATH.test(pathname) && pathname.endsWith(".json"))) {
    return { kind: "json", limit: MAX_PUBLIC_JSON_BYTES };
  }
  if (PUBLIC_BADGE_PATH.test(pathname) || PUBLIC_SHADER_PATH.test(pathname)) {
    return { kind: "image", limit: MAX_PUBLIC_IMAGE_BYTES };
  }
  return null;
}

function validPublicContentType(value, kind) {
  const type = value?.split(";", 1)[0].trim().toLowerCase();
  return kind === "json" ? type === "application/json" : type === "image/webp";
}

function publicContentHeaders(request, contentType) {
  const headers = securityHeaders(request);
  headers.set("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
  headers.set("Content-Type", contentType);
  headers.set("Cross-Origin-Resource-Policy", "cross-origin");
  return headers;
}

function publicContentKey(pathname) {
  return pathname.slice(1);
}

async function fetchPublicContent(pathname, spec, upstreamFetch) {
  let upstream;
  let lastError = "public content is unavailable";
  for (const origin of [PUBLIC_CONTENT_ORIGIN, PUBLIC_CONTENT_FALLBACK_ORIGIN]) {
    try {
      upstream = await upstreamFetch(new URL(pathname, origin), {
        method: "GET",
        headers: { Accept: spec.kind === "json" ? "application/json" : "image/webp" },
        redirect: "follow",
      });
    } catch (error) {
      lastError = error instanceof Error ? error.message : "public content fetch failed";
      upstream = undefined;
      continue;
    }
    const finalOrigin = upstream.url ? new URL(upstream.url).origin : origin;
    if (!ALLOWED_PUBLIC_CONTENT_ORIGINS.has(finalOrigin)) {
      throw new Error(`public content redirected to ${finalOrigin}`);
    }
    if (upstream.ok && validPublicContentType(upstream.headers.get("Content-Type"), spec.kind)) break;
    lastError = `public content returned status ${upstream.status} as ${upstream.headers.get("Content-Type") ?? "unknown"}`;
    upstream = undefined;
  }
  if (!upstream) throw new Error(lastError);
  const declaredLength = Number(upstream.headers.get("Content-Length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > spec.limit) {
    throw new Error("public content response is too large");
  }

  const contentType = upstream.headers.get("Content-Type") ?? "application/octet-stream";
  if (spec.kind === "json") {
    const text = await readLimitedText(upstream.body, spec.limit);
    const rewritten = text
      .replaceAll(`${PUBLIC_CONTENT_ORIGIN}/`, `${PUBLIC_CONTENT_PUBLIC_ORIGIN}/`)
      .replaceAll(`${PUBLIC_CONTENT_FALLBACK_ORIGIN}/`, `${PUBLIC_CONTENT_PUBLIC_ORIGIN}/`);
    JSON.parse(rewritten);
    return { body: new TextEncoder().encode(rewritten), contentType };
  }
  return { body: await readLimitedBytes(upstream.body, spec.limit), contentType };
}

async function storePublicContent(bucket, pathname, content) {
  if (!bucket) return;
  await bucket.put(publicContentKey(pathname), content.body, {
    httpMetadata: { contentType: content.contentType },
    customMetadata: { syncedAt: new Date().toISOString() },
  });
}

async function serveStoredPublicContent(request, spec, object) {
  const contentType = object.httpMetadata?.contentType
    ?? (spec.kind === "json" ? "application/json; charset=utf-8" : "image/webp");
  const headers = publicContentHeaders(request, contentType);
  if (object.httpEtag) headers.set("ETag", object.httpEtag);
  return new Response(request.method === "HEAD" ? null : object.body, { status: 200, headers });
}

async function proxyPublicContent(request, env, spec, upstreamFetch) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return jsonResponse(request, 405, { error: "Method Not Allowed" }, { Allow: "GET, HEAD" });
  }
  if (!isAllowedOrigin(request)) {
    return jsonResponse(request, 403, { error: "Origin not allowed" });
  }

  const pathname = new URL(request.url).pathname;
  let stored;
  try {
    stored = await env.PUBLIC_CONTENT_BUCKET?.get(publicContentKey(pathname));
  } catch {}
  if (stored) return serveStoredPublicContent(request, spec, stored);

  try {
    const content = await fetchPublicContent(pathname, spec, upstreamFetch);
    await storePublicContent(env.PUBLIC_CONTENT_BUCKET, pathname, content);
    return new Response(request.method === "HEAD" ? null : content.body, {
      status: 200,
      headers: publicContentHeaders(request, content.contentType),
    });
  } catch {
    return jsonResponse(request, 502, { error: "Public content is temporarily unavailable" });
  }
}

export async function syncPublicContent(env, upstreamFetch = fetch) {
  if (!env.PUBLIC_CONTENT_BUCKET) throw new Error("PUBLIC_CONTENT_BUCKET is not configured");
  const result = { synced: [], failed: [] };
  for (const pathname of PUBLIC_SYNC_PATHS) {
    const spec = publicContentSpec(pathname);
    try {
      const content = await fetchPublicContent(pathname, spec, upstreamFetch);
      await storePublicContent(env.PUBLIC_CONTENT_BUCKET, pathname, content);
      result.synced.push(pathname);
    } catch (error) {
      result.failed.push({
        pathname,
        error: error instanceof Error ? error.message : "unknown synchronization error",
      });
    }
  }
  await env.PUBLIC_CONTENT_BUCKET.put("sync/status.json", JSON.stringify({
    completedAt: new Date().toISOString(),
    ...result,
  }), {
    httpMetadata: { contentType: "application/json" },
    customMetadata: {
      failures: JSON.stringify(result.failed).slice(0, 1900),
    },
  });
  return result;
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
  const contentSpec = publicContentSpec(url.pathname);
  if (contentSpec) return proxyPublicContent(request, env, contentSpec, upstreamFetch);
  if (url.pathname !== TOKEN_PATH && !SUBMISSION_PATHS.has(url.pathname)) {
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

  const rawContentType = request.headers.get("Content-Type") ?? "";
  const contentType = rawContentType.split(";", 1)[0].trim().toLowerCase();
  const expectedType = url.pathname === BUG_REPORT_PATH ? "multipart/form-data" : "application/json";
  if (contentType !== expectedType) {
    return jsonResponse(request, 415, { error: `Content-Type must be ${expectedType}` });
  }

  const declaredLength = Number(request.headers.get("Content-Length") ?? "0");
  const requestLimit = url.pathname === TOKEN_PATH
    ? MAX_REQUEST_BYTES
    : url.pathname === BUG_REPORT_PATH ? MAX_BUG_REPORT_BYTES : MAX_SUBMISSION_JSON_BYTES;
  if (Number.isFinite(declaredLength) && declaredLength > requestLimit) {
    return jsonResponse(request, 413, { error: "Request too large" });
  }

  let allowed;
  try {
    allowed = await env.AUTH_RATE_LIMITER.limit({ key: url.pathname });
  } catch {
    return jsonResponse(request, 503, { error: "Login service temporarily unavailable" });
  }
  if (!allowed.success) {
    return jsonResponse(request, 429, { error: "Too many attempts. Try again shortly." }, { "Retry-After": "60" });
  }

  if (url.pathname === BUG_REPORT_PATH) {
    return handleBugReport(request, env, rawContentType);
  }
  if (url.pathname === FEEDBACK_PATH || url.pathname === AD_REPORT_PATH) {
    return handleJsonSubmission(request, env, url.pathname);
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
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(syncPublicContent(env));
  },
};
