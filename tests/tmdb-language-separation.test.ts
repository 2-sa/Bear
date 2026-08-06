// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { readFileSync } from "node:fs";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";

const clientSource = readFileSync(
  new URL("../src/lib/providers/tmdb/tmdb-client.ts", import.meta.url),
  "utf8",
);
const detailsSource = readFileSync(
  new URL("../src/lib/providers/tmdb/tmdb-details.ts", import.meta.url),
  "utf8",
);
const imagesSource = readFileSync(
  new URL("../src/lib/providers/tmdb/tmdb-images.ts", import.meta.url),
  "utf8",
);
test("TMDB metadata requests never fall back to the artwork language", () => {
  assert.match(clientSource, /const lang = effectiveTmdbLanguage\(\);/);
  assert.doesNotMatch(clientSource, /imageRequestLang/);
  assert.match(clientSource, /if \(lang && !params\.language\)/);
});

test("TMDB artwork requests keep their independent language preference", () => {
  assert.match(detailsSource, /include_image_language: imageLangParam\(\)/);
  assert.match(imagesSource, /include_image_language: imageLangParam\(originalLang\)/);
});
