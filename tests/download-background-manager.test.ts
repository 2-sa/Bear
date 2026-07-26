// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { readFileSync } from "node:fs";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("background retention is opt-in and guards both torrent removal paths", () => {
  const defaults = source("../src/lib/settings/defaults.ts");
  const media = source("../src/views/player/hooks/use-player-media.ts");

  assert.match(defaults, /keepStreamDownloadsInBackground:\s*false/);
  assert.match(media, /if \(!keepInBackground\) void torrentEngineRemove/);
  assert.match(media, /if \(hash && !keepInBackground\) scheduleTorrentRemoval/);
  assert.match(media, /settings\.keepStreamDownloadsInBackground/);
});

test("downloads page polls active torrents only while its TanStack view is active", () => {
  const app = source("../src/App.tsx");
  const downloads = source("../src/views/downloads.tsx");
  const activeTorrents = source("../src/views/downloads/use-active-torrents.ts");

  assert.match(app, /<DownloadsView active=\{downloadsTop\}\s*\/>/);
  assert.match(downloads, /<StreamingNowButton active=\{active\}\s*\/>/);
  assert.match(activeTorrents, /if \(!active\) return/);
  assert.match(activeTorrents, /window\.setInterval\(tick,\s*1500\)/);
  assert.match(activeTorrents, /window\.clearInterval\(id\)/);
});

test("native and TypeScript layers expose list, pause, and resume commands", () => {
  const native = source("../src-tauri/src/torrent_engine.rs");
  const commandList = source("../src-tauri/src/lib.rs");
  const client = source("../src/lib/torrent/local-engine.ts");

  for (const command of ["torrent_engine_list", "torrent_engine_pause", "torrent_engine_resume"]) {
    assert.match(native, new RegExp(`fn ${command}`));
    assert.match(commandList, new RegExp(`torrent_engine::${command}`));
    assert.match(client, new RegExp(`"${command}"`));
  }
});
