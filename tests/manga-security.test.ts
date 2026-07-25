// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import {
  assertNetworkSafeUrl,
  resolveNetworkSafeRedirect,
} from "../src/lib/manga/plugins/http-security.ts";
import { isExpectedChapterDir } from "../src/lib/manga/download-path.ts";

test("plugin redirects are resolved and revalidated before following", () => {
  assert.equal(
    resolveNetworkSafeRedirect("https://example.com/chapters/1", "/login"),
    "https://example.com/login",
  );
  assert.throws(
    () => resolveNetworkSafeRedirect("https://example.com/chapters/1", "http://127.0.0.1/private"),
    /blocked private host/,
  );
  assert.throws(
    () => resolveNetworkSafeRedirect("https://example.com/chapters/1", "file:///etc/passwd"),
    /scheme not allowed/,
  );
  assert.equal(assertNetworkSafeUrl("https://example.com/page"), "https://example.com/page");
});

test("chapter deletion only accepts the exact generated chapter directory", () => {
  const expected = "/downloads/manga/title/chapter-1";
  assert.equal(isExpectedChapterDir(expected, expected), true);
  assert.equal(isExpectedChapterDir(`${expected}/`, expected), true);
  assert.equal(isExpectedChapterDir("/downloads/manga/title/chapter-10", expected), false);
  assert.equal(isExpectedChapterDir("/downloads/manga/title/chapter-1-evil", expected), false);
  assert.equal(isExpectedChapterDir("/tmp/manga-downloads/title/chapter-1", expected), false);
  assert.equal(
    isExpectedChapterDir("C:\\Manga\\title\\chapter-1", "C:\\Manga\\title\\chapter-1"),
    true,
  );
});
