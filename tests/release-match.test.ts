// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import { parseRelease, releaseAffinity } from "../src/lib/subtitles/release-match.ts";

test("matching a subtitle release ranks it above a conflicting release", () => {
  const stream = parseRelease("Example.Show.S01E01.1080p.WEB-DL-GROUP");
  const matching = releaseAffinity(stream, "Example.Show.S01E01.1080p.WEB-DL-GROUP.srt");
  const conflicting = releaseAffinity(stream, "Example.Show.S01E01.720p.BluRay-OTHER.srt");

  assert.ok(matching.score > conflicting.score);
  assert.ok(matching.reasons.length > 0);
});
