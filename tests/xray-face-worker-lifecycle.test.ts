// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { readFileSync } from "node:fs";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";

const at = (path: string) => new URL(`../${path}`, import.meta.url);
const read = (path: string) => readFileSync(at(path), "utf8");

const engine = read("src/lib/face/face-engine.ts");
const gallery = read("src/lib/face/cast-embeddings.ts");
const overlay = read("src/components/player/xray/xray-overlay.tsx");

test("X-Ray worker requests are bounded and aborted gallery work terminates inference", () => {
  assert.match(engine, /FACE_ENGINE_REQUEST_TIMEOUT_MS/);
  assert.match(engine, /options\.signal\?\.addEventListener\("abort", onAbort/);
  assert.match(engine, /stopWorker\(current, new DOMException\("Aborted", "AbortError"\)\)/);
  assert.match(gallery, /embedLargestFace\(bmp, signal\)/);
});

test("X-Ray closes bitmaps on failed transfer and restricts cast image fetches", () => {
  assert.match(engine, /closeBitmap\(bitmap\)/);
  assert.match(gallery, /ALLOWED_CAST_IMAGE_HOSTS/);
  assert.match(gallery, /url\.protocol !== "https:"/);
  assert.match(overlay, /MAX_CAST_IMAGE_BYTES/);
  assert.match(overlay, /contentType\.startsWith\("image\/"\)/);
});
