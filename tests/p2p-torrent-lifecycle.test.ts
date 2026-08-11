// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { readFileSync } from "node:fs";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";

const at = (path: string) => new URL(`../${path}`, import.meta.url);
const read = (path: string) => readFileSync(at(path), "utf8");

const engine = read("src-tauri/src/torrent_engine.rs");
const streamRoute = read("src-tauri/src/torrent_engine/stream_route.rs");
const resolve = read("src/lib/streams/resolve.ts");
const usage = read("src/lib/torrent/local-engine.ts");
const playerMedia = read("src/views/player/hooks/use-player-media.ts");
const downloads = read("src/lib/download/downloads-store.ts");
const magnetCard = read("src/components/search/magnet-card.tsx");

test("selecting a torrent file does not start peer transfer", () => {
  const start = engine.indexOf("pub async fn torrent_engine_select");
  const end = engine.indexOf("pub async fn torrent_engine_stats", start);
  assert.ok(start >= 0 && end > start, "torrent_engine_select block is missing");
  const select = engine.slice(start, end);
  assert.match(select, /update_only_files\(&handle, &only\)/);
  assert.doesNotMatch(select, /\.unpause\(/);
});

test("the local HTTP stream request starts a paused torrent on demand", () => {
  assert.match(streamRoute, /if handle\.is_paused\(\)/);
  assert.match(streamRoute, /session\.unpause\(&handle\)\.await/);
});

test("persisted torrents are paused at startup and before a clean shutdown", () => {
  const prePause = engine.indexOf("mark_persisted_torrents_paused(&dir)");
  const restore = engine.indexOf("new_session(&dir, true, true, true)");
  assert.ok(prePause >= 0 && restore > prePause, "session JSON must be paused before restore");
  assert.match(
    engine,
    /record\.insert\("is_paused"\.to_string\(\), serde_json::Value::Bool\(true\)\)/,
  );
  assert.match(engine, /pause_all_torrents\(&session\)\.await;/);
  const shutdown = engine.slice(
    engine.indexOf("async fn finish_session_stop"),
    engine.indexOf("pub async fn stop_async"),
  );
  assert.match(shutdown, /pause_all_torrents\(&session\)\.await;/);
  assert.match(shutdown, /session\.stop\(\)\.await;/);
});

test("a canceled P2P resolve cleans up only a torrent created by that resolve", () => {
  assert.match(resolve, /registerAbortCleanup\(added, signal\)/);
  assert.match(resolve, /if \(added\.already_managed === true\) return;/);
  assert.match(resolve, /signal\.addEventListener\("abort", cleanup, \{ once: true \}\)/);
  assert.doesNotMatch(resolve, /startFullDownload/);
});

test("players and downloads explicitly own local-engine torrents", () => {
  assert.match(usage, /export function retainTorrentUsage/);
  assert.match(usage, /export function releaseTorrentUsage/);
  assert.match(usage, /pausedOwners/);
  assert.match(playerMedia, /retainTorrentUsage\(hash, ownerId\)/);
  assert.match(playerMedia, /releaseTorrentUsage\(hash, ownerId/);
  assert.match(downloads, /retainDownloadTorrent\(item\)/);
  assert.match(downloads, /pauseTorrentUsage\(engine\.infoHash, torrentOwnerId\(id\)\)/);
  assert.match(
    downloads,
    /releaseTorrentUsage\(engine\.infoHash, torrentOwnerId\(item\.id\), \{ deleteFiles: true \}\)/,
  );
});

test("full-file P2P downloading starts only after the player owns the torrent", () => {
  const retain = playerMedia.indexOf("retainTorrentUsage(hash, ownerId)");
  const full = playerMedia.indexOf("startFullDownload(hash, src.url)");
  assert.ok(retain >= 0 && full > retain);
});

test("closing magnet setup removes a newly-created torrent before player handoff", () => {
  assert.match(magnetCard, /pendingEngineRef/);
  assert.match(magnetCard, /scheduleTorrentRemoval\(infoHash, false, 0\)/);
  assert.match(magnetCard, /if \(added\.already_managed !== true\)/);
  assert.match(magnetCard, /startPlay\(videos\[0\]\.idx, videos\[0\]\.name, added\)/);
});
