// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { readFileSync } from "node:fs";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";

const provider = readFileSync(
  new URL("../src/lib/manga/sources/suwayomi/provider.ts", import.meta.url),
  "utf8",
);
const browse = readFileSync(
  new URL("../src/views/manga/manga-browse.tsx", import.meta.url),
  "utf8",
);
const virtualGrid = readFileSync(
  new URL("../src/components/virtual-grid.tsx", import.meta.url),
  "utf8",
);
const filters = readFileSync(
  new URL("../src/views/manga/manga-browse/filters.tsx", import.meta.url),
  "utf8",
);

test("Suwayomi browse without a selected source browses installed sources, not only the library", () => {
  assert.match(provider, /browseInstalledSources\("popular", offset, ""\)/);
  assert.match(provider, /browseInstalledSources\("search", offset, q\)/);
});

test("manga browse uses TanStack Query and the shared virtual grid", () => {
  assert.match(browse, /useInfiniteQuery/);
  assert.match(browse, /queryKeys\.manga\.browse\(sourceId, debouncedQuery, tagId\)/);
  assert.match(browse, /setTagId\(""\)/);
  assert.match(browse, /<VirtualGrid/);
  assert.match(virtualGrid, /scrollMargin/);
  assert.match(filters, /useQuery<MangaTag\[\]>/);
  assert.match(filters, /queryKeys\.manga\.tags\(sourceId\)/);
});
