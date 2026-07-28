import type { MangaChapter, MangaProvider, MangaSummary, MangaTag } from "@/lib/manga/types";
import {
  cursorKey,
  decodeChapterId,
  decodeMangaId,
  encodeChapterId,
  makeClient,
  makeServer,
  mapManga,
  nextPage,
  recordPage,
  type BrowseKind,
} from "./model";
import {
  restBrowse,
  restChapters,
  restLibrary,
  restMangaFull,
  restPageUrls,
  restSearch,
  type RestChapter,
} from "./rest";
import { gqlBrowse, gqlChapters, gqlLibrary, gqlManga, gqlPageUrls } from "./graphql";
import { loadSources, pickTransport, sourceLang, withTransportFallback } from "./transport";
import { registerServerPageHeaders } from "@/lib/manga/plugins/adapter";

function mapChapters(
  sourceId: string,
  mangaId: string,
  lang: string,
  chapters: RestChapter[],
): MangaChapter[] {
  const mapped = chapters.map((c) => ({
    id: encodeChapterId(sourceId, mangaId, c.key),
    chapter: c.chapterNumber != null ? String(c.chapterNumber) : null,
    title: c.name,
    pages: c.pageCount,
    language: lang,
    group: c.scanlator,
    publishAt: c.uploadDate,
    downloaded: c.downloaded,
    serverRead: c.isRead,
    serverPage: c.lastPageRead,
  }));
  if (mapped.length > 1 && mapped.every((c) => c.chapter != null)) {
    mapped.sort((a, b) => Number(a.chapter) - Number(b.chapter));
  }
  return mapped;
}

export function makeSuwayomiProvider(baseUrl: string, basicAuth?: string): MangaProvider {
  const server = makeServer(baseUrl, basicAuth);
  const client = makeClient(server);

  async function browse(
    sourceId: string,
    kind: BrowseKind,
    offset: number,
    query: string,
  ): Promise<MangaSummary[]> {
    const key = cursorKey(server.base, sourceId, kind, query);
    const page = nextPage(key, offset);
    if (page < 0) return [];
    const res = await withTransportFallback(client, (t) =>
      t === "rest"
        ? kind === "search"
          ? restSearch(client, sourceId, query, page)
          : restBrowse(client, sourceId, kind, page)
        : gqlBrowse(client, sourceId, kind, page, kind === "search" ? query : undefined),
    );
    recordPage(key, res.items.length, res.hasNextPage, page);
    return res.items.map((m) => mapManga(server, sourceId, m)).filter((m): m is MangaSummary => !!m);
  }

  async function library(): Promise<MangaSummary[]> {
    const list = await withTransportFallback(client, (t) =>
      t === "rest" ? restLibrary(client) : gqlLibrary(client),
    );
    return list
      .map((m) => mapManga(server, String(m?.sourceId ?? ""), m))
      .filter((m): m is MangaSummary => !!m);
  }

  async function browseAllSources(
    kind: BrowseKind,
    offset: number,
    query: string,
  ): Promise<MangaSummary[]> {
    const transport = await pickTransport(client);
    const sources = await loadSources(client, transport);
    const lists = await Promise.all(
      sources.map((source) => browse(source.id, kind, offset, query).catch(() => [])),
    );
    const merged: MangaSummary[] = [];
    const longest = Math.max(0, ...lists.map((list) => list.length));
    for (let index = 0; index < longest; index++) {
      for (const list of lists) {
        if (list[index]) merged.push(list[index]);
      }
    }
    return merged;
  }

  async function popular(offset: number, tagId?: string): Promise<MangaSummary[]> {
    if (tagId) return browse(tagId, "popular", offset, "");
    const all = await browseAllSources("popular", offset, "");
    if (all.length || offset > 0) return all;
    return library();
  }

  async function search(query: string, offset: number, tagId?: string): Promise<MangaSummary[]> {
    const q = query.trim();
    if (!q) return popular(offset, tagId);
    if (tagId) return browse(tagId, "search", offset, q);
    const all = await browseAllSources("search", offset, q);
    if (all.length || offset > 0) return all;
    const lower = q.toLowerCase();
    return (await library()).filter((m) => m.title.toLowerCase().includes(lower));
  }

  async function detail(id: string): Promise<MangaSummary | null> {
    const parsed = decodeMangaId(id);
    if (!parsed) return null;
    const raw = await withTransportFallback(client, (t) =>
      t === "rest" ? restMangaFull(client, parsed.mangaId) : gqlManga(client, parsed.mangaId),
    );
    return raw ? mapManga(server, parsed.sourceId, raw) : null;
  }

  async function chapters(id: string): Promise<MangaChapter[]> {
    const parsed = decodeMangaId(id);
    if (!parsed) return [];
    return withTransportFallback(client, async (t) => {
      const raw =
        t === "rest"
          ? await restChapters(client, parsed.mangaId)
          : await gqlChapters(client, parsed.mangaId);
      const lang = await sourceLang(client, t, parsed.sourceId);
      return mapChapters(parsed.sourceId, parsed.mangaId, lang, raw);
    });
  }

  function registerPageAuth(urls: string[]): void {
    if (!server.authHeader) return;
    let host = "";
    try {
      host = new URL(server.base).host;
    } catch {
      return;
    }
    for (const u of urls) {
      try {
        if (new URL(u).host === host)
          registerServerPageHeaders(u, { authorization: server.authHeader });
      } catch {
        /* skip */
      }
    }
  }

  async function pageUrls(chapterId: string): Promise<string[]> {
    const parsed = decodeChapterId(chapterId);
    if (!parsed) return [];
    const urls = await withTransportFallback(client, (t) =>
      t === "rest"
        ? restPageUrls(client, parsed.mangaId, parsed.key)
        : gqlPageUrls(client, parsed.key),
    );
    registerPageAuth(urls);
    return urls;
  }

  async function tags(): Promise<MangaTag[]> {
    const t = await pickTransport(client);
    return (await loadSources(client, t)).map((s) => ({
      id: s.id,
      name: s.lang && s.lang !== "en" ? `${s.name} (${s.lang.toUpperCase()})` : s.name,
      group: "Sources",
    }));
  }

  return { id: "suwayomi", name: "My Server", popular, search, detail, chapters, pageUrls, tags };
}

export * from "./api";
export type { SuwayomiSource, SuwayomiExtension } from "./model";
