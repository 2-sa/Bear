// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { readFileSync } from "node:fs";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";

const at = (path: string) => new URL(`../${path}`, import.meta.url);
const read = (path: string) => readFileSync(at(path), "utf8");

const bridge = read("src/lib/player/bridge.ts");
const mpv = read("src/lib/player/mpv.ts");
const html5 = read("src/lib/player/html5/bridge.ts");
const loader = read("src/views/player/cinematic-player-loader.tsx");
const picker = read("src/views/play-picker.tsx");
const bridgeLoad = read("src/views/player/hooks/use-bridge-load.ts");
const sync = read("src/views/player/hooks/use-stremio-sync.ts");
const nativeMpv = read("src-tauri/src/mpv.rs");

test("player snapshots expose a resettable first-frame readiness signal", () => {
  assert.match(bridge, /firstFrameReady: boolean/);
  assert.match(bridge, /firstFrameReady: false/);
  assert.match(mpv, /snap\.firstFrameReady = false/);
  assert.match(html5, /snap\.firstFrameReady = false/);
});

test("mpv uses PlaybackRestart rather than FileLoaded as first-frame readiness", () => {
  const fileLoaded = mpv.slice(
    mpv.indexOf('raw.event === "file-loaded"'),
    mpv.indexOf('raw.event === "playback-restart"'),
  );
  const playbackRestart = mpv.slice(
    mpv.indexOf('raw.event === "playback-restart"'),
    mpv.indexOf("return {", mpv.indexOf('raw.event === "playback-restart"')),
  );
  assert.doesNotMatch(fileLoaded, /firstFrameReady = true/);
  assert.match(playbackRestart, /firstFrameReady = true/);
  assert.match(loader, /snap\.firstFrameReady/);
});

test("first-frame readiness ignores a stale event from the previous media path", () => {
  assert.match(nativeMpv, /\("path", 20, PropertyKind::String\)/);
  assert.match(mpv, /expectedMediaPath = src\.url/);
  assert.match(mpv, /observedMediaPath &&/);
  assert.match(mpv, /normalizeMediaPath\(expectedMediaPath\)/);
});

test("native startup logs classify sources without printing private playback URLs", () => {
  assert.match(nativeMpv, /start source_kind=\{\}/);
  assert.match(nativeMpv, /loadfile source_kind=\{\}/);
  assert.doesNotMatch(nativeMpv, /start url=\{\}/);
  assert.doesNotMatch(nativeMpv, /loadfile \{\}", args\.url/);
});

test("startup subtitle downloads no longer block the initial media load", () => {
  assert.match(mpv, /subtitles: \[\]/);
  assert.match(mpv, /void addSeedSubtitles\(src\.subtitles, activeLoadId\)/);
  const coldStart = mpv.indexOf('await invoke("mpv_start"');
  const deferredSubtitles = mpv.indexOf("void addSeedSubtitles", coldStart);
  assert.ok(coldStart >= 0 && deferredSubtitles > coldStart);
});

test("mpv capability probing is shared for the application lifetime", () => {
  assert.match(mpv, /let mpvProbePromise: Promise<MpvProbe> \| null = null/);
  assert.match(mpv, /if \(mpvProbePromise\) return mpvProbePromise/);
});

test("resume state is prefetched and shared instead of duplicated on play", () => {
  assert.match(picker, /prefetchResumeStart\(/);
  assert.match(bridgeLoad, /resolveStartMs\(/);
  assert.match(sync, /resumeLibraryGetOne\(authKey, canonicalId\)/);
});
