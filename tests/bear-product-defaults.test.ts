import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createServer } from "vite";

const EXPECTED_RELAY = "wss://harbor-together-relay.xyz7.workers.dev";

test("Bear-owned defaults survive upstream syncs", async (context) => {
  const server = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });
  context.after(() => server.close());

  const { DEFAULT } = await server.ssrLoadModule("/src/lib/settings/defaults.ts");
  const { DEFAULT_THEME } = await server.ssrLoadModule("/src/lib/theme.ts");
  const { DISCORD_PARTY_JOIN_ENABLED } = await server.ssrLoadModule(
    "/src/lib/discord/presence.ts",
  );

  assert.equal(DEFAULT_THEME.preset, "tokyo-night");
  assert.equal(DEFAULT.region, "SA");
  assert.equal(DEFAULT.uiLanguage, "ar");
  assert.equal(DEFAULT.tmdbLanguage, "ar-SA");
  assert.deepEqual(DEFAULT.preferredLanguages, ["Arabic"]);
  assert.deepEqual(DEFAULT.preferredSubLangs, ["Arabic"]);
  assert.deepEqual(DEFAULT.preferredAudioLangs, ["Arabic", "English", "Japanese"]);
  assert.deepEqual(DEFAULT.tmdbImageLangs, ["Arabic", "Original"]);
  assert.equal(DEFAULT.discordRichPresence, false);
  assert.equal(DEFAULT.discordShowPartyJoin, false);
  assert.equal(DEFAULT.episodeLayout, "grid");
  assert.equal(DEFAULT.contentAdvisoryToast, true);
  assert.equal(DEFAULT.streamFilterLevel, "balanced");
  assert.equal(DEFAULT.togetherRelayUrl, EXPECTED_RELAY);
  assert.deepEqual(DEFAULT.iptvPlaylists, [
    {
      id: "iptv-org-arabic",
      name: "عربي",
      url: "https://iptv-org.github.io/iptv/languages/ara.m3u",
      kind: "m3u",
    },
    {
      id: "iptv-org-global",
      name: "عالمي",
      url: "https://iptv-org.github.io/iptv/index.m3u",
      kind: "m3u",
    },
  ]);
  assert.equal(DISCORD_PARTY_JOIN_ENABLED, false);

  const anilistConfig = readFileSync(
    new URL("../src/lib/anilist/config.ts", import.meta.url),
    "utf8",
  );
  assert.match(anilistConfig, /ANILIST_CLIENT_ID = "42941"/);
  assert.match(
    anilistConfig,
    /ANILIST_TOKEN_EXCHANGE_URL = `\$\{HARBOR_BUGS_BASE\}\/v1\/anilist\/token`/,
  );
  const endpointConfig = readFileSync(new URL("../src/lib/config/endpoints.ts", import.meta.url), "utf8");
  assert.match(endpointConfig, /HARBOR_BUGS_BASE[\s\S]*https:\/\/bugs\.harbor\.site/);
  assert.doesNotMatch(anilistConfig, /43455|api\.7mood\.net/);

  const discordNative = readFileSync(
    new URL("../src-tauri/src/discord_rp.rs", import.meta.url),
    "utf8",
  );
  assert.match(discordNative, /const APP_ID: &str = "1527138265033998437";/);
  assert.match(discordNative, /const SMALL_IMAGE_KEY: &str = "bear_logo";/);
  assert.doesNotMatch(discordNative, /1510339683215736892|harbor_logo/);

  const languagePanel = readFileSync(
    new URL("../src/views/settings/language-panel.tsx", import.meta.url),
    "utf8",
  );
  assert.match(languagePanel, /https:\/\/github\.com\/2-sa\/Bear/);
  assert.doesNotMatch(languagePanel, /https:\/\/github\.com\/harborstremio\/harbor/);
});
