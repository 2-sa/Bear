const MAX_JSON_BYTES = 64 * 1024;
const MAX_REPORT_BYTES = 10 * 1024 * 1024;
const MAX_THEME_BYTES = 16 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 16 * 1024 * 1024;
const MAX_ARTIFACT_BYTES = 512 * 1024 * 1024;

const TAURI_ORIGINS = new Set([
  "tauri://localhost",
  "http://tauri.localhost",
  "https://tauri.localhost",
]);

const JSON_HEADERS = Object.freeze({
  accept: "application/json",
  "content-type": "application/json",
});

function json(body, status = 200, headers) {
  return Response.json(body, { status, headers });
}

function configuredOrigins(env) {
  const configured = String(env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return new Set([...TAURI_ORIGINS, ...configured]);
}

function corsOrigin(request, env) {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  if (configuredOrigins(env).has(origin)) return origin;
  if (env.ENVIRONMENT !== "production" && /^http:\/\/localhost:\d+$/.test(origin)) {
    return origin;
  }
  return false;
}

function corsHeaders(origin) {
  if (!origin) return {};
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "accept, authorization, content-type, x-harbor-channel",
    "access-control-max-age": "600",
    vary: "Origin",
  };
}

function validateConfiguredOrigin(raw, name) {
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new RouteError(503, `${name} is not configured`);
  }
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new RouteError(503, `${name} is invalid`);
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new RouteError(503, `${name} must be an HTTPS origin`);
  }
  parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  return parsed;
}

function upstreamUrl(env, binding, pathname, search = "") {
  const origin = validateConfiguredOrigin(env[binding], binding);
  const basePath = origin.pathname === "/" ? "" : origin.pathname.replace(/\/+$/, "");
  origin.pathname = `${basePath}${pathname}`;
  origin.search = search;
  return origin;
}

function copyRequestHeaders(request, names) {
  const headers = new Headers();
  for (const name of names) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

function isJsonContentType(request) {
  return (request.headers.get("content-type") || "").toLowerCase().startsWith("application/json");
}

async function readBoundedBytes(request, maxBytes) {
  const declared = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new RouteError(413, "request body too large");
  }
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel("request body too large");
        throw new RouteError(413, "request body too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

async function readJson(request, maxBytes = MAX_JSON_BYTES) {
  if (!isJsonContentType(request)) {
    throw new RouteError(415, "application/json required");
  }
  const bytes = await readBoundedBytes(request, maxBytes);
  try {
    const value = JSON.parse(new TextDecoder().decode(bytes));
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("object required");
    }
    return value;
  } catch {
    throw new RouteError(400, "invalid JSON body");
  }
}

function cleanString(value, maxLength) {
  if (typeof value !== "string") return null;
  const cleaned = value.trim();
  if (!cleaned || cleaned.length > maxLength) return null;
  return cleaned;
}

function requireFields(value, fields) {
  for (const field of fields) {
    if (!cleanString(value[field], 4096)) {
      throw new RouteError(400, `invalid ${field}`);
    }
  }
}

function isImdbId(value) {
  return /^tt\d{5,12}$/.test(value);
}

function isNumericId(value) {
  return /^\d{1,12}$/.test(value);
}

function validateTvdbV4Path(pathname) {
  const suffix = pathname.slice("/v1/content/tvdb/v4".length);
  return (
    /^\/search\/remoteid\/(?:tt\d{5,12}|\d{1,16})$/.test(suffix) ||
    /^\/series\/\d{1,12}\/extended$/.test(suffix) ||
    /^\/series\/\d{1,12}\/episodes\/(?:default|official|aired|dvd|absolute|alternate|regional|tvdbabsolute)(?:\/[a-z]{3})?$/.test(
      suffix,
    )
  );
}

function validateTvdbQuery(searchParams) {
  const allowed = new Set(["meta", "short", "season", "page"]);
  for (const key of searchParams.keys()) {
    if (!allowed.has(key)) return false;
  }
  const short = searchParams.get("short");
  if (short != null && short !== "true" && short !== "false") return false;
  const meta = searchParams.get("meta");
  if (meta != null && meta !== "translations") return false;
  for (const key of ["season", "page"]) {
    const value = searchParams.get(key);
    if (value != null && !/^\d{1,4}$/.test(value)) return false;
  }
  return true;
}

function validateArtworkQuery(searchParams, allowType) {
  const allowed = new Set(allowType ? ["series", "imdb", "type"] : ["series", "imdb"]);
  for (const key of searchParams.keys()) {
    if (!allowed.has(key)) return false;
  }
  const series = searchParams.get("series");
  const imdb = searchParams.get("imdb");
  if ((series ? 1 : 0) + (imdb ? 1 : 0) !== 1) return false;
  if (series && !isNumericId(series)) return false;
  if (imdb && !isImdbId(imdb)) return false;
  const type = searchParams.get("type");
  return !type || /^[a-z][a-z0-9_-]{0,31}$/i.test(type);
}

function validateThemeQuery(searchParams) {
  for (const key of searchParams.keys()) {
    if (key !== "sort" && key !== "q") return false;
  }
  const sort = searchParams.get("sort");
  if (sort != null && !["top", "new", "downloads"].includes(sort)) return false;
  const query = searchParams.get("q");
  return query == null || query.length <= 120;
}

function validateArtifactPath(pathname) {
  const prefix = "/v1/updates/artifacts/";
  if (!pathname.startsWith(prefix)) return null;
  const suffix = pathname.slice(prefix.length);
  if (
    !suffix ||
    suffix.length > 240 ||
    suffix.includes("..") ||
    suffix.includes("//") ||
    !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(suffix)
  ) {
    return null;
  }
  return suffix;
}

function proxyPlan(routeKey, upstream, request, options = {}) {
  return {
    kind: "proxy",
    routeKey,
    upstream,
    method: request.method,
    requestHeaders: copyRequestHeaders(request, options.headers || ["accept"]),
    maxRequestBytes: options.maxRequestBytes || 0,
    maxResponseBytes: options.maxResponseBytes || MAX_RESPONSE_BYTES,
    cacheControl: options.cacheControl,
    sanitizeThemeUpload: options.sanitizeThemeUpload === true,
    sanitizeThemeResponse: options.sanitizeThemeResponse === true,
  };
}

export function stripThemeCode(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RouteError(502, "invalid theme payload");
  }
  const clean = { ...value };
  delete clean.css;
  delete clean.js;
  delete clean.html;
  return clean;
}

async function sanitizeThemeUpload(bytes, contentType) {
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
    throw new RouteError(415, "multipart/form-data required");
  }
  const parsed = await new Request("https://upload.invalid", {
    method: "POST",
    headers: { "content-type": contentType },
    body: bytes,
  }).formData();
  const themeFile = parsed.get("theme");
  if (!(themeFile instanceof Blob) || themeFile.size > 1024 * 1024) {
    throw new RouteError(400, "invalid theme file");
  }
  let theme;
  try {
    theme = stripThemeCode(JSON.parse(await themeFile.text()));
  } catch (error) {
    if (error instanceof RouteError) throw error;
    throw new RouteError(400, "invalid theme JSON");
  }
  const clean = new FormData();
  clean.append(
    "theme",
    new Blob([JSON.stringify(theme)], { type: "application/json" }),
    "theme.json",
  );
  const cover = parsed.get("cover");
  if (!(cover instanceof Blob) || !cover.type.startsWith("image/")) {
    throw new RouteError(400, "invalid theme cover");
  }
  clean.append("cover", cover, "cover");
  const screenshots = parsed
    .getAll("screenshots")
    .filter((value) => value instanceof Blob && value.type.startsWith("image/"))
    .slice(0, 6);
  for (const screenshot of screenshots) {
    clean.append("screenshots", screenshot, "screenshot");
  }
  const author = cleanString(parsed.get("author"), 120);
  if (author) clean.append("author", author);
  return clean;
}

async function sanitizeThemeResponse(response, maxBytes) {
  if (!response.ok) return response;
  const declared = Number(response.headers.get("content-length") || "0");
  if (Number.isFinite(declared) && declared > maxBytes) {
    void response.body?.cancel();
    throw new RouteError(502, "upstream response too large");
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > maxBytes) {
    throw new RouteError(502, "upstream response too large");
  }
  let theme;
  try {
    theme = stripThemeCode(JSON.parse(new TextDecoder().decode(bytes)));
  } catch (error) {
    if (error instanceof RouteError) throw error;
    throw new RouteError(502, "invalid upstream theme");
  }
  return json(theme, response.status, {
    "content-type": "application/json",
    "cache-control": "no-store",
  });
}

export function matchRoute(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method.toUpperCase();

  if (method === "GET" && path === "/v1/updates/latest.json") {
    return proxyPlan(
      "updates.latest",
      upstreamUrl(env, "UPDATES_ORIGIN", "/updates/latest.json"),
      request,
      { headers: ["accept", "x-harbor-channel"], cacheControl: "no-store" },
    );
  }
  if (method === "GET" && path === "/v1/updates/versions-beta.json") {
    return proxyPlan(
      "updates.history",
      upstreamUrl(env, "UPDATES_ORIGIN", "/updates/versions-beta.json"),
      request,
      { cacheControl: "no-store" },
    );
  }
  if (method === "GET" && path === "/v1/updates/ad-segments.json") {
    return proxyPlan(
      "updates.ad_segments",
      upstreamUrl(env, "UPDATES_ORIGIN", "/updates/ad-segments.json"),
      request,
      { cacheControl: "public, max-age=3600" },
    );
  }
  const artifactPath = validateArtifactPath(path);
  if ((method === "GET" || method === "HEAD") && artifactPath) {
    return proxyPlan(
      "updates.artifact",
      upstreamUrl(env, "UPDATES_ORIGIN", `/updates/artifacts/${artifactPath}`),
      request,
      {
        cacheControl: "public, max-age=31536000, immutable",
        maxResponseBytes: MAX_ARTIFACT_BYTES,
      },
    );
  }
  if (method === "GET" && path === "/v1/content/hero/anime.json") {
    return proxyPlan(
      "content.anime_hero",
      upstreamUrl(env, "CONTENT_ORIGIN", "/api/hero/anime.json"),
      request,
      { cacheControl: "public, max-age=10800" },
    );
  }

  const imdb = path.match(/^\/v1\/content\/imdb\/(episodes|title|parental)\/(tt\d{5,12})$/);
  if (method === "GET" && imdb) {
    return proxyPlan(
      `content.imdb_${imdb[1]}`,
      upstreamUrl(env, "CONTENT_ORIGIN", `/api/imdb/${imdb[1]}/${imdb[2]}`),
      request,
      { cacheControl: "private, max-age=3600" },
    );
  }

  if (
    method === "GET" &&
    path.startsWith("/v1/content/tvdb/v4/") &&
    validateTvdbV4Path(path) &&
    validateTvdbQuery(url.searchParams)
  ) {
    const suffix = path.slice("/v1/content/tvdb/v4".length);
    return proxyPlan(
      "content.tvdb_v4",
      upstreamUrl(env, "CONTENT_ORIGIN", `/api/tvdb/v4${suffix}`, url.search),
      request,
      { cacheControl: "private, max-age=3600" },
    );
  }
  if (
    method === "GET" &&
    path === "/v1/content/tvdb/images" &&
    validateArtworkQuery(url.searchParams, true)
  ) {
    return proxyPlan(
      "content.tvdb_images",
      upstreamUrl(env, "CONTENT_ORIGIN", "/api/tvdb/images", url.search),
      request,
      { cacheControl: "private, max-age=3600" },
    );
  }
  if (
    method === "GET" &&
    path === "/v1/content/tvdb/artwork" &&
    validateArtworkQuery(url.searchParams, false)
  ) {
    return proxyPlan(
      "content.tvdb_artwork",
      upstreamUrl(env, "CONTENT_ORIGIN", "/api/tvdb/artwork", url.search),
      request,
      { cacheControl: "private, max-age=3600" },
    );
  }

  if (method === "POST" && path === "/v1/reports/ad") {
    return proxyPlan("reports.ad", upstreamUrl(env, "REPORTS_ORIGIN", "/v1/adreport"), request, {
      headers: ["content-type"],
      maxRequestBytes: MAX_JSON_BYTES,
    });
  }
  if (method === "POST" && path === "/v1/reports/feedback") {
    return proxyPlan(
      "reports.feedback",
      upstreamUrl(env, "REPORTS_ORIGIN", "/v1/feedback"),
      request,
      { headers: ["content-type"], maxRequestBytes: MAX_JSON_BYTES },
    );
  }
  if (method === "POST" && path === "/v1/reports/bugs") {
    return proxyPlan("reports.bugs", upstreamUrl(env, "REPORTS_ORIGIN", "/v1/reports"), request, {
      headers: ["content-type"],
      maxRequestBytes: MAX_REPORT_BYTES,
    });
  }

  if (
    path === "/v1/themes" &&
    (method === "GET" || method === "POST") &&
    (method !== "GET" || validateThemeQuery(url.searchParams))
  ) {
    return proxyPlan(
      method === "GET" ? "themes.list" : "themes.upload",
      upstreamUrl(env, "THEMES_ORIGIN", "/themes/api/themes", url.search),
      request,
      {
        headers: ["accept", "content-type"],
        maxRequestBytes: method === "POST" ? MAX_THEME_BYTES : 0,
        sanitizeThemeUpload: method === "POST",
      },
    );
  }
  const theme = path.match(/^\/v1\/themes\/([a-zA-Z0-9_-]{1,80})\/(file|rate|visibility|delete)$/);
  if (theme) {
    const action = theme[2];
    const expectedMethod = action === "file" ? "GET" : "POST";
    if (method === expectedMethod) {
      const headers =
        action === "visibility" || action === "delete"
          ? ["accept", "content-type", "authorization"]
          : ["accept", "content-type"];
      return proxyPlan(
        `themes.${action}`,
        upstreamUrl(env, "THEMES_ORIGIN", `/themes/api/themes/${theme[1]}/${action}`),
        request,
        {
          headers,
          maxRequestBytes: method === "POST" ? MAX_JSON_BYTES : 0,
          maxResponseBytes: action === "file" ? 1024 * 1024 : MAX_RESPONSE_BYTES,
          sanitizeThemeResponse: action === "file",
        },
      );
    }
  }

  if (method === "POST" && path === "/v1/oauth/anilist/token") {
    return { kind: "oauth", provider: "anilist", routeKey: "oauth.anilist" };
  }
  if (method === "POST" && path === "/v1/oauth/mal/token") {
    return { kind: "oauth", provider: "mal", routeKey: "oauth.mal" };
  }
  if (method === "POST" && path === "/v1/oauth/trakt/token") {
    return { kind: "oauth", provider: "trakt", routeKey: "oauth.trakt" };
  }
  if (method === "POST" && path === "/v1/oauth/trakt/device-token") {
    return {
      kind: "oauth",
      provider: "trakt-device",
      routeKey: "oauth.trakt_device",
    };
  }

  throw new RouteError(404, "route not found");
}

async function oauthRequest(request, env, provider) {
  const body = await readJson(request);
  if (provider === "anilist") {
    requireFields(body, ["code"]);
    requireFields(env, ["ANILIST_CLIENT_ID", "ANILIST_CLIENT_SECRET"]);
    return fetch("https://anilist.co/api/v2/oauth/token", {
      method: "POST",
      redirect: "manual",
      headers: JSON_HEADERS,
      body: JSON.stringify({
        grant_type: "authorization_code",
        client_id: env.ANILIST_CLIENT_ID,
        client_secret: env.ANILIST_CLIENT_SECRET,
        redirect_uri: "https://anilist.co/api/v2/oauth/pin",
        code: body.code,
      }),
    });
  }
  if (provider === "mal") {
    requireFields(env, ["MAL_CLIENT_ID", "MAL_CLIENT_SECRET"]);
    const grantType = cleanString(body.grant_type, 32);
    if (grantType !== "authorization_code" && grantType !== "refresh_token") {
      throw new RouteError(400, "invalid grant_type");
    }
    const form = new URLSearchParams({
      grant_type: grantType,
      client_id: env.MAL_CLIENT_ID,
      client_secret: env.MAL_CLIENT_SECRET,
    });
    if (grantType === "authorization_code") {
      requireFields(body, ["code", "code_verifier"]);
      form.set("code", body.code);
      form.set("code_verifier", body.code_verifier);
    } else {
      requireFields(body, ["refresh_token"]);
      form.set("refresh_token", body.refresh_token);
    }
    return fetch("https://myanimelist.net/v1/oauth2/token", {
      method: "POST",
      redirect: "manual",
      headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
      body: form,
    });
  }
  if (provider === "trakt" || provider === "trakt-device") {
    requireFields(env, ["TRAKT_CLIENT_ID", "TRAKT_CLIENT_SECRET"]);
    const payload = {
      client_id: env.TRAKT_CLIENT_ID,
      client_secret: env.TRAKT_CLIENT_SECRET,
    };
    let endpoint;
    if (provider === "trakt-device") {
      requireFields(body, ["code"]);
      endpoint = "https://api.trakt.tv/oauth/device/token";
      payload.code = body.code;
    } else {
      requireFields(body, ["refresh_token"]);
      if (body.grant_type !== "refresh_token") {
        throw new RouteError(400, "invalid grant_type");
      }
      endpoint = "https://api.trakt.tv/oauth/token";
      payload.refresh_token = body.refresh_token;
      payload.grant_type = "refresh_token";
    }
    return fetch(endpoint, {
      method: "POST",
      redirect: "manual",
      headers: JSON_HEADERS,
      body: JSON.stringify(payload),
    });
  }
  throw new RouteError(404, "provider not found");
}

async function proxyRequest(request, plan) {
  let body;
  if (plan.maxRequestBytes > 0) {
    body = await readBoundedBytes(request, plan.maxRequestBytes);
  }
  if (plan.sanitizeThemeUpload) {
    body = await sanitizeThemeUpload(body, request.headers.get("content-type") || "");
    plan.requestHeaders.delete("content-type");
  }
  let response = await fetch(plan.upstream, {
    method: plan.method,
    headers: plan.requestHeaders,
    body: body instanceof FormData ? body : body?.byteLength ? body : undefined,
    redirect: "manual",
  });
  if (response.status >= 300 && response.status < 400) {
    void response.body?.cancel();
    throw new RouteError(502, "upstream redirect rejected");
  }
  if (plan.sanitizeThemeResponse) {
    response = await sanitizeThemeResponse(response, plan.maxResponseBytes);
  }
  return response;
}

function boundedResponseBody(stream, maxBytes) {
  if (!stream) return null;
  const reader = stream.getReader();
  let total = 0;
  return new ReadableStream({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          return;
        }
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel("upstream response too large");
          controller.error(new Error("upstream response too large"));
          return;
        }
        controller.enqueue(value);
      } catch (error) {
        controller.error(error);
      }
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
}

function safeResponse(upstream, plan, origin) {
  const declared = Number(upstream.headers.get("content-length") || "0");
  if (Number.isFinite(declared) && declared > plan.maxResponseBytes) {
    void upstream.body?.cancel();
    throw new RouteError(502, "upstream response too large");
  }
  const headers = new Headers(corsHeaders(origin));
  const contentType = upstream.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  const cacheControl = plan.cacheControl || upstream.headers.get("cache-control");
  if (cacheControl) headers.set("cache-control", cacheControl);
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "no-referrer");
  return new Response(boundedResponseBody(upstream.body, plan.maxResponseBytes), {
    status: upstream.status,
    headers,
  });
}

function queueSecurityEvent(ctx, event) {
  ctx.waitUntil(
    Promise.resolve().then(() => {
      console.log(
        JSON.stringify({
          type: "security_route",
          at: new Date().toISOString(),
          ...event,
        }),
      );
    }),
  );
}

async function enforceRateLimit(request, env, plan) {
  const write = !["GET", "HEAD", "OPTIONS"].includes(request.method);
  const limiter = write ? env.WRITE_RATE_LIMITER : env.READ_RATE_LIMITER;
  if (!limiter || typeof limiter.limit !== "function") {
    throw new RouteError(503, "rate limiting is not configured");
  }
  const actor = request.headers.get("cf-connecting-ip") || "unknown";
  const { success } = await limiter.limit({
    key: `${actor}:${plan.routeKey}`,
  });
  if (!success) throw new RouteError(429, "rate limit exceeded");
}

class RouteError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export default {
  async fetch(request, env, ctx) {
    const startedAt = Date.now();
    const origin = corsOrigin(request, env);
    if (origin === false) {
      queueSecurityEvent(ctx, {
        route: "cors",
        method: request.method,
        decision: "deny",
        status: 403,
      });
      return json({ error: "origin not allowed" }, 403);
    }
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    let plan;
    try {
      plan = matchRoute(request, env);
      await enforceRateLimit(request, env, plan);
      const upstream =
        plan.kind === "oauth"
          ? await oauthRequest(request, env, plan.provider)
          : await proxyRequest(request, plan);
      const response = safeResponse(
        upstream,
        plan.kind === "proxy"
          ? plan
          : {
              maxResponseBytes: MAX_JSON_BYTES,
              cacheControl: "no-store",
            },
        origin,
      );
      queueSecurityEvent(ctx, {
        route: plan.routeKey,
        method: request.method,
        decision: "allow",
        status: response.status,
        durationMs: Date.now() - startedAt,
      });
      return response;
    } catch (error) {
      const status = error instanceof RouteError ? error.status : 500;
      queueSecurityEvent(ctx, {
        route: plan?.routeKey || "unmatched",
        method: request.method,
        decision: "deny",
        status,
        durationMs: Date.now() - startedAt,
      });
      if (!(error instanceof RouteError)) {
        console.error(
          JSON.stringify({
            type: "security_route_error",
            route: plan?.routeKey || "unmatched",
            at: new Date().toISOString(),
          }),
        );
      }
      return json(
        { error: status >= 500 ? "service unavailable" : error.message },
        status,
        corsHeaders(origin),
      );
    }
  },
};
