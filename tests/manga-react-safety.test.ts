// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { readFileSync } from "node:fs";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { describe, it } from "node:test";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("manga React state safety", () => {
  it("publishes the complete remote binding instead of a partial dependency snapshot", () => {
    const source = read("../src/lib/remote/use-manga-remote-binding.ts");

    assert.match(source, /type Params = RemoteMangaBinding/);
    assert.match(source, /registerRemoteManga\(params\)/);
    assert.doesNotMatch(source, /ref\.current = params/);
    assert.doesNotMatch(source, /params\.spread\.join/);
  });

  it("uses the current page URL array directly", () => {
    const source = read("../src/views/mobile/manga-read/manga-local-reader.tsx");

    assert.match(source, /const pages = m\?\.pageUrls \?\? \[\];/);
    assert.doesNotMatch(source, /rawPages\?\.\[0\]/);
  });

  it("does not reset proxied image state during render", () => {
    const source = read("../src/views/mobile/manga-read/proxied-img.tsx");

    assert.doesNotMatch(source, /prev\.current/);
    assert.doesNotMatch(source, /setSrc\(url\)/);
  });

  it("does not mirror strip props into refs during render", () => {
    const source = read("../src/views/mobile/manga-read/mode-strip.tsx");

    assert.doesNotMatch(source, /change\.current = onPageChange/);
    assert.doesNotMatch(source, /firstUrl/);
  });

  it("connects source suggestions to the sources panel", () => {
    const sourcePanel = read("../src/views/manga/manga-sources-panel.tsx");

    assert.match(sourcePanel, /import \{ SuggestSection \}/);
    assert.match(sourcePanel, /<SuggestSection \/>/);
  });
});
