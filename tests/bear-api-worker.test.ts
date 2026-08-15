import assert from "node:assert/strict";
import test from "node:test";

import { handleRequest } from "../cloudflare/bear-api/src/index.js";

const URL = "https://api.7mood.net/v1/anilist/token";
const VALID_CODE = "anilist-code_123456789";

function environment({ configured = true, rateAllowed = true } = {}) {
  return {
    ANILIST_CLIENT_ID: "43455",
    ANILIST_REDIRECT_URI: "https://anilist.co/api/v2/oauth/pin",
    ANILIST_CLIENT_SECRET: configured ? "test-secret-never-commit-a-real-one" : "",
    AUTH_RATE_LIMITER: {
      async limit() {
        return { success: rateAllowed };
      },
    },
  };
}

function tokenRequest(
  body: unknown,
  headers: Record<string, string> = {},
  url = URL,
) {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

test("Bear API rejects unrelated routes, methods, origins, and malformed bodies", async () => {
  const env = environment();
  assert.equal((await handleRequest(new Request("https://api.7mood.net/"), env)).status, 404);
  assert.equal((await handleRequest(new Request(URL), env)).status, 405);
  assert.equal(
    (await handleRequest(tokenRequest({ code: VALID_CODE }, { Origin: "https://example.com" }), env)).status,
    403,
  );
  assert.equal((await handleRequest(tokenRequest("{"), env)).status, 400);
  assert.equal((await handleRequest(tokenRequest({ code: "short" }), env)).status, 400);
  assert.equal((await handleRequest(tokenRequest({ code: VALID_CODE, extra: true }), env)).status, 400);
  assert.equal((await handleRequest(tokenRequest({ code: "x".repeat(5000) }), env)).status, 413);
});

test("Bear API fails closed when its secret or rate limiter is unavailable", async () => {
  assert.equal((await handleRequest(tokenRequest({ code: VALID_CODE }), environment({ configured: false }))).status, 503);
  const rateLimited = await handleRequest(tokenRequest({ code: VALID_CODE }), environment({ rateAllowed: false }));
  assert.equal(rateLimited.status, 429);
  assert.equal(rateLimited.headers.get("Retry-After"), "60");
});

test("Bear API exchanges only an AniList code and returns only the access token", async () => {
  let upstreamUrl = "";
  let upstreamBody: Record<string, string> | null = null;
  const upstreamFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    upstreamUrl = String(input);
    upstreamBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({
      access_token: "test-access-token-123456789",
      refresh_token: "must-not-leave-worker",
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const response = await handleRequest(
    tokenRequest({ code: VALID_CODE }, { Origin: "http://localhost:1420" }),
    environment(),
    upstreamFetch,
  );

  assert.equal(response.status, 200);
  assert.equal(upstreamUrl, "https://anilist.co/api/v2/oauth/token");
  assert.deepEqual(upstreamBody, {
    grant_type: "authorization_code",
    client_id: "43455",
    client_secret: "test-secret-never-commit-a-real-one",
    redirect_uri: "https://anilist.co/api/v2/oauth/pin",
    code: VALID_CODE,
  });
  assert.deepEqual(await response.json(), { access_token: "test-access-token-123456789" });
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "http://localhost:1420");
});

test("Bear API proxies only allowlisted public content without forwarding request data", async () => {
  let upstreamUrl = "";
  let upstreamInit: RequestInit | undefined;
  const upstreamFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    upstreamUrl = String(input);
    upstreamInit = init;
    return new Response(
      JSON.stringify({ image: "https://harbor.site/badges/minimal/res-4k.webp" }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  const response = await handleRequest(
    new Request("https://api.7mood.net/badges/minimal.json?ignored=1", {
      headers: { Authorization: "must-not-be-forwarded", Origin: "http://localhost:1420" },
    }),
    environment(),
    upstreamFetch,
  );

  assert.equal(response.status, 200);
  assert.equal(upstreamUrl, "https://harbor.site/badges/minimal.json");
  assert.deepEqual(upstreamInit?.headers, { Accept: "application/json" });
  assert.deepEqual(await response.json(), {
    image: "https://api.7mood.net/badges/minimal/res-4k.webp",
  });
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "http://localhost:1420");
  assert.equal(
    (await handleRequest(new Request("https://api.7mood.net/api/tvdb/v4"), environment(), upstreamFetch)).status,
    404,
  );
});

test("Bear API rejects invalid public-content responses", async () => {
  const wrongType = async () => new Response("<html></html>", {
    status: 200,
    headers: { "Content-Type": "text/html" },
  });
  assert.equal(
    (await handleRequest(new Request("https://api.7mood.net/announcements.json"), environment(), wrongType)).status,
    502,
  );

  const oversized = async () => new Response("{}", {
    status: 200,
    headers: { "Content-Type": "application/json", "Content-Length": "3000000" },
  });
  assert.equal(
    (await handleRequest(new Request("https://api.7mood.net/announcements.json"), environment(), oversized)).status,
    502,
  );
});
