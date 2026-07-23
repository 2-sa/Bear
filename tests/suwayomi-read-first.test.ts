import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";

const gql = readFileSync(
  new URL("../src/lib/manga/sources/suwayomi/graphql.ts", import.meta.url),
  "utf8",
);

describe("suwayomi read-first policy", () => {
  it("saved manga detail reads the server DB before any live source fetch", () => {
    const fn = gql.match(/export async function gqlManga\([\s\S]*?\n\}/)?.[0];
    expect(fn, "gqlManga must exist").toBeTruthy();
    const query = fn!.indexOf("manga(id: ${mangaId})");
    const mutation = fn!.indexOf("fetchMangaAndChapters");
    expect(query).toBeGreaterThanOrEqual(0);
    expect(mutation).toBeGreaterThan(query);
    expect(fn).toMatch(/cached\.initialized !== false/);
  });

  it("saved manga chapters read the server DB before any live source fetch", () => {
    const fn = gql.match(/export async function gqlChapters\([\s\S]*?\n\}/)?.[0];
    expect(fn, "gqlChapters must exist").toBeTruthy();
    const query = fn!.indexOf("chapters(condition: { mangaId: ${mangaId} })");
    const mutation = fn!.indexOf("fetchChapters(input:");
    expect(query).toBeGreaterThanOrEqual(0);
    expect(mutation).toBeGreaterThan(query);
    expect(fn).toMatch(/cachedNodes\.length > 0\) return mapGqlChapters\(cachedNodes\);/);
  });

  it("graphql failures still fall through to REST", () => {
    expect(gql).toMatch(
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
    expect(mangaFn && chapterFn).toBeTruthy();
    expect(mangaFn).toMatch(/if \(!mangaId\) return null;/);
    expect(/!sourceId \|\| !mangaId/.test(mangaFn!)).toBe(false);
    expect(chapterFn).toMatch(/if \(!mangaId \|\| !key\) return null;/);
    expect(/!sourceId \|\| !mangaId \|\| !key/.test(chapterFn!)).toBe(false);
  });
});
