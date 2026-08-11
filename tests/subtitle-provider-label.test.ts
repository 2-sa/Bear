// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import { subtitleTitleOf } from "../src/lib/subtitles/provider-label.ts";

test("loaded addon subtitles use their release as the visible track title", () => {
  assert.equal(
    subtitleTitleOf({
      source: "addon",
      title: "AIOStreams | ElfHosted",
      release: "Movie.2024.2160p.BluRay.REMUX-FraMeSToR",
      url: "https://example.invalid/subtitle.srt",
    }),
    "Movie.2024.2160p.BluRay.REMUX-FraMeSToR",
  );
});

test("a meaningful subtitle filename is used when a provider omits release data", () => {
  assert.equal(
    subtitleTitleOf({
      source: "addon",
      title: "AIOStreams | ElfHosted",
      url: "https://example.invalid/Movie.2024.2160p.BluRay.REMUX-FraMeSToR.srt",
    }),
    "Movie 2024 2160p BluRay REMUX-FraMeSToR",
  );
});

test("the provider name remains the safe fallback when no release details exist", () => {
  assert.equal(
    subtitleTitleOf({
      source: "addon",
      title: "AIOStreams | ElfHosted",
      url: "https://example.invalid/subtitles",
    }),
    "AIOStreams | ElfHosted",
  );
});

test("placeholder release values are ignored", () => {
  assert.equal(
    subtitleTitleOf({
      source: "addon",
      title: "AIOStreams | ElfHosted",
      release: "i",
      url: "https://example.invalid/subtitles",
    }),
    "AIOStreams | ElfHosted",
  );
});
