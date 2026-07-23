// @ts-nocheck -- Node and Worker test types are intentionally outside the app tsconfig.
import assert from "node:assert/strict";
import test from "node:test";
import { matchRoute, stripThemeCode } from "../src-tauri/proxy/worker.js";

const env = {
  UPDATES_ORIGIN: "https://updates.example.test",
  CONTENT_ORIGIN: "https://content.example.test",
  REPORTS_ORIGIN: "https://reports.example.test",
  THEMES_ORIGIN: "https://themes.example.test",
};

function request(path: string, method = "GET"): Request {
  return new Request(`https://proxy.example.test${path}`, { method });
}

test("maps fixed update routes without accepting a target URL", () => {
  const plan = matchRoute(request("/v1/updates/latest.json"), env);
  assert.equal(plan.routeKey, "updates.latest");
  assert.equal(plan.upstream.href, "https://updates.example.test/updates/latest.json");
});

test("allows only fixed update artifact paths", () => {
  const plan = matchRoute(request("/v1/updates/artifacts/windows/x64/harbor-1.2.3.exe"), env);
  assert.equal(plan.routeKey, "updates.artifact");
  assert.equal(
    plan.upstream.href,
    "https://updates.example.test/updates/artifacts/windows/x64/harbor-1.2.3.exe",
  );
  assert.throws(
    () => matchRoute(request("/v1/updates/artifacts/%2e%2e/secret"), env),
    /route not found/,
  );
});

test("rejects unrecognized and generic forwarding routes", () => {
  assert.throws(() => matchRoute(request("/proxy?u=https://example.com"), env), /route not found/);
});

test("accepts only bounded IMDb identifiers", () => {
  const plan = matchRoute(request("/v1/content/imdb/title/tt1234567"), env);
  assert.equal(plan.routeKey, "content.imdb_title");
  assert.throws(
    () => matchRoute(request("/v1/content/imdb/title/../../secret"), env),
    /route not found/,
  );
});

test("rejects arbitrary TVDB paths and query keys", () => {
  const valid = matchRoute(
    request("/v1/content/tvdb/v4/series/123/episodes/default?season=2"),
    env,
  );
  assert.equal(valid.routeKey, "content.tvdb_v4");
  assert.throws(
    () =>
      matchRoute(
        request("/v1/content/tvdb/v4/series/123/episodes/default?redirect=https://evil.test"),
        env,
      ),
    /route not found/,
  );
});

test("requires configured upstreams to be clean HTTPS origins", () => {
  assert.throws(
    () =>
      matchRoute(request("/v1/updates/latest.json"), {
        ...env,
        UPDATES_ORIGIN: "http://127.0.0.1:8080?token=x",
      }),
    /must be an HTTPS origin/,
  );
});

test("rejects unexpected theme filters", () => {
  assert.equal(matchRoute(request("/v1/themes?sort=top&q=blue"), env).routeKey, "themes.list");
  assert.throws(
    () => matchRoute(request("/v1/themes?redirect=https://evil.test"), env),
    /route not found/,
  );
});

test("CORS preflight permits authenticated theme management", async () => {
  const worker = (await import("../src-tauri/proxy/worker.js")).default;
  const response = await worker.fetch(
    new Request("https://proxy.example.test/v1/themes/theme-1/delete", {
      method: "OPTIONS",
      headers: {
        Origin: "https://app.example.test",
        "Access-Control-Request-Headers": "authorization",
      },
    }),
    {
      ...env,
      ENVIRONMENT: "production",
      ALLOWED_ORIGINS: "https://app.example.test",
    },
    { waitUntil() {} },
  );
  assert.equal(response.status, 204);
  assert.match(response.headers.get("access-control-allow-headers"), /authorization/);
});

test("strips executable community-theme fields", () => {
  assert.deepEqual(
    stripThemeCode({
      id: "theme-1",
      name: "Safe colors",
      tokens: { accent: "#fff" },
      css: "@import url(https://evil.test)",
      js: "globalThis.compromised = true",
      html: "<iframe src='https://evil.test'>",
    }),
    {
      id: "theme-1",
      name: "Safe colors",
      tokens: { accent: "#fff" },
    },
  );
});
