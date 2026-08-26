import { loadEBookExtensions, installedEBookPlugins } from "./extensions";
import { fetchEBookMetadata, mergeEBookMetadata, type EBook } from "./api";
import { listEBookSources, type EBookHtmlSourceConfig, type EBookSource } from "./sources";
import { safeFetch } from "@/lib/safe-fetch";
import { PluginWorker } from "@/lib/manga/plugins/worker-host";
import type { InstalledPlugin } from "@/lib/manga/plugins/types";

export type EBookChapter = {
  id: string;
  title: string;
  chapter?: string;
  position?: number;
  volume?: string;
  volumeTitle?: string;
  publishAt?: string;
  views?: number | string;
};

export type EBookChapterContent = { text?: string; images?: string[] };

type Provider = {
  id: string;
  name: string;
  iconUrl?: string;
  popular(offset: number): Promise<EBook[]>;
  search(query: string, offset: number): Promise<EBook[]>;
  detail(id: string): Promise<EBook | null>;
  chapters(id: string): Promise<EBookChapter[]>;
  content(id: string): Promise<EBookChapterContent>;
};

const workers = new Map<string, PluginWorker>();
const htmlPages = new Map<string, Map<string, Map<number, number>>>();
const details = new Map<string, Promise<EBook | null>>();
let extensionsReady: Promise<void> | null = null;

function routeId(providerId: string, itemId: string): string {
  return `source:${encodeURIComponent(providerId)}:${encodeURIComponent(itemId)}`;
}

function routeParts(id: string): { providerId: string; itemId: string } | null {
  if (!id.startsWith("source:")) return null;
  const rest = id.slice(7);
  const split = rest.indexOf(":");
  if (split < 1) return null;
  try {
    return {
      providerId: decodeURIComponent(rest.slice(0, split)),
      itemId: decodeURIComponent(rest.slice(split + 1)),
    };
  } catch {
    return null;
  }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function scalarText(value: unknown): string | undefined {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : text(value);
}

function positiveInt(value: unknown): number | undefined {
  const number = typeof value === "number" ? value : Number(text(value));
  return Number.isInteger(number) && number > 0 ? number : undefined;
}

function titleVolume(value?: string): string | undefined {
  return value
    ?.match(
      /(?:\bvol(?:ume)?\b\.?|\bbook\b|\bpart\b|المجلد|مجلد|الجزء|جزء|الكتاب|كتاب)\s*[:#.-]?\s*[\p{L}\p{N}]+/iu,
    )?.[0]
    .replace(/\s+/g, " ")
    .trim();
}

function sourceTitle(value: unknown): string | undefined {
  return text(value)
    ?.replace(/[^\p{L}\p{N}'’]+/gu, " ")
    .replace(/\s+(?:كول|kol)$/iu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function url(value: unknown): string | undefined {
  const candidate = text(value);
  return candidate && /^https?:\/\//i.test(candidate) ? candidate : undefined;
}

function pluginEBook(provider: Provider, value: unknown): EBook | null {
  const item = record(value);
  if (item.isFanMade === true) return null;
  const id = text(item.id);
  const rawTitle = text(item.title);
  const title = sourceTitle(rawTitle);
  if (!id || !title) return null;
  const authors = Array.isArray(item.authors)
    ? item.authors.map(text).filter((author): author is string => !!author)
    : [text(item.author)].filter((author): author is string => !!author);
  const altTitles = [
    text(item.altTitle),
    ...(Array.isArray(item.altTitles) ? item.altTitles.map(text) : []),
    rawTitle !== title ? rawTitle : undefined,
  ].filter((title): title is string => !!title);
  return {
    id: routeId(provider.id, id),
    source: "source",
    providerId: provider.id,
    sourceItemId: id,
    providerName: provider.name,
    anilistId: positiveInt(item.anilistId),
    googleBooksId: text(item.googleBooksId),
    openLibraryId: text(item.openLibraryId)?.replace(/^\/works\//, ""),
    wikidataId: text(item.wikidataId)
      ?.toUpperCase()
      .match(/^Q\d+$/)?.[0],
    isbn: text(item.isbn)?.replace(/[^0-9X]/gi, ""),
    seriesTitle: sourceTitle(item.seriesTitle),
    title,
    altTitle: altTitles.length ? [...new Set(altTitles)].join("|") : undefined,
    authors,
    cover: url(item.cover),
    description: text(item.description) ?? "",
    year: typeof item.year === "number" ? Math.trunc(item.year) : undefined,
    status: text(item.status),
    genres: Array.isArray(item.genres)
      ? item.genres.map(text).filter((genre): genre is string => !!genre)
      : [],
    chapters: typeof item.chapters === "number" ? Math.trunc(item.chapters) : undefined,
    volumes: typeof item.volumes === "number" ? Math.trunc(item.volumes) : undefined,
    siteUrl: url(item.siteUrl),
  };
}

function pluginChapters(
  value: unknown,
  parentVolume?: string,
  parentVolumeTitle?: string,
): EBookChapter[] {
  if (!Array.isArray(value)) return [];
  const chapters: EBookChapter[] = [];
  let activeVolume = parentVolume;
  let activeVolumeTitle = parentVolumeTitle;
  for (const entry of value) {
    const item = record(entry);
    const nested = Array.isArray(item.chapters);
    const title = text(item.title);
    const markedVolume = titleVolume(title);
    const volume =
      scalarText(item.volume) ??
      scalarText(item.volumeNumber) ??
      scalarText(item.book) ??
      scalarText(item.part) ??
      (nested ? title : activeVolume);
    const explicitVolumeTitle = text(item.volumeTitle) ?? text(item.volumeName);
    const volumeTitle =
      explicitVolumeTitle ??
      (nested ? title : volume === activeVolume ? activeVolumeTitle : undefined);
    if (nested) {
      chapters.push(...pluginChapters(item.chapters, volume, volumeTitle));
      continue;
    }
    const id = text(item.id);
    const chapter = scalarText(item.chapter);
    if (markedVolume && !chapter && title === markedVolume) {
      activeVolume = markedVolume;
      activeVolumeTitle = title;
      continue;
    }
    if (!id) continue;
    if (volume) activeVolume = volume;
    if (volumeTitle) activeVolumeTitle = volumeTitle;
    chapters.push({
      id,
      chapter,
      position:
        typeof item.position === "number" && Number.isFinite(item.position)
          ? item.position
          : undefined,
      title: title ?? (chapter ? `Chapter ${chapter}` : id),
      volume,
      volumeTitle,
      publishAt: text(item.publishAt),
      views: typeof item.views === "number" ? item.views : text(item.views),
    });
  }
  return chapters;
}

function pluginContent(value: unknown): EBookChapterContent {
  if (typeof value === "string") return { text: value.trim() };
  const item = record(value);
  const body = text(item.text) ?? text(item.content) ?? text(item.body);
  const images = (Array.isArray(item.images) ? item.images : [])
    .map(url)
    .filter((image): image is string => !!image)
    .slice(0, 2_000);
  return { text: body, images };
}

function pluginProvider(plugin: InstalledPlugin): Provider {
  const id = `plugin:${plugin.id}`;
  let worker = workers.get(id);
  if (!worker) {
    worker = new PluginWorker(plugin);
    workers.set(id, worker);
  }
  const call = (method: string, args: unknown[], timeout = 25_000) =>
    worker!.call(method, args, timeout);
  const provider = {
    id,
    name: plugin.name,
    iconUrl: plugin.icon,
  } as Provider;
  provider.popular = (offset) =>
    call("popular", [offset]).then((items) => pluginList(provider, items));
  provider.search = (query, offset) =>
    call("search", [query, offset]).then((items) => pluginList(provider, items));
  provider.detail = (itemId) =>
    call("detail", [itemId]).then((item) => pluginEBook(provider, item));
  provider.chapters = (itemId) => call("chapters", [itemId]).then(pluginChapters);
  provider.content = async (chapterId) => {
    try {
      return pluginContent(await call("content", [chapterId], 30_000));
    } catch (cause) {
      if (!(cause instanceof Error) || !cause.message.includes("no method: content")) throw cause;
      const images = await call("pageUrls", [chapterId], 30_000);
      return pluginContent({ images });
    }
  };
  return provider;
}

function pluginList(provider: Provider, value: unknown): EBook[] {
  return Array.isArray(value)
    ? value.map((item) => pluginEBook(provider, item)).filter((item): item is EBook => !!item)
    : [];
}

function htmlProvider(source: EBookSource & { config: EBookHtmlSourceConfig }): Provider {
  const config = source.config;
  const base = config.baseUrl;
  const provider = { id: source.id, name: source.name, iconUrl: source.iconUrl } as Provider;
  const target = (path: string) => new URL(path, `${base}/`).href;
  const pages = htmlPages.get(source.id) ?? new Map<string, Map<number, number>>();
  htmlPages.set(source.id, pages);
  const pick = (root: ParentNode, spec?: string): string | undefined => {
    if (!spec) return undefined;
    for (const option of spec.split("|")) {
      const [selector, attribute] = option.split("@");
      const element = selector.trim() ? root.querySelector(selector.trim()) : (root as Element);
      const value = attribute ? element?.getAttribute(attribute.trim()) : element?.textContent;
      if (value?.trim()) return value.replace(/\s+/g, " ").trim();
    }
  };
  const documentAt = async (path: string): Promise<Document> => {
    const response = await safeFetch(
      target(path),
      config.headers ? { headers: config.headers } : undefined,
    );
    if (!response.ok) throw new Error(`${source.name} HTTP ${response.status}`);
    return new DOMParser().parseFromString(await response.text(), "text/html");
  };
  const list = async (path: string): Promise<EBook[]> => {
    const document = await documentAt(path);
    return Array.from(document.querySelectorAll(config.list.item)).flatMap((element) => {
      const itemId = pick(element, config.list.link);
      if (!itemId) return [];
      const cover = pick(element, config.list.cover);
      return [
        {
          id: routeId(provider.id, itemId),
          source: "source" as const,
          providerId: provider.id,
          sourceItemId: itemId,
          providerName: provider.name,
          title: sourceTitle(pick(element, config.list.title)) ?? itemId,
          authors: [],
          cover: cover ? target(cover) : undefined,
          description: "",
          genres: [],
        },
      ];
    });
  };
  const page = async (key: string, path: string, offset: number) => {
    const offsets = pages.get(key) ?? new Map([[0, 1]]);
    pages.set(key, offsets);
    const number = offsets.get(offset);
    if (!number) return [];
    const items = await list(path.replaceAll("{page}", String(number)));
    if (items.length) offsets.set(offset + items.length, number + 1);
    return items;
  };
  provider.popular = (offset) => page("popular", config.popularPath, offset);
  provider.search = (query, offset) =>
    page(
      `search:${query}`,
      config.searchPath.replaceAll("{query}", encodeURIComponent(query)),
      offset,
    );
  provider.detail = async (itemId) => {
    const document = await documentAt(itemId);
    const detail = config.detail;
    const cover = pick(document, detail?.cover);
    return {
      id: routeId(provider.id, itemId),
      source: "source",
      providerId: provider.id,
      sourceItemId: itemId,
      providerName: provider.name,
      title: sourceTitle(pick(document, detail?.title)) ?? itemId,
      authors: [pick(document, detail?.author)].filter((author): author is string => !!author),
      cover: cover ? target(cover) : undefined,
      description: pick(document, detail?.description) ?? "",
      status: pick(document, detail?.status),
      genres: [],
    };
  };
  provider.chapters = async (itemId) => {
    const document = await documentAt(itemId);
    return Array.from(document.querySelectorAll(config.chapters.item)).flatMap(
      (element, position) => {
        const id = pick(element, config.chapters.link);
        if (!id) return [];
        const title = pick(element, config.chapters.title) ?? id;
        return [
          {
            id,
            title,
            chapter: pick(element, config.chapters.chapter),
            position,
            volume: pick(element, config.chapters.volume),
            volumeTitle: pick(element, config.chapters.volumeTitle),
            publishAt: pick(element, config.chapters.date),
            views: pick(element, config.chapters.views),
          },
        ];
      },
    );
  };
  provider.content = async (chapterId) => {
    const document = await documentAt(chapterId);
    const root = document.querySelector(config.content.body);
    if (!root) return {};
    const blocks = Array.from(root.querySelectorAll("p,h1,h2,h3,h4,blockquote,li"))
      .map((element) => element.textContent?.replace(/\s+/g, " ").trim())
      .filter(Boolean);
    return { text: blocks.length ? blocks.join("\n\n") : (root.textContent?.trim() ?? "") };
  };
  return provider;
}

async function providers(): Promise<Provider[]> {
  await (extensionsReady ??= loadEBookExtensions());
  return [
    ...listEBookSources()
      .filter(
        (source): source is EBookSource & { config: EBookHtmlSourceConfig } =>
          source.kind === "html" && !!source.config,
      )
      .map(htmlProvider),
    ...installedEBookPlugins()
      .filter((plugin) => plugin.enabled)
      .map(pluginProvider),
  ];
}

async function providerFor(route: string): Promise<{ provider: Provider; itemId: string } | null> {
  const parts = routeParts(route);
  if (!parts) return null;
  const provider = (await providers()).find((item) => item.id === parts.providerId);
  return provider ? { provider, itemId: parts.itemId } : null;
}

export type EBookProvider = Pick<Provider, "id" | "name" | "iconUrl">;
export type EBookCursor = Record<string, number>;
export type EBookPage = {
  items: EBook[];
  enriched: Promise<EBook[]>;
  cursor: EBookCursor;
  hasMore: boolean;
};
export type EBookLoadEvents = {
  onSource?: (items: EBook[]) => void;
  onMetadata?: (items: EBook[]) => void;
};

async function sourceDetail(route: string): Promise<EBook | null> {
  let pending = details.get(route);
  if (!pending) {
    pending = providerFor(route).then((found) =>
      found ? found.provider.detail(found.itemId) : null,
    );
    details.set(route, pending);
    pending.catch(() => details.delete(route));
  }
  return pending;
}

async function withMetadata(
  items: EBook[],
  onMetadata?: (items: EBook[]) => void,
): Promise<EBook[]> {
  if (!items.length) return items;
  const batches = Array.from({ length: Math.ceil(items.length / 8) }, (_, index) =>
    items.slice(index * 8, index * 8 + 8),
  );
  const resolved = new Map(items.map((item) => [item.id, item]));
  let next = 0;
  while (next < batches.length) {
    const batch = batches[next++];
    const identified = await Promise.all(
      batch.map(async (item) => {
        if (item.source !== "source") return item;
        const detail = await sourceDetail(item.id).catch(() => null);
        return detail ? { ...item, ...detail, id: item.id, books: item.books } : item;
      }),
    );
    onMetadata?.(mergeEBookMetadata(identified, []));
    const enriched = mergeEBookMetadata(
      identified,
      await fetchEBookMetadata(identified).catch(() => []),
    );
    enriched.forEach((item) => resolved.set(item.id, item));
    onMetadata?.(enriched);
  }
  return items.map((item) => resolved.get(item.id) ?? item);
}

export async function listEBookProviders(): Promise<EBookProvider[]> {
  const list = await providers();
  return [
    ...(list.length > 1 ? [{ id: "all", name: "All Sources" }] : []),
    ...list.map(({ id, name, iconUrl }) => ({ id, name, iconUrl })),
  ];
}

function selectedProviders(list: Provider[], providerId?: string): Provider[] {
  return !providerId || providerId === "all"
    ? list
    : list.filter((provider) => provider.id === providerId);
}

export async function loadSourceEBookPage(
  query: string | undefined,
  providerId?: string,
  cursor: EBookCursor = {},
  events?: EBookLoadEvents,
): Promise<EBookPage> {
  const list = selectedProviders(await providers(), providerId);
  const pages = await Promise.all(
    list.map(async (provider) => {
      const offset = cursor[provider.id] ?? 0;
      const items = await (query ? provider.search(query, offset) : provider.popular(offset)).catch(
        () => [],
      );
      events?.onSource?.(mergeEBookMetadata(items, []));
      return { provider, offset, items, enriched: withMetadata(items, events?.onMetadata) };
    }),
  );
  const sourceItems = pages.flatMap((page) => page.items);
  return {
    items: sourceItems,
    enriched: Promise.all(pages.map((page) => page.enriched)).then((items) => items.flat()),
    cursor: Object.fromEntries(
      pages.map(({ provider, offset, items }) => [provider.id, offset + items.length]),
    ),
    hasMore: pages.some((page) => page.items.length > 0),
  };
}

export async function browseSourceEBooks(providerId?: string, offset = 0): Promise<EBook[]> {
  const cursor = Object.fromEntries(
    selectedProviders(await providers(), providerId).map((provider) => [provider.id, offset]),
  );
  return (await loadSourceEBookPage(undefined, providerId, cursor)).enriched;
}

export async function searchSourceEBooks(
  query: string,
  providerId?: string,
  offset = 0,
): Promise<EBook[]> {
  const cursor = Object.fromEntries(
    selectedProviders(await providers(), providerId).map((provider) => [provider.id, offset]),
  );
  return (await loadSourceEBookPage(query, providerId, cursor)).enriched;
}

export async function sourceEBookDetail(route: string): Promise<EBook | null> {
  const detail = await sourceDetail(route);
  return detail ? (await withMetadata([detail]))[0] : null;
}

export async function sourceEBookChapters(route: string): Promise<EBookChapter[]> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const found = await providerFor(route);
      if (!found) return [];
      return await found.provider.chapters(found.itemId);
    } catch (cause) {
      if (attempt) throw cause;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 250));
  }
  return [];
}

export async function sourceEBookContent(
  route: string,
  chapterId: string,
): Promise<EBookChapterContent> {
  const found = await providerFor(route);
  return found ? found.provider.content(chapterId) : {};
}
