// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import {
  subtitleContextTitle,
  subtitleStreamDescriptor,
  subtitleTitleOf,
} from "../src/lib/subtitles/provider-label.ts";

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

test("an opaque addon subtitle uses playback details without replacing its provider", () => {
  const displayTitle = subtitleContextTitle({
    title: "The Sopranos",
    season: 2,
    episode: 2,
    filename: "The.Sopranos.S02E02.1080p.BluRay.x264-OFT.mkv",
  });

  assert.equal(displayTitle, "The Sopranos · S02E02 · BluRay · 1080p · x264");
  assert.equal(
    subtitleTitleOf({
      source: "addon",
      title: "AIOStreams | ElfHosted",
      displayTitle,
      url: "https://example.invalid/i",
    }),
    displayTitle,
  );
});

test("preserves selected stream quality when the parsed title only contains the movie name", () => {
  const descriptor = subtitleStreamDescriptor({
    title: "The Lord of the Rings: The Return of the King",
    parsedTitle: "The Lord of the Rings: The Return of the King",
    source: "REMUX",
    resolution: "4K",
    quality: "4K · Dolby Vision · TrueHD 7.1",
    releaseGroup: "FRAMESTOR",
  });

  assert.equal(
    subtitleContextTitle({
      title: "The Lord of the Rings: The Return of the King",
      filename: descriptor,
    }),
    "The Lord of the Rings: The Return of the King · REMUX · 2160p · Dolby Vision · TrueHD",
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
