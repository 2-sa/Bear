// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { readFileSync } from "node:fs";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("popular manga keeps a stable position before optional personalized rows", () => {
  const source = read("../src/views/manga.tsx");
  const popular = source.indexOf('title="Popular Manga"');
  const anilist = source.indexOf("<AnilistMangaRows");
  const watched = source.indexOf("<BecauseYouWatched");

  assert.ok(popular >= 0);
  assert.ok(anilist > popular);
  assert.ok(watched > anilist);
});

test("optional manga rows stay hidden until they have real content", () => {
  const anilist = read("../src/views/manga/anilist-manga-rows.tsx");
  const watched = read("../src/views/manga/because-you-watched.tsx");

  assert.match(anilist, /if \(rails\.length === 0\) return null;/);
  assert.doesNotMatch(anilist, /items=\{null\}/);
  assert.match(watched, /if \(recs\.length === 0\) return null;/);
  assert.doesNotMatch(watched, /animate-pulse/);
});
