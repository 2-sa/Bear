// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { readFileSync } from "node:fs";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { describe, it } from "node:test";

const gql = readFileSync(
  new URL("../src/lib/manga/sources/suwayomi/graphql.ts", import.meta.url),
  "utf8",
);

describe("suwayomi read-first policy", () => {
  it("saved manga detail reads the server DB before any live source fetch", () => {
    const fn = gql.match(/export async function gqlManga\([\s\S]*?\n\}/)?.[0];

    assert.ok(fn, "gqlManga must exist");

    const query = fn.indexOf("manga(id: ${mangaId})");
    const mutation = fn.indexOf("fetchMangaAndChapters");

    assert.ok(query >= 0, "cached manga query must exist");
    assert.ok(mutation > query, "live manga fetch must occur after the cached query");
    assert.match(fn, /cached\.initialized !== false/);
  });

  it("saved manga chapters read the server DB before any live source fetch", () => {
    const fn = gql.match(/export async function gqlChapters\([\s\S]*?\n\}/)?.[0];

    assert.ok(fn, "gqlChapters must exist");

    const query = fn.indexOf("chapters(condition: { mangaId: ${mangaId} })");
    const mutation = fn.indexOf("fetchChapters(input:");

    assert.ok(query >= 0, "cached chapters query must exist");
    assert.ok(mutation > query, "live chapters fetch must occur after the cached query");
    assert.match(fn, /cachedNodes\.length > 0\) return mapGqlChapters\(cachedNodes\);/);
  });

  it("graphql failures still fall through to REST", () => {
    assert.match(
      gql,
      /if \(data == null && fdata == null\) throw new Error\("suwayomi_graphql_error"\);/,
    );
  });

  it("refs with an empty sourceId still decode (fetch only needs mangaId)", () => {
    const model = readFileSync(
      new URL("../src/lib/manga/sources/suwayomi/model.ts", import.meta.url),
      "utf8",
    );

    const mangaFn = model.match(/export function decodeMangaId\([\s\S]*?\n\}/)?.[0];

    const chapterFn = model.match(/export function decodeChapterId\([\s\S]*?\n\}/)?.[0];

    assert.ok(mangaFn, "decodeMangaId must exist");
    assert.ok(chapterFn, "decodeChapterId must exist");

    assert.match(mangaFn, /if \(!mangaId\) return null;/);
    assert.equal(
      /!sourceId \|\| !mangaId/.test(mangaFn),
      false,
      "decodeMangaId must not require sourceId",
    );

    assert.match(chapterFn, /if \(!mangaId \|\| !key\) return null;/);
    assert.equal(
      /!sourceId \|\| !mangaId \|\| !key/.test(chapterFn),
      false,
      "decodeChapterId must not require sourceId",
    );
  });
});
