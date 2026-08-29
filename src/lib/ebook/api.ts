import { anilistRequest } from "@/lib/anilist/client";
import { getUiLanguage } from "@/lib/i18n";
import { safeFetch } from "@/lib/safe-fetch";

export type EBook = {
  id: string;
  source: "anilist" | "googlebooks" | "openlibrary" | "wikidata" | "source";
  providerId?: string;
  sourceItemId?: string;
  providerName?: string;
  anilistId?: number;
  googleBooksId?: string;
  openLibraryId?: string;
  wikidataId?: string;
  isbn?: string;
  seriesTitle?: string;
  books?: EBook[];
  title: string;
  altTitle?: string;
  authors: string[];
  cover?: string;
  internalCover?: string;
  banner?: string;
  description: string;
  year?: number;
  status?: string;
  genres: string[];
  chapters?: number;
  volumes?: number;
  score?: number;
  siteUrl?: string;
};

export const EBOOK_CATEGORIES = {
  Fiction: [
    "Novel",
    "Novella",
    "Short story",
    "Fantasy",
    "Science fiction",
    "Romance",
    "Mystery / Detective",
    "Thriller / Suspense",
    "Horror",
    "Historical fiction",
    "Adventure",
    "Literary fiction",
    "Young Adult (YA)",
  ],
  "Non-fiction": [
    "Self-help / Personal development",
    "Psychology",
    "Philosophy",
    "Biography / Autobiography / Memoir",
    "History",
    "Business & Finance",
    "Science",
    "Technology",
    "Health & Fitness",
    "Politics & Society",
    "True crime",
    "Travel",
    "Education / Textbooks",
    "Reference / Guides",
    "Essays",
    "Religion & Spirituality",
    "Cookbooks",
  ],
} as const;

export type EBookCategoryGroup = keyof typeof EBOOK_CATEGORIES;

export type RawEBook = {
  id: number;
  title: { english: string | null; romaji: string | null; native: string | null };
  coverImage: { extraLarge: string | null; large: string | null } | null;
  bannerImage: string | null;
  description: string | null;
  startDate: { year: number | null } | null;
  status: string | null;
  genres: string[];
  chapters: number | null;
  volumes: number | null;
  averageScore: number | null;
  siteUrl: string | null;
  synonyms?: string[];
  staff?: { edges: Array<{ role: string; node: { name: { full: string } } }> };
};

const FIELDS = `
  id
  title { english romaji native }
  coverImage { extraLarge large }
  bannerImage
  description(asHtml: false)
  startDate { year }
  status
  genres
  chapters
  volumes
  averageScore
  siteUrl
  synonyms
  staff(perPage: 10, sort: RELEVANCE) { edges { role node { name { full } } } }
`;

const BROWSE = `query ($page: Int, $sort: [MediaSort], $search: String) {
  Page(page: $page, perPage: 24) {
    media(type: MANGA, format: NOVEL, sort: $sort, search: $search, isAdult: false) { ${FIELDS} }
  }
}`;

const DETAIL = `query ($id: Int) { Media(id: $id, type: MANGA, format: NOVEL) { ${FIELDS} } }`;
const NEW_RELEASES = `query ($before: FuzzyDateInt) {
  Page(page: 1, perPage: 24) {
    media(type: MANGA, format: NOVEL, sort: START_DATE_DESC, startDate_lesser: $before, isAdult: false) { ${FIELDS} }
  }
}`;
const anilistMetadata = new Map<string, EBook | null>();
const anilistIds = new Map<string, EBook | null>();

function titleKey(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u0610-\u061a\u0640\u064b-\u065f\u0670\u06d6-\u06ed]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function identityTitleKey(value: string): string {
  return titleKey(value)
    .replace(/\b(?:a|an|the)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function metadataKey(value: string): string {
  return `${getUiLanguage()}:${titleKey(value)}`;
}

function lookupTitle(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐‑‒–—]/g, "-")
    .trim();
}

function metadataLookups(ebooks: EBook[]): Array<{ query: string; owner: string }> {
  return ebooks.flatMap((ebook) => {
    const owner = ebook.seriesTitle || ebook.title;
    let slug = "";
    try {
      slug =
        decodeURIComponent(ebook.sourceItemId ?? "")
          .split("/")
          .filter(Boolean)
          .at(-1)
          ?.replace(/[-_]+/g, " ") ?? "";
    } catch {}
    return [...new Set([owner, ...(ebook.altTitle?.split("|") ?? []), slug])]
      .map((query) => query && lookupTitle(query))
      .filter((query): query is string => !!query)
      .map((query) => ({ query, owner }));
  });
}

function metadataCandidates(ebook: EBook): string[] {
  const candidates = metadataLookups([ebook]).map(({ query }) => query);
  return [
    ...new Set([
      ...candidates,
      ...candidates.map((title) =>
        title.replace(/\b(?:a|an|the)\b/gi, " ").replace(/\s+/g, " ").trim(),
      ),
    ]),
  ].filter(Boolean);
}

function authorListsMatch(left: string[], right: string[]): boolean {
  return left.some((a) =>
    right.some((b) => {
      const x = titleKey(a);
      const y = titleKey(b);
      return x === y || (x.length > 4 && y.length > 4 && (x.includes(y) || y.includes(x)));
    }),
  );
}

function explicitMetadataMatch(source: EBook, metadata: EBook): boolean {
  return !!(
    (source.anilistId && source.anilistId === metadata.anilistId) ||
    (source.googleBooksId && source.googleBooksId === metadata.googleBooksId) ||
    (source.openLibraryId && source.openLibraryId === metadata.openLibraryId) ||
    (source.wikidataId && source.wikidataId === metadata.wikidataId) ||
    (source.isbn && source.isbn === metadata.isbn)
  );
}

function verifiedMetadataMatch(source: EBook, metadata: EBook): boolean {
  if (explicitMetadataMatch(source, metadata)) return true;
  const sourceTitles = new Set(metadataCandidates(source).map(identityTitleKey));
  const metadataTitles = [metadata.title, ...(metadata.altTitle?.split("|") ?? [])].map(
    identityTitleKey,
  );
  if (!metadataTitles.some((title) => sourceTitles.has(title))) return false;
  if (metadata.source === "anilist") return true;
  if (metadata.source === "wikidata") {
    if (
      !/\b(?:(?:web|light)\s+)?novel\b|\b(?:book|novel) series\b|\bliterary work\b/i.test(
        metadata.description,
      )
    )
      return false;
    return (
      !source.authors.length ||
      !metadata.authors.length ||
      authorListsMatch(source.authors, metadata.authors)
    );
  }
  return authorListsMatch(source.authors, metadata.authors);
}

function metadataRequestKey(ebook: EBook): string {
  const owner = ebook.seriesTitle || ebook.title;
  return [
    metadataKey(owner),
    ebook.anilistId,
    ebook.googleBooksId,
    ebook.openLibraryId,
    ebook.wikidataId,
    ebook.isbn,
    ...metadataCandidates(ebook).map(titleKey),
  ].join(":");
}

function clean(text: string | null): string {
  return (text ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

export function mapEBook(n: RawEBook): EBook {
  const language = getUiLanguage();
  const localized =
    language === "ar"
      ? n.synonyms?.find((title) => /\p{Script=Arabic}/u.test(title))
      : language === "ru"
        ? n.synonyms?.find((title) => /\p{Script=Cyrillic}/u.test(title))
        : undefined;
  return {
    id: `anilist:${n.id}`,
    source: "anilist",
    anilistId: n.id,
    title:
      localized?.trim() ||
      n.title.english?.trim() ||
      n.title.romaji?.trim() ||
      n.title.native?.trim() ||
      "Untitled",
    altTitle: n.title.romaji ?? n.title.native ?? undefined,
    authors:
      n.staff?.edges
        .filter((edge) => /story|original creator|writer|author/i.test(edge.role))
        .map((edge) => edge.node.name.full) ?? [],
    cover: n.coverImage?.extraLarge ?? n.coverImage?.large ?? undefined,
    banner: n.bannerImage ?? undefined,
    description: clean(n.description),
    year: n.startDate?.year ?? undefined,
    status: n.status?.replaceAll("_", " ").toLowerCase(),
    genres: n.genres ?? [],
    chapters: n.chapters ?? undefined,
    volumes: n.volumes ?? undefined,
    score: n.averageScore ?? undefined,
    siteUrl: n.siteUrl ?? undefined,
  };
}

export async function browseEBooks(sort: string, page = 1, search?: string): Promise<EBook[]> {
  const data = await anilistRequest<{ Page: { media: RawEBook[] } | null }>(
    BROWSE,
    { page, sort: [sort], search: search?.trim() || undefined },
    undefined,
    true,
  );
  return (data.Page?.media ?? []).map(mapEBook);
}

export async function browseNewReleases(): Promise<EBook[]> {
  const before = Number(new Date().toISOString().slice(0, 10).replaceAll("-", "")) + 1;
  const data = await anilistRequest<{ Page: { media: RawEBook[] } | null }>(
    NEW_RELEASES,
    { before },
    undefined,
    true,
  );
  return (data.Page?.media ?? []).map(mapEBook);
}

export async function recommendedEBooks(ebook: EBook): Promise<EBook[]> {
  if (ebook.anilistId) {
    const data = await anilistRequest<{
      Media: {
        recommendations: {
          nodes: Array<{ mediaRecommendation: (RawEBook & { format?: string }) | null }>;
        };
      } | null;
    }>(
      `query ($id: Int) {
          Media(id: $id, type: MANGA, format: NOVEL) {
            recommendations(perPage: 18, sort: RATING_DESC) {
              nodes { mediaRecommendation { ${FIELDS} format } }
            }
          }
        }`,
      { id: ebook.anilistId },
      undefined,
      true,
    ).catch(() => null);
    const direct = (data?.Media?.recommendations.nodes ?? [])
      .map((node) => node.mediaRecommendation)
      .filter((item): item is RawEBook & { format?: string } => !!item && item.format === "NOVEL")
      .map(mapEBook);
    if (direct.length) return direct;
  }
  const genres = ebook.genres.slice(0, 3);
  const data = await anilistRequest<{ Page: { media: RawEBook[] } | null }>(
    genres.length
      ? `query ($genres: [String]) {
          Page(page: 1, perPage: 18) {
            media(type: MANGA, format: NOVEL, genre_in: $genres, sort: POPULARITY_DESC, isAdult: false) { ${FIELDS} }
          }
        }`
      : `query {
          Page(page: 1, perPage: 18) {
            media(type: MANGA, format: NOVEL, sort: POPULARITY_DESC, isAdult: false) { ${FIELDS} }
          }
        }`,
    genres.length ? { genres } : undefined,
    undefined,
    true,
  );
  const related = (data.Page?.media ?? [])
    .map(mapEBook)
    .filter((item) => item.id !== ebook.id && item.title !== ebook.title);
  if (related.length || !genres.length) return related;
  return (await browseEBooks("POPULARITY_DESC")).filter(
    (item) => item.id !== ebook.id && item.title !== ebook.title,
  );
}

export async function fetchAniListEBookMetadata(ebooks: EBook[]): Promise<EBook[]> {
  const direct = [
    ...new Map(
      ebooks.filter((ebook) => ebook.anilistId).map((ebook) => [ebook.anilistId!, ebook]),
    ).values(),
  ];
  const missingIds = direct.filter(
    (ebook) => !anilistIds.has(`${getUiLanguage()}:${ebook.anilistId}`),
  );
  for (let start = 0; start < missingIds.length; start += 12) {
    const batch = missingIds.slice(start, start + 12);
    const variables = Object.fromEntries(
      batch.map((ebook, index) => [`id${index}`, ebook.anilistId]),
    );
    const query = `query (${batch.map((_, index) => `$id${index}: Int`).join(", ")}) {
      ${batch.map((_, index) => `m${index}: Media(id: $id${index}, type: MANGA, format: NOVEL) { ${FIELDS} }`).join("\n")}
    }`;
    const data = await anilistRequest<Record<string, RawEBook | null>>(
      query,
      variables,
      undefined,
      true,
    ).catch((): Record<string, RawEBook | null> => ({}));
    batch.forEach((ebook, index) => {
      const field = `m${index}`;
      if (Object.hasOwn(data, field)) {
        const raw = data[field];
        anilistIds.set(`${getUiLanguage()}:${ebook.anilistId}`, raw ? mapEBook(raw) : null);
      }
    });
  }
  const lookups = metadataLookups(ebooks);
  const titles = [...new Set(lookups.map(({ query }) => query))];
  const missing = titles.filter((title) => !anilistMetadata.has(metadataKey(title)));
  for (let start = 0; start < missing.length; start += 6) {
    const batch = missing.slice(start, start + 6);
    const variables = Object.fromEntries(batch.map((title, index) => [`q${index}`, title]));
    const query = `query (${batch.map((_, index) => `$q${index}: String`).join(", ")}) {
      ${batch
        .map(
          (_, index) =>
            `m${index}: Page(page: 1, perPage: 3) { media(search: $q${index}, type: MANGA, format: NOVEL, isAdult: false) { ${FIELDS} } }`,
        )
        .join("\n")}
    }`;
    const data = await anilistRequest<Record<string, { media: RawEBook[] } | null>>(
      query,
      variables,
      undefined,
      true,
    ).catch((): Record<string, { media: RawEBook[] } | null> => ({}));
    if (!Object.keys(data).length) continue;
    batch.forEach((title, index) => {
      const key = titleKey(title);
      const raw = data[`m${index}`]?.media.find((item) =>
        [item.title.english, item.title.romaji, item.title.native, ...(item.synonyms ?? [])].some(
          (candidate) => candidate && titleKey(candidate) === key,
        ),
      );
      anilistMetadata.set(metadataKey(title), raw ? mapEBook(raw) : null);
    });
  }
  const matches = new Map<string, EBook>();
  for (const ebook of direct) {
    const match = anilistIds.get(`${getUiLanguage()}:${ebook.anilistId}`);
    if (match)
      matches.set(titleKey(ebook.seriesTitle || ebook.title), {
        ...match,
        seriesTitle: ebook.seriesTitle || ebook.title,
      });
  }
  for (const { query, owner } of lookups) {
    const match = anilistMetadata.get(metadataKey(query));
    if (match && !matches.has(titleKey(owner)))
      matches.set(titleKey(owner), { ...match, seriesTitle: owner });
  }
  return [...matches.values()];
}

type OpenLibraryDoc = {
  key: string;
  title: string;
  author_name?: string[];
  cover_i?: number;
  first_publish_year?: number;
  isbn?: string[];
  series?: string[];
  subject?: string[];
  alternative_title?: string | string[];
  first_sentence?: string | string[];
};

const OPEN_LIBRARY_FIELDS =
  "key,title,alternative_title,author_name,cover_i,first_publish_year,isbn,series,subject,first_sentence";
const OPEN_LIBRARY_CACHE_MS = 7 * 24 * 60 * 60 * 1000;
const openLibraryMetadata = new Map<string, EBook | null>();
const openLibraryAliases = new Map<string, string[]>();

async function cachedJson<T>(url: string): Promise<T> {
  const cacheUrl = new URL(url);
  cacheUrl.searchParams.delete("key");
  const key = `harbor.ebook.openlibrary.v1.${cacheUrl}`;
  try {
    const cached = JSON.parse(localStorage.getItem(key) ?? "null") as {
      at: number;
      value: T;
    } | null;
    if (cached && Date.now() - cached.at < OPEN_LIBRARY_CACHE_MS) return cached.value;
  } catch {}
  const response = await safeFetch(url, {
    signal: AbortSignal.timeout(8_000),
    headers:
      cacheUrl.hostname === "query.wikidata.org"
        ? {
            Accept: "application/sparql-results+json",
            "User-Agent": "Bear (eBook metadata)",
          }
        : undefined,
  });
  if (!response.ok) throw new Error(`eBook metadata HTTP ${response.status}`);
  const value = (await response.json()) as T;
  try {
    localStorage.setItem(key, JSON.stringify({ at: Date.now(), value }));
  } catch {}
  return value;
}

type GoogleBook = {
  id: string;
  volumeInfo: {
    title: string;
    subtitle?: string;
    authors?: string[];
    publishedDate?: string;
    description?: string;
    industryIdentifiers?: Array<{ type: string; identifier: string }>;
    categories?: string[];
    averageRating?: number;
    imageLinks?: Record<string, string>;
    infoLink?: string;
  };
};

const googleMetadata = new Map<string, EBook | null>();
const GOOGLE_BOOKS_KEY = "harbor.ebook.google-books-key";
let googleUnavailableUntil = 0;
let googleQueue = Promise.resolve();

export function googleBooksApiKey(): string {
  return localStorage.getItem(GOOGLE_BOOKS_KEY)?.trim() ?? "";
}

export function setGoogleBooksApiKey(value: string): void {
  value.trim()
    ? localStorage.setItem(GOOGLE_BOOKS_KEY, value.trim())
    : localStorage.removeItem(GOOGLE_BOOKS_KEY);
  googleMetadata.clear();
}

function mapGoogleBook(book: GoogleBook): EBook {
  const info = book.volumeInfo;
  const isbn =
    info.industryIdentifiers?.find(({ type }) => type === "ISBN_13")?.identifier ??
    info.industryIdentifiers?.find(({ type }) => type === "ISBN_10")?.identifier;
  const cover =
    info.imageLinks?.extraLarge ??
    info.imageLinks?.large ??
    info.imageLinks?.medium ??
    info.imageLinks?.thumbnail ??
    info.imageLinks?.smallThumbnail;
  return {
    id: `googlebooks:${book.id}`,
    source: "googlebooks",
    googleBooksId: book.id,
    isbn,
    title: info.title,
    altTitle: info.subtitle,
    authors: info.authors ?? [],
    cover: cover?.replace(/^http:/, "https:"),
    description: clean(info.description ?? null),
    year: Number(info.publishedDate?.match(/\d{4}/)?.[0]) || undefined,
    genres: info.categories ?? [],
    score: info.averageRating ? info.averageRating * 20 : undefined,
    siteUrl: info.infoLink,
  };
}

async function fetchGoogleMetadata(ebooks: EBook[]): Promise<EBook[]> {
  const apiKey = googleBooksApiKey();
  if (!apiKey && Date.now() < googleUnavailableUntil) return [];
  const resolve = async (ebook: EBook) => {
    const owner = ebook.seriesTitle || ebook.title;
    const key = metadataRequestKey(ebook);
    if (googleMetadata.has(key)) return;
    const candidates = metadataCandidates(ebook);
    let exact: GoogleBook | undefined;
    let failed = false;
    for (const candidate of candidates) {
      const url = new URL(
        ebook.googleBooksId
          ? `https://www.googleapis.com/books/v1/volumes/${encodeURIComponent(ebook.googleBooksId)}`
          : "https://www.googleapis.com/books/v1/volumes",
      );
      if (!ebook.googleBooksId)
        url.searchParams.set(
          "q",
          ebook.isbn ? `isbn:${ebook.isbn}` : `intitle:\"${lookupTitle(candidate)}\"`,
        );
      if (!ebook.googleBooksId) url.searchParams.set("maxResults", "5");
      if (!ebook.googleBooksId) url.searchParams.set("langRestrict", getUiLanguage());
      if (apiKey) url.searchParams.set("key", apiKey);
      const data = await cachedJson<GoogleBook | { items?: GoogleBook[] }>(url.toString()).catch(
        (error) => {
          failed = true;
          if (!apiKey && String(error).includes("HTTP 429"))
            googleUnavailableUntil = Date.now() + 10 * 60_000;
          return null;
        },
      );
      if (!data) break;
      const books = "volumeInfo" in data ? [data] : (data.items ?? []);
      exact =
        books.find((book) => book.id === ebook.googleBooksId) ??
        books.find((book) =>
          book.volumeInfo.industryIdentifiers?.some(
            ({ identifier }) => identifier.replace(/[^0-9X]/gi, "") === ebook.isbn,
          ),
        ) ??
        books.find(
          (book) =>
            [
              book.volumeInfo.title,
              `${book.volumeInfo.title}: ${book.volumeInfo.subtitle ?? ""}`,
            ].some((title) => titleKey(title) === titleKey(candidate)) &&
            authorListsMatch(ebook.authors, book.volumeInfo.authors ?? []),
        );
      if (exact || ebook.googleBooksId || ebook.isbn) break;
    }
    if (!failed)
      googleMetadata.set(key, exact ? { ...mapGoogleBook(exact), seriesTitle: owner } : null);
  };
  if (apiKey) await Promise.all(ebooks.map(resolve));
  else {
    const queued = googleQueue.then(async () => {
      for (const ebook of ebooks) {
        if (Date.now() < googleUnavailableUntil) break;
        await resolve(ebook);
      }
    });
    googleQueue = queued.catch(() => {});
    await queued;
  }
  return ebooks.flatMap((ebook) => {
    const match = googleMetadata.get(metadataRequestKey(ebook));
    return match ? [match] : [];
  });
}

type WikidataEntity = {
  id: string;
  labels?: Record<string, { value: string }>;
  descriptions?: Record<string, { value: string }>;
  aliases?: Record<string, Array<{ value: string }>>;
  claims?: Record<string, Array<{ mainsnak?: { datavalue?: { value?: unknown } } }>>;
  sitelinks?: Record<string, { title: string }>;
};

type WikipediaSummary = {
  extract?: string;
  thumbnail?: { source?: string };
  originalimage?: { source?: string };
};

const wikidataMetadata = new Map<string, EBook | null>();

type WikidataBinding = {
  item: { value: string };
  matched: { value: string };
  itemDescription?: { value: string };
};

function wikidataLanguage(value: string): string {
  if (/\p{Script=Arabic}/u.test(value)) return "ar";
  if (/\p{Script=Cyrillic}/u.test(value)) return "ru";
  if (/\p{Script=Han}/u.test(value)) return "zh";
  return "en";
}

function sparqlString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/[\r\n]+/g, " ");
}

function claim(entity: WikidataEntity, property: string): unknown {
  return entity.claims?.[property]?.[0]?.mainsnak?.datavalue?.value;
}

function commonsImage(value: unknown): string | undefined {
  return typeof value === "string" && value
    ? `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(value)}?width=800`
    : undefined;
}

function creditedAuthors(description: string): string[] {
  const match = description.match(
    /\b(?:novel|series|work)\s+(?:written\s+)?by\s+(.+?)(?:\s+and\s+(?:illustrated|published|created)\s+by|[.;]|$)/i,
  );
  return match?.[1]
    ? match[1]
        .split(/\s*[/,]\s*|\s+and\s+/i)
        .map((author) => author.trim())
        .filter(Boolean)
    : [];
}

async function wikipediaSummary(entity: WikidataEntity): Promise<WikipediaSummary | null> {
  const language = getUiLanguage();
  const site = entity.sitelinks?.[`${language}wiki`] ? `${language}wiki` : "enwiki";
  const title = entity.sitelinks?.[site]?.title;
  if (!title) return null;
  return cachedJson<WikipediaSummary>(
    `https://${site.slice(0, -4)}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`,
  ).catch(() => null);
}

function mapWikidata(entity: WikidataEntity, summary?: WikipediaSummary | null): EBook {
  const language = getUiLanguage();
  const labels = entity.labels ?? {};
  const aliases = Object.values(entity.aliases ?? {}).flatMap((values) =>
    values.map(({ value }) => value),
  );
  const date = claim(entity, "P577") as { time?: string } | undefined;
  const cover = claim(entity, "P18");
  const description =
    summary?.extract ??
    entity.descriptions?.[language]?.value ??
    entity.descriptions?.en?.value ??
    entity.descriptions?.ar?.value ??
    "";
  return {
    id: `wikidata:${entity.id}`,
    source: "wikidata",
    wikidataId: entity.id,
    googleBooksId: String(claim(entity, "P675") ?? "") || undefined,
    openLibraryId: String(claim(entity, "P648") ?? "") || undefined,
    isbn: String(claim(entity, "P212") ?? claim(entity, "P957") ?? "") || undefined,
    title:
      labels[language]?.value ??
      labels.en?.value ??
      labels.ar?.value ??
      labels.ja?.value ??
      entity.id,
    altTitle: aliases.length ? [...new Set(aliases)].join("|") : undefined,
    authors: creditedAuthors(description),
    cover:
      summary?.originalimage?.source ??
      summary?.thumbnail?.source ??
      commonsImage(cover),
    description,
    year: Number(date?.time?.match(/[+-](\d{4})/)?.[1]) || undefined,
    genres: [],
    siteUrl: `https://www.wikidata.org/wiki/${entity.id}`,
  };
}

async function fetchWikidataMetadata(ebooks: EBook[]): Promise<EBook[]> {
  const pending = ebooks.filter((ebook) => !wikidataMetadata.has(metadataRequestKey(ebook)));
  if (pending.length) {
    const owners = new Map<string, Set<string>>();
    for (const ebook of pending) {
      for (const candidate of metadataCandidates(ebook)) {
        const key = `${wikidataLanguage(candidate)}:${titleKey(candidate)}`;
        const values = owners.get(key) ?? new Set<string>();
        values.add(ebook.id);
        owners.set(key, values);
      }
    }
    const terms = [...owners.keys()];
    const ids = new Map<string, Set<string>>(
      pending.map((ebook) => [ebook.id, new Set(ebook.wikidataId ? [ebook.wikidataId] : [])]),
    );
    let complete = true;
    for (let start = 0; start < terms.length; start += 30) {
      const batch = terms.slice(start, start + 30);
      const values = batch
        .map((term) => {
          const split = term.indexOf(":");
          const language = term.slice(0, split);
          const title = metadataCandidates(
            pending.find((ebook) => owners.get(term)?.has(ebook.id))!,
          ).find((candidate) => titleKey(candidate) === term.slice(split + 1))!;
          return `"${sparqlString(title)}"@${language}`;
        })
        .join(" ");
      const query = `PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
SELECT DISTINCT ?matched ?item ?itemDescription WHERE {
  VALUES ?matched { ${values} }
  VALUES ?kind { wd:Q571 wd:Q8261 wd:Q277759 wd:Q1667921 wd:Q7725634 wd:Q47461344 }
  ?item (rdfs:label|skos:altLabel) ?matched.
  ?item wdt:P31 ?kind.
  SERVICE wikibase:label { bd:serviceParam wikibase:language "${getUiLanguage()},en,ar". }
}`;
      const url = new URL("https://query.wikidata.org/sparql");
      url.searchParams.set("query", query);
      url.searchParams.set("format", "json");
      const data = await cachedJson<{ results?: { bindings?: WikidataBinding[] } }>(
        url.toString(),
      ).catch(() => null);
      if (!data) {
        complete = false;
        continue;
      }
      for (const binding of data.results?.bindings ?? []) {
        if (
          !/\b(?:(?:web|light)\s+)?novel\b|\b(?:book|novel) series\b|\bliterary work\b/i.test(
            binding.itemDescription?.value ?? "",
          )
        )
          continue;
        const term = `${wikidataLanguage(binding.matched.value)}:${titleKey(binding.matched.value)}`;
        const id = binding.item.value.match(/Q\d+$/)?.[0];
        if (!id) continue;
        for (const owner of owners.get(term) ?? []) ids.get(owner)?.add(id);
      }
    }
    const entityIds = [...new Set([...ids.values()].flatMap((values) => [...values]))];
    const entities: Record<string, WikidataEntity> = {};
    for (let start = 0; start < entityIds.length; start += 50) {
      const url = new URL("https://www.wikidata.org/w/api.php");
      url.search = new URLSearchParams({
        action: "wbgetentities",
        ids: entityIds.slice(start, start + 50).join("|"),
        props: "labels|descriptions|aliases|claims|sitelinks",
        languages: [...new Set([getUiLanguage(), "en", "ar", "pt", "ru", "ja"])].join("|"),
        sitefilter: [...new Set([`${getUiLanguage()}wiki`, "enwiki", "arwiki"])].join("|"),
        format: "json",
        origin: "*",
        maxlag: "5",
      }).toString();
      const data = await cachedJson<{ entities?: Record<string, WikidataEntity> }>(
        url.toString(),
      ).catch(() => null);
      if (!data) complete = false;
      else Object.assign(entities, data.entities);
    }
    await Promise.all(
      pending.map(async (ebook) => {
        const owner = ebook.seriesTitle || ebook.title;
        const entity = [...(ids.get(ebook.id) ?? [])]
          .map((id) => entities[id])
          .find(
            (candidate) =>
              candidate && verifiedMetadataMatch(ebook, mapWikidata(candidate)),
          );
        if (entity) {
          const summary = await wikipediaSummary(entity);
          wikidataMetadata.set(metadataRequestKey(ebook), {
            ...mapWikidata(entity, summary),
            seriesTitle: owner,
          });
        } else if (complete) wikidataMetadata.set(metadataRequestKey(ebook), null);
      }),
    );
  }
  return ebooks.flatMap((ebook) => {
    const match = wikidataMetadata.get(metadataRequestKey(ebook));
    return match ? [match] : [];
  });
}

function mapOpenLibrary(n: OpenLibraryDoc): EBook {
  const key = n.key.replace(/^\/works\//, "");
  return {
    id: `openlibrary:${key}`,
    source: "openlibrary",
    openLibraryId: key,
    isbn: n.isbn?.[0],
    seriesTitle: n.series?.[0],
    title: n.title,
    authors: n.author_name ?? [],
    cover: n.cover_i ? `https://covers.openlibrary.org/b/id/${n.cover_i}-L.jpg` : undefined,
    description: Array.isArray(n.first_sentence)
      ? (n.first_sentence[0] ?? "")
      : (n.first_sentence ?? ""),
    year: n.first_publish_year,
    genres: n.subject?.slice(0, 8) ?? [],
    siteUrl: `https://openlibrary.org/works/${key}`,
  };
}

function alternativeTitles(doc: OpenLibraryDoc): string[] {
  return Array.isArray(doc.alternative_title)
    ? doc.alternative_title
    : doc.alternative_title
      ? [doc.alternative_title]
      : [];
}

async function fetchOpenLibraryMetadata(ebooks: EBook[]): Promise<EBook[]> {
  const pending = ebooks.filter((ebook) => !openLibraryMetadata.has(metadataRequestKey(ebook)));
  const docs: OpenLibraryDoc[] = [];
  let complete = true;
  const direct = pending.filter((ebook) => ebook.openLibraryId || ebook.isbn);
  await Promise.all(
    direct.map(async (source) => {
      const url = new URL("https://openlibrary.org/search.json");
      if (source.openLibraryId) url.searchParams.set("q", `key:/works/${source.openLibraryId}`);
      else url.searchParams.set("isbn", source.isbn!);
      url.searchParams.set("fields", OPEN_LIBRARY_FIELDS);
      url.searchParams.set("limit", "5");
      const response = await cachedJson<{ docs?: OpenLibraryDoc[] }>(url.toString()).catch(
        () => null,
      );
      if (!response) return void (complete = false);
      docs.push(...(response.docs ?? []));
    }),
  );
  const titles = [
    ...new Set(
      pending
        .filter((ebook) => !ebook.openLibraryId && !ebook.isbn)
        .flatMap(metadataCandidates),
    ),
  ];
  for (let start = 0; start < titles.length; start += 12) {
    const url = new URL("https://openlibrary.org/search.json");
    url.searchParams.set(
      "q",
      titles
        .slice(start, start + 12)
        .map((title) => `title:\"${title.replace(/[\\\"]+/g, " ")}\"`)
        .join(" OR "),
    );
    url.searchParams.set("fields", OPEN_LIBRARY_FIELDS);
    url.searchParams.set("limit", "100");
    url.searchParams.set("lang", getUiLanguage());
    const response = await cachedJson<{ docs?: OpenLibraryDoc[] }>(url.toString()).catch(
      () => null,
    );
    if (!response) complete = false;
    else docs.push(...(response.docs ?? []));
  }
  for (const source of pending) {
    const keys = new Set(metadataCandidates(source).map(titleKey));
    const exact =
      docs.find((doc) => doc.key.replace(/^\/works\//, "") === source.openLibraryId) ??
      docs.find((doc) => source.isbn && doc.isbn?.includes(source.isbn)) ??
      docs.find(
        (doc) =>
          [doc.title, ...alternativeTitles(doc)].some((value) => keys.has(titleKey(value))) &&
          authorListsMatch(source.authors, doc.author_name ?? []),
      );
    if (!exact && !complete) continue;
    const cacheKey = metadataRequestKey(source);
    openLibraryMetadata.set(
      cacheKey,
      exact
        ? { ...mapOpenLibrary(exact), seriesTitle: source.seriesTitle || source.title }
        : null,
    );
    openLibraryAliases.set(cacheKey, exact ? alternativeTitles(exact) : []);
  }
  return ebooks.flatMap((ebook) => {
    const match = openLibraryMetadata.get(metadataRequestKey(ebook));
    return match ? [match] : [];
  });
}

export async function fetchEBookMetadata(ebooks: EBook[]): Promise<EBook[]> {
  const [google, wikidata] = await Promise.all([
    fetchGoogleMetadata(ebooks),
    fetchWikidataMetadata(ebooks),
  ]);
  const primary = [...google, ...wikidata];
  const unresolved = ebooks.filter(
    (source) => !primary.some((metadata) => verifiedMetadataMatch(source, metadata)),
  );
  const [anilist, openLibrary] = await Promise.all([
    fetchAniListEBookMetadata(unresolved),
    fetchOpenLibraryMetadata(unresolved),
  ]);
  const aliasOwners = new Map<string, { alias: string; owner: string }>();
  for (const ebook of unresolved) {
    const owner = ebook.seriesTitle || ebook.title;
    for (const alias of openLibraryAliases.get(metadataRequestKey(ebook)) ?? []) {
      if (titleKey(alias) !== titleKey(owner))
        aliasOwners.set(titleKey(alias), { alias, owner });
    }
  }
  const aliasMatches = aliasOwners.size
    ? await fetchAniListEBookMetadata(
        [...aliasOwners.values()].map(({ alias }) => ({
          id: alias,
          source: "source",
          title: alias,
          authors: [],
          description: "",
          genres: [],
        })),
      )
    : [];
  const crosswalk = aliasMatches.flatMap((ebook) => {
    const owner = aliasOwners.get(titleKey(ebook.seriesTitle || ebook.title))?.owner;
    return owner ? [{ ...ebook, seriesTitle: owner }] : [];
  });
  return [...primary, ...anilist, ...crosswalk, ...openLibrary];
}

const SUBJECT_QUERY: Record<string, string> = {
  Fiction: "fiction",
  "Non-fiction": "nonfiction",
  Novel: "novels",
  Novella: "novellas",
  "Short story": "short stories",
  Fantasy: "fantasy",
  "Science fiction": "science fiction",
  Romance: "romance",
  "Mystery / Detective": "mystery and detective stories",
  "Thriller / Suspense": "thrillers",
  Horror: "horror",
  "Historical fiction": "historical fiction",
  Adventure: "adventure stories",
  "Literary fiction": "literary fiction",
  "Young Adult (YA)": "young adult fiction",
  "Self-help / Personal development": "self-help",
  Psychology: "psychology",
  Philosophy: "philosophy",
  "Biography / Autobiography / Memoir": "biography and autobiography",
  History: "history",
  "Business & Finance": "business and economics",
  Science: "science",
  Technology: "technology",
  "Health & Fitness": "health and fitness",
  "Politics & Society": "politics and government",
  "True crime": "true crime",
  Travel: "travel",
  "Education / Textbooks": "education",
  "Reference / Guides": "reference",
  Essays: "essays",
  "Religion & Spirituality": "religion and spirituality",
  Cookbooks: "cookbooks",
};

export async function browseEBookCategory(category: string): Promise<EBook[]> {
  const url = new URL("https://openlibrary.org/search.json");
  url.searchParams.set("subject", SUBJECT_QUERY[category] ?? category);
  url.searchParams.set("fields", OPEN_LIBRARY_FIELDS);
  url.searchParams.set("limit", "24");
  return groupEBookSeries(
    (await cachedJson<{ docs?: OpenLibraryDoc[] }>(url.toString())).docs?.map(mapOpenLibrary) ?? [],
  );
}

export async function browsePopularEBooks(): Promise<EBook[]> {
  const data = await cachedJson<{ works?: OpenLibraryDoc[] }>(
    "https://openlibrary.org/trending/forever.json?limit=18",
  );
  return groupEBookSeries((data.works ?? []).map(mapOpenLibrary));
}

export async function searchEBooks(search: string, category?: string): Promise<EBook[]> {
  const url = new URL("https://openlibrary.org/search.json");
  url.searchParams.set("q", search.trim());
  if (category) url.searchParams.set("subject", SUBJECT_QUERY[category] ?? category);
  url.searchParams.set("fields", OPEN_LIBRARY_FIELDS);
  url.searchParams.set("limit", "16");
  const [primary, data] = await Promise.all([
    category ? Promise.resolve([]) : browseEBooks("SEARCH_MATCH", 1, search).catch(() => []),
    cachedJson<{ docs?: OpenLibraryDoc[] }>(url.toString()).catch(() => null),
  ]);
  return groupEBookSeries([...primary, ...(data?.docs ?? []).map(mapOpenLibrary)]);
}

function seriesKey(ebook: EBook): string {
  return (ebook.seriesTitle || ebook.title)
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function groupEBookSeries(ebooks: EBook[]): EBook[] {
  const groups = new Map<string, EBook[]>();
  for (const ebook of ebooks) {
    const key = seriesKey(ebook);
    const books = groups.get(key) ?? [];
    if (!books.some((book) => book.id === ebook.id)) books.push(ebook);
    groups.set(key, books);
  }
  return Array.from(groups.values()).map((books) => {
    if (books.length === 1) return books[0];
    const primary =
      books.find((book) => book.source === "source") ??
      books.find((book) => book.source === "anilist") ??
      books[0];
    return {
      ...primary,
      title: primary.seriesTitle || primary.title,
      books: books.flatMap((book) => book.books ?? [book]),
    };
  });
}

function sourceFallback(ebook: EBook): EBook {
  if (ebook.source !== "source") return { ...ebook };
  if (/\p{Script=Arabic}/u.test(ebook.title)) return { ...ebook };
  const language = getUiLanguage();
  let slug = "";
  try {
    slug =
      decodeURIComponent(ebook.sourceItemId ?? "")
        .split("/")
        .filter(Boolean)
        .at(-1)
        ?.replace(/[-_]+/g, " ") ?? "";
  } catch {}
  const alternatives = [...(ebook.altTitle?.split("|") ?? []), slug].filter(Boolean);
  const localized = alternatives.find((title) =>
    language === "ar"
      ? /\p{Script=Arabic}/u.test(title)
      : language === "ru"
        ? /\p{Script=Cyrillic}/u.test(title)
        : /\p{Script=Latin}/u.test(title),
  );
  return {
    ...ebook,
    title: localized || alternatives[0] || ebook.title,
  };
}

export function mergeEBookMetadata(sources: EBook[], metadata: EBook[]): EBook[] {
  const priority = ["googlebooks", "wikidata", "anilist", "openlibrary"] as const;
  const matches = new Map<string, EBook[]>();
  for (const ebook of metadata) {
    const key = seriesKey(ebook);
    matches.set(key, [...(matches.get(key) ?? []), ebook]);
  }
  return groupEBookSeries(sources).map((ebook) => {
    const keepArabicSource = ebook.source === "source" && /\p{Script=Arabic}/u.test(ebook.title);
    const candidates = (matches.get(seriesKey(ebook)) ?? [])
      .filter((candidate) => verifiedMetadataMatch(ebook, candidate))
      .sort(
        (left, right) =>
          priority.indexOf(left.source as (typeof priority)[number]) -
          priority.indexOf(right.source as (typeof priority)[number]),
      );
    const source = sourceFallback(ebook);
    if (!candidates.length) return source;
    const meta = candidates[0];
    const embeddedSourceCover = /^data:image\//i.test(source.cover ?? "");
    const metadataGenres = candidates.find((candidate) => candidate.genres.length)?.genres ?? [];
    return {
      ...source,
      anilistId: meta.anilistId ?? source.anilistId,
      googleBooksId: meta.googleBooksId ?? source.googleBooksId,
      openLibraryId: meta.openLibraryId ?? source.openLibraryId,
      wikidataId: meta.wikidataId ?? source.wikidataId,
      isbn: meta.isbn ?? source.isbn,
      title: keepArabicSource ? source.title : meta.title || source.title,
      altTitle: meta.altTitle ?? source.altTitle,
      authors: meta.authors.length ? meta.authors : source.authors,
      internalCover:
        source.internalCover ??
        candidates.find((candidate) => candidate.cover && candidate.cover !== meta.cover)?.cover ??
        source.cover ??
        meta.cover,
      cover:
        keepArabicSource || embeddedSourceCover
          ? source.cover || meta.cover
          : meta.cover || source.cover,
      banner: meta.banner ?? source.banner,
      description: keepArabicSource
        ? source.description || meta.description
        : meta.description || source.description,
      genres:
        keepArabicSource && source.genres.length
          ? source.genres
          : metadataGenres.length
            ? metadataGenres
            : ebook.genres,
      year: meta.year ?? source.year,
      status: meta.status ?? source.status,
      chapters: source.chapters,
      volumes: source.volumes,
      score: meta.score ?? source.score,
      siteUrl: meta.siteUrl ?? source.siteUrl,
    };
  });
}

export async function ebookDetail(id: string): Promise<EBook | null> {
  if (id.startsWith("openlibrary:")) {
    const key = id.slice(12);
    const data = await cachedJson<{
      title: string;
      description?: string | { value?: string };
      covers?: number[];
      first_publish_date?: string;
      subjects?: string[];
    }>(`https://openlibrary.org/works/${encodeURIComponent(key)}.json`).catch(() => null);
    if (!data) return null;
    const description = clean(
      typeof data.description === "string" ? data.description : (data.description?.value ?? ""),
    );
    return {
      id,
      source: "openlibrary",
      openLibraryId: key,
      title: data.title,
      authors: [],
      cover: data.covers?.[0]
        ? `https://covers.openlibrary.org/b/id/${data.covers[0]}-L.jpg`
        : undefined,
      description,
      year: Number(data.first_publish_date?.match(/\d{4}/)?.[0]) || undefined,
      genres: data.subjects?.slice(0, 8) ?? [],
      siteUrl: `https://openlibrary.org/works/${key}`,
    };
  }
  const anilistId = Number(id.replace(/^anilist:/, ""));
  if (!anilistId) return null;
  const data = await anilistRequest<{ Media: RawEBook | null }>(
    DETAIL,
    { id: anilistId },
    undefined,
    true,
  );
  return data.Media ? mapEBook(data.Media) : null;
}
