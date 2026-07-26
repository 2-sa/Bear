// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { readFileSync } from "node:fs";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("standalone manga reader remote has the settings context its mobile provider requires", () => {
  const entry = read("../src/views/manga-reader-app.tsx");

  assert.match(entry, /import \{ SettingsProvider \} from "@\/lib\/settings"/);
  assert.match(entry, /<SettingsProvider>\s*<MobileRemoteProvider>/);
  assert.match(entry, /<\/MobileRemoteProvider>\s*<\/SettingsProvider>/);
});

test("reader phone control offers to enable Remote Control instead of exposing a dead link", () => {
  const phoneRemote = read("../src/views/manga/manga-reader/reader-phone-remote.tsx");

  assert.match(phoneRemote, /useSettings/);
  assert.match(phoneRemote, /settings\.serveWebUi \|\| settings\.remoteControlEnabled/);
  assert.match(phoneRemote, /Enable Remote Control/);
  assert.match(phoneRemote, /update\(\{ remoteControlEnabled: true \}\)/);
});

test("a full manga refresh discards active plugin workers as well as source caches", () => {
  const api = read("../src/lib/manga/api.ts");
  const sources = read("../src/lib/manga/sources.ts");

  assert.match(api, /disposeAllPlugins/);
  assert.match(api, /disposeAllPlugins\(\)/);
  assert.match(sources, /subscribePlugins\(\(\) => notify\(\)\)/);
  assert.match(sources, /subscribeMangayomiSources\(\(\) => notify\(\)\)/);
  assert.match(sources, /subscribeCommunity\(\(\) => notify\(\)\)/);
});

test("manual Suwayomi source and extension refreshes invalidate manga data changed outside Harbor", () => {
  const sourcePicker = read("../src/views/manga/manga-sources-panel/suwayomi/source-picker.tsx");
  const extensions = read("../src/views/manga/manga-sources-panel/suwayomi/extensions-manager.tsx");

  assert.match(sourcePicker, /notifyMangaDataChanged/);
  assert.match(extensions, /notifyMangaDataChanged/);
});
