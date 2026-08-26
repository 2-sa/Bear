import { anilistRequest } from "@/lib/anilist/client";
import { safeFetch } from "@/lib/safe-fetch";

export type EBook = {
  id: string;
  source: "anilist" | "openlibrary" | "source";
  providerId?: string;
  sourceItemId?: string;
  providerName?: string;
  anilistId?: number;
  openLibraryId?: string;
  isbn?: string;
  seriesTitle?: string;
  books?: EBook[];
  title: string;
  altTitle?: string;
  authors: string[];
  cover?: string;
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

const DETAIL = `query ($id: Int) { Media(id: $id, type: MANGA) { ${FIELDS} } }`;
const NEW_RELEASES = `query ($before: FuzzyDateInt) {
  Page(page: 1, perPage: 24) {
    media(type: MANGA, format: NOVEL, sort: START_DATE_DESC, startDate_lesser: $before, isAdult: false) { ${FIELDS} }
  }
}`;
const anilistMetadata = new Map<string, EBook | null>();

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
      .map((query) => query?.trim())
      .filter((query): query is string => !!query && (query === owner || /[a-z]{3}/i.test(query)))
      .map((query) => ({ query, owner }));
  });
}

function clean(text: string | null): string {
  return (text ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

export function mapEBook(n: RawEBook): EBook {
  return {
    id: `anilist:${n.id}`,
    source: "anilist",
    anilistId: n.id,
    title:
      n.title.english?.trim() || n.title.romaji?.trim() || n.title.native?.trim() || "Untitled",
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
          Media(id: $id, type: MANGA) {
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
  const lookups = metadataLookups(ebooks);
  const titles = [...new Set(lookups.map(({ query }) => query))];
  const missing = titles.filter((title) => !anilistMetadata.has(titleKey(title)));
  for (let start = 0; start < missing.length; start += 6) {
    const batch = missing.slice(start, start + 6);
    const variables = Object.fromEntries(batch.map((title, index) => [`q${index}`, title]));
    const query = `query (${batch.map((_, index) => `$q${index}: String`).join(", ")}) {
      ${batch
        .map(
          (_, index) =>
            `m${index}: Page(page: 1, perPage: 3) { media(search: $q${index}, type: MANGA, isAdult: false) { ${FIELDS} } }`,
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
      anilistMetadata.set(key, raw ? mapEBook(raw) : null);
    });
  }
  const matches = new Map<string, EBook>();
  for (const { query, owner } of lookups) {
    const match = anilistMetadata.get(titleKey(query));
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
  const key = `harbor.ebook.openlibrary.v1.${url}`;
  try {
    const cached = JSON.parse(localStorage.getItem(key) ?? "null") as {
      at: number;
      value: T;
    } | null;
    if (cached && Date.now() - cached.at < OPEN_LIBRARY_CACHE_MS) return cached.value;
  } catch {}
  const response = await safeFetch(url, { signal: AbortSignal.timeout(8_000) });
  if (!response.ok) throw new Error(`Open Library HTTP ${response.status}`);
  const value = (await response.json()) as T;
  try {
    localStorage.setItem(key, JSON.stringify({ at: Date.now(), value }));
  } catch {}
  return value;
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

export async function fetchEBookMetadata(ebooks: EBook[]): Promise<EBook[]> {
  const titles = [...new Set(ebooks.map((ebook) => ebook.seriesTitle || ebook.title))];
  const anilist = await fetchAniListEBookMetadata(ebooks);
  const matched = new Set(anilist.map((ebook) => seriesKey(ebook)));
  await Promise.all(
    titles.map(async (title) => {
      const key = titleKey(title);
      if (matched.has(key) || openLibraryMetadata.has(key)) return;
      const url = new URL("https://openlibrary.org/search.json");
      url.searchParams.set("title", title);
      url.searchParams.set("fields", OPEN_LIBRARY_FIELDS);
      url.searchParams.set("limit", "5");
      const docs = (await cachedJson<{ docs?: OpenLibraryDoc[] }>(url.toString()).catch(() => null))
        ?.docs;
      const exact = docs?.find((doc) =>
        [doc.title, ...alternativeTitles(doc)].some((candidate) => titleKey(candidate) === key),
      );
      openLibraryMetadata.set(key, exact ? { ...mapOpenLibrary(exact), seriesTitle: title } : null);
      openLibraryAliases.set(key, exact ? alternativeTitles(exact) : []);
    }),
  );
  const aliasOwners = new Map<string, { alias: string; owner: string }>();
  for (const title of titles) {
    for (const alias of openLibraryAliases.get(titleKey(title)) ?? []) {
      if (titleKey(alias) !== titleKey(title))
        aliasOwners.set(titleKey(alias), { alias, owner: title });
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
  const preferred = new Set([...anilist, ...crosswalk].map((ebook) => seriesKey(ebook)));
  return [
    ...anilist,
    ...crosswalk,
    ...titles.flatMap((title) => {
      const match = openLibraryMetadata.get(titleKey(title));
      return match && !preferred.has(titleKey(title)) ? [match] : [];
    }),
  ];
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

export function mergeEBookMetadata(sources: EBook[], metadata: EBook[]): EBook[] {
  const matches = new Map(
    metadata
      .filter((ebook) => ebook.source === "openlibrary")
      .map((ebook) => [seriesKey(ebook), ebook]),
  );
  for (const ebook of metadata) {
    if (ebook.source === "anilist") matches.set(seriesKey(ebook), ebook);
  }
  return groupEBookSeries(sources).map((ebook) => {
    const meta = matches.get(seriesKey(ebook));
    const source = {
      ...ebook,
      anilistId: undefined,
    };
    if (!meta) return source;
    return {
      ...source,
      anilistId: meta.anilistId,
      title: meta.title,
      altTitle: meta.altTitle,
      authors: meta.authors,
      cover: meta.cover,
      banner: meta.banner,
      description: meta.description,
      genres: meta.genres,
      year: meta.year,
      status: meta.status,
      chapters: meta.chapters ?? source.chapters,
      volumes: meta.volumes ?? source.volumes,
      score: meta.score,
      siteUrl: meta.siteUrl,
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

