// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { readFileSync } from "node:fs";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { describe, it } from "node:test";

import { collapseMangaDuplicates } from "../src/lib/manga/dedupe.ts";
import { decodeMangaGroup, encodeMangaGroup } from "../src/lib/manga/sources/suwayomi/group-id.ts";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("manga duplicate grouping", () => {
  it("collapses equivalent Unicode titles while preserving every source variant", () => {
    const grouped = collapseMangaDuplicates([
      { id: "source-a", title: "ون بيس" },
      { id: "source-b", title: "ون بيس!" },
      { id: "source-c", title: "بلو لوك" },
    ]);

    assert.equal(grouped.length, 2);
    assert.deepEqual(grouped[0]?.variantIds, ["source-a", "source-b"]);
    assert.deepEqual(grouped[1]?.variantIds, ["source-c"]);
  });

  it("matches an alternate title without losing the primary result", () => {
    const grouped = collapseMangaDuplicates([
      { id: "source-a", title: "Sousou no Frieren", altTitle: "Frieren" },
      { id: "source-b", title: "Frieren" },
    ]);

    assert.equal(grouped.length, 1);
    assert.equal(grouped[0]?.id, "source-a");
    assert.deepEqual(grouped[0]?.variantIds, ["source-a", "source-b"]);
  });

  it("round-trips grouped Suwayomi ids", () => {
    const ids = ["123~456", "789~1011"];
    const encoded = encodeMangaGroup(ids);

    assert.notEqual(encoded, ids[0]);
    assert.deepEqual(decodeMangaGroup(encoded), ids);
    assert.deepEqual(decodeMangaGroup(ids[0]), [ids[0]]);
  });

  it("deduplicates the popular rail and invalidates legacy duplicate caches", () => {
    const rail = read("../src/views/manga/manga-rail.tsx");
    const api = read("../src/lib/manga/api.ts");
    const storageRecovery = read("../src/lib/storage-recovery.ts");

    assert.match(rail, /collapseMangaDuplicates/);
    assert.match(rail, /collapseMangaDuplicates\(sourceItems\)/);
    assert.match(api, /harbor\.manga\.cache\.v3\./);
    assert.match(storageRecovery, /harbor\.manga\.cache\.v3\./);
  });
});

describe("manga reader progressive loading", () => {
  it("virtualizes the vertical strip and only activates nearby protected images", () => {
    const reader = read("../src/views/manga/manga-reader.tsx");
    const pageImage = read("../src/views/manga/manga-reader/page-image.tsx");

    assert.match(reader, /@tanstack\/react-virtual/);
    assert.match(reader, /useVirtualizer\(/);
    assert.match(reader, /getVirtualItems\(\)/);
    assert.match(pageImage, /IntersectionObserver/);
    assert.match(pageImage, /rootMargin:\s*"[^"]+"/);
  });

  it("keeps the Lucide loader centered around its own SVG box", () => {
    const states = read("../src/views/manga/manga-reader/reader-states.tsx");

    assert.match(states, /Loader2/);
    assert.match(states, /origin-center/);
    assert.match(states, /\[transform-box:view-box\]/);
    assert.match(states, /motion-reduce:animate-none/);
  });

  it("shows each chapter page count beside its source metadata", () => {
    const chapterList = read("../src/views/manga/manga-detail/chapter-list.tsx");

    assert.match(chapterList, /chapter\.pages/);
    assert.match(chapterList, /t\("\{n\} pages"/);
  });
});
