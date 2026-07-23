// @ts-nocheck -- Node's test modules are not included in the application tsconfig.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  NETWORK_CONFIG,
  createNetworkConfig,
  validateControlledAssetUrl,
  validateControlledDownloadUrl,
  validateRelayUrl,
  workerRoutes,
} from "../src/lib/network-config.ts";

test("invalid overrides fail closed while runtime uses the project-owned Worker", () => {
  assert.deepEqual(createNetworkConfig({}), {
    workerProxyBase: null,
    publicAppOrigin: null,
    publicRelayUrl: null,
    publicSiteOrigin: null,
    assetOrigin: null,
  });
  assert.equal(NETWORK_CONFIG.workerProxyBase, "https://harbor-api-proxy.xyz7.workers.dev");
  assert.equal(
    workerRoutes.traktToken(),
    "https://harbor-api-proxy.xyz7.workers.dev/v1/oauth/trakt/token",
  );
});

test("native updater and frontend use the same Worker origin", () => {
  const tauriConfig = JSON.parse(
    readFileSync(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8"),
  );
  const endpoint = new URL(tauriConfig.plugins.updater.endpoints[0]);
  assert.equal(endpoint.origin, NETWORK_CONFIG.workerProxyBase);
  assert.equal(endpoint.pathname, "/v1/updates/latest.json");
});

test("accepts separate secure deployment origins", () => {
  assert.deepEqual(
    createNetworkConfig({
      VITE_HARBOR_WORKER_PROXY_BASE: "https://api.example.test/",
      VITE_HARBOR_PUBLIC_APP_ORIGIN: "https://app.example.test",
      VITE_HARBOR_PUBLIC_RELAY_URL: "wss://relay.example.test/socket",
      VITE_HARBOR_PUBLIC_SITE_ORIGIN: "https://www.example.test",
      VITE_HARBOR_ASSET_ORIGIN: "https://assets.example.test",
    }),
    {
      workerProxyBase: "https://api.example.test",
      publicAppOrigin: "https://app.example.test",
      publicRelayUrl: "wss://relay.example.test/socket",
      publicSiteOrigin: "https://www.example.test",
      assetOrigin: "https://assets.example.test",
    },
  );
});

test("rejects insecure, credentialed, and ambient URL components", () => {
  const config = createNetworkConfig({
    VITE_HARBOR_WORKER_PROXY_BASE: "http://api.example.test",
    VITE_HARBOR_PUBLIC_APP_ORIGIN: "https://user:pass@app.example.test",
    VITE_HARBOR_PUBLIC_RELAY_URL: "wss://relay.example.test/socket?token=secret",
    VITE_HARBOR_PUBLIC_SITE_ORIGIN: "https://www.example.test/#download",
    VITE_HARBOR_ASSET_ORIGIN: "https://assets.example.test/cdn",
  });
  assert.deepEqual(config, {
    workerProxyBase: null,
    publicAppOrigin: null,
    publicRelayUrl: null,
    publicSiteOrigin: null,
    assetOrigin: null,
  });
});

test("rejects private relay targets even when the scheme is secure", () => {
  assert.equal(validateRelayUrl("wss://127.0.0.1"), null);
  assert.equal(validateRelayUrl("wss://192.168.1.25/socket"), null);
  assert.equal(validateRelayUrl("wss://[::1]/socket"), null);
});

test("accepts only public WSS relay URLs without credentials, query, or fragment", () => {
  assert.equal(
    validateRelayUrl("wss://my-relay.account.workers.dev/socket"),
    "wss://my-relay.account.workers.dev/socket",
  );
  assert.equal(
    validateRelayUrl("wss://relay.example.test/socket"),
    "wss://relay.example.test/socket",
  );
  assert.equal(validateRelayUrl("ws://relay.example.test/socket"), null);
  assert.equal(validateRelayUrl("wss://user@relay.example.test/socket"), null);
  assert.equal(validateRelayUrl("wss://relay.example.test/socket?room=secret"), null);
  assert.equal(validateRelayUrl("wss://relay.example.test/socket#room"), null);
});

test("separates controlled theme assets from immutable update artifacts", () => {
  const config = createNetworkConfig({
    VITE_HARBOR_WORKER_PROXY_BASE: "https://api.example.test",
    VITE_HARBOR_ASSET_ORIGIN: "https://assets.example.test",
  });
  assert.equal(
    validateControlledAssetUrl("https://assets.example.test/themes/cover.png", config),
    "https://assets.example.test/themes/cover.png",
  );
  assert.equal(
    validateControlledAssetUrl("https://api.example.test/v1/oauth/mal/token", config),
    null,
  );
  assert.equal(
    validateControlledDownloadUrl(
      "https://api.example.test/v1/updates/artifacts/windows/app.exe",
      config,
    ),
    "https://api.example.test/v1/updates/artifacts/windows/app.exe",
  );
  assert.equal(
    validateControlledDownloadUrl("https://api.example.test/v1/oauth/mal/token", config),
    null,
  );
});
