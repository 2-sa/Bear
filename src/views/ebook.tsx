import {
  BookOpen,
  Bookmark,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Heart,
  LayoutGrid,
  Library,
  List,
  Loader2,
  RefreshCw,
  Search,
  Settings,
} from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import "./ebook-book.css";
import "./ebook-hero.css";
import { NavArrow } from "@/components/nav-arrow";
import { CoverImg } from "@/components/cover-img";
import { Poster } from "@/components/poster";
import { Row } from "@/components/row";
import { useAnilist } from "@/lib/anilist/provider";
import { useUiLanguage } from "@/lib/i18n";
import {
  EBOOK_CATEGORIES,
  attachEBookCollectionSources,
  browsePopularEBooks,
  ebookCollection,
  ebookDetail,
  mergeEBookMetadata,
  recommendedEBooks,
  type EBook,
  type EBookCategoryGroup,
} from "@/lib/ebook/api";
import {
  favoriteEBooks,
  ebookInLibrary,
  ebookIsFavorite,
  ebookLibrary,
  toggleEBookFavorite,
  toggleEBookLibrary,
} from "@/lib/ebook/library";
import {
  listEBookProviders,
  loadSourceEBookPage,
  searchSourceEBooks,
  sourceEBookChapters,
  sourceEBookContent,
  sourceEBookDetail,
  type EBookChapter,
  type EBookChapterContent,
  type EBookCursor,
  type EBookProvider,
} from "@/lib/ebook/providers";
import { subscribeEBookExtensions } from "@/lib/ebook/extensions";
import { subscribeEBookSources } from "@/lib/ebook/sources";
import { fetchEBookListCollection, flushPendingEBookTracking } from "@/lib/ebook/tracking";
import { useView } from "@/lib/view";
import { usePageVisible } from "@/lib/visibility";
import { openUrl } from "@/lib/window";
import { useArtGlow } from "./big-picture/bp-art-color";
import { EBookSourcesView } from "./ebook/ebook-sources-panel";
import { EBookReader } from "./ebook/ebook-reader";
import { MangaRail } from "./manga/manga-rail";

type Rail = {
  title: string;
  subtitle: string;
  items: EBook[] | null;
  hideEmpty?: boolean;
  onEndReached?: () => void;
  loadingMore?: boolean;
};

type EBookBrowseType = EBookCategoryGroup | "Genre";
type EBookTitleLanguage = "auto" | "en" | "ar" | "original";

const EBookTitleLanguageContext = createContext<EBookTitleLanguage>("auto");

function ebookTitleForLanguage(ebook: EBook, language: EBookTitleLanguage): string {
  if (language === "auto" || language === "original") return ebook.title;
  const candidates = [ebook.title, ...(ebook.altTitle?.split("|") ?? [])]
    .map((title) => title.trim())
    .filter(Boolean);
  const match =
    language === "ar"
      ? candidates.find((title) => /[\u0600-\u06ff]/.test(title))
      : candidates.find(
          (title) => /[a-z]/i.test(title) && !/[\u0600-\u06ff\u3040-\u30ff\u3400-\u9fff]/.test(title),
        );
  return match ?? ebook.title;
}

type EBookVolumeGroup = {
  volume: string;
  label: string;
  number?: number;
  chapters: EBookChapter[];
};

function labelNumber(value: string): number | undefined {
  const digits = "٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹";
  const match = value
    .replace(/[٠-٩۰-۹]/g, (digit) => String(digits.indexOf(digit) % 10))
    .match(/\d+(?:\.\d+)?/);
  const number = match ? Number(match[0]) : NaN;
  return Number.isFinite(number) ? number : undefined;
}

function updateSourceItems(current: EBook[] | null, incoming: EBook[], replace = false): EBook[] {
  const key = (ebook: EBook) =>
    (ebook.seriesTitle || ebook.title)
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
  const groups = [...(current ?? [])];
  for (const ebook of incoming) {
    const incomingIds = new Set((ebook.books ?? [ebook]).map((book) => book.id));
    const index = groups.findIndex((existing) =>
      (existing.books ?? [existing]).some((book) => incomingIds.has(book.id)),
    );
    const fallback =
      index < 0 ? groups.findIndex((existing) => key(existing) === key(ebook)) : index;
    if (fallback < 0) {
      groups.push(ebook);
      continue;
    }
    const existing = groups[fallback];
    const books = new Map(
      [...(existing.books ?? [existing]), ...(ebook.books ?? [ebook])].map((book) => [
        book.id,
        book,
      ]),
    );
    groups[fallback] = {
      ...(replace ? ebook : existing),
      books: books.size > 1 ? [...books.values()] : undefined,
    };
  }
  return groups;
}

export function EBookView() {
  const { ebookId, openEBook, topKind } = useView();
  const { isConnected, session } = useAnilist();
  const uiLanguage = useUiLanguage();
  const [sourceItems, setSourceItems] = useState<EBook[] | null>(null);
  const [providers, setProviders] = useState<EBookProvider[]>([]);
  const [providerId, setProviderId] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<EBook[] | null>(null);
  const [categoryGroup, setCategoryGroup] = useState<EBookBrowseType>("Genre");
  const [category, setCategory] = useState("");
  const [browseAll, setBrowseAll] = useState(false);
  const [titleLanguage, setTitleLanguage] = useState<EBookTitleLanguage>("auto");
  const [selected, setSelected] = useState<EBook | null>(null);
  const [saved, setSaved] = useState<EBook[]>(() => ebookLibrary());
  const [favorites, setFavorites] = useState<EBook[]>(() => favoriteEBooks());
  const [screen, setScreen] = useState<"browse" | "collections" | "sources">("browse");
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [popular, setPopular] = useState<EBook[] | null>(null);
  const [metadataVersion, setMetadataVersion] = useState(0);
  const [featuredCollections, setFeaturedCollections] = useState<Array<{
    name: string;
    books: EBook[];
  }>>([]);
  const [collectionSources, setCollectionSources] = useState<EBook[]>([]);
  const searchSeq = useRef(0);
  const searchTimer = useRef<number | undefined>(undefined);
  const sourceSeq = useRef(0);
  const providerIdRef = useRef("");
  const cursorRef = useRef<EBookCursor>({});
  const loadingMoreRef = useRef(false);
  const resolvedCollections = useMemo(
    () =>
      featuredCollections.map((collection) => ({
        ...collection,
        books: attachEBookCollectionSources(collection.books, collectionSources),
      })),
    [collectionSources, featuredCollections],
  );
  const collectionBooks = useMemo(
    () => resolvedCollections.flatMap((collection) => collection.books),
    [resolvedCollections],
  );
  const currentItems = useMemo(() => {
    const items = new Map<string, EBook>();
    for (const ebook of sourceItems ?? [])
      for (const book of ebook.books ?? [ebook]) items.set(book.id, ebook);
    for (const ebook of collectionBooks)
      for (const book of ebook.books ?? [ebook]) items.set(book.id, ebook);
    return items;
  }, [collectionBooks, sourceItems]);
  const displaySaved = useMemo(
    () => saved.map((ebook) => currentItems.get(ebook.id) ?? mergeEBookMetadata([ebook], [])[0]),
    [currentItems, saved],
  );
  const displayFavorites = useMemo(
    () =>
      favorites.map((ebook) => currentItems.get(ebook.id) ?? mergeEBookMetadata([ebook], [])[0]),
    [currentItems, favorites],
  );
  const loadAnilistLibrary = useCallback(() => {
    if (!isConnected || !session) {
      return;
    }
    void flushPendingEBookTracking()
      .then(() => fetchEBookListCollection(session.userId))
      .catch(() => {});
  }, [isConnected, session]);

  useEffect(loadAnilistLibrary, [loadAnilistLibrary]);

  useEffect(() => {
    let active = true;
    void browsePopularEBooks()
      .catch(() => [])
      .then((allTime) => {
        if (active) setPopular(allTime);
      });
    return () => {
      active = false;
    };
  }, [metadataVersion, uiLanguage]);

  useEffect(() => {
    const refresh = () => setMetadataVersion((version) => version + 1);
    window.addEventListener("harbor:ebook-metadata", refresh);
    return () => window.removeEventListener("harbor:ebook-metadata", refresh);
  }, []);

  useEffect(() => {
    if (!popular?.length) {
      setFeaturedCollections([]);
      return;
    }
    let active = true;
    setFeaturedCollections([]);
    void (async () => {
      const candidates = popular.slice(0, 30);
      const discovered = new Map<string, { name: string; books: EBook[] }>();
      for (let start = 0; start < candidates.length; start += 6) {
        const batch = candidates.slice(start, start + 6);
        const matches = await Promise.all(
          batch.map(async (book) => ({
            book,
            collection: await ebookCollection(book).catch(() => null),
          })),
        );
        for (const match of matches) {
          if (!match.collection?.books.length) continue;
          const collectionKey = match.collection.name.normalize("NFKD").toLocaleLowerCase();
          const existing = discovered.get(collectionKey);
          const unique = new Map(
            (existing?.books ?? []).map((book) => [
              book.title.normalize("NFKD").toLocaleLowerCase(),
              book,
            ]),
          );
          for (const book of [match.book, ...match.collection.books]) {
            const key = book.title.normalize("NFKD").toLocaleLowerCase();
            if (!unique.has(key)) unique.set(key, book);
          }
          discovered.set(collectionKey, {
            name: match.collection.name,
            books: [...unique.values()],
          });
        }
      }
      if (active) setFeaturedCollections([...discovered.values()]);
    })();
    return () => {
      active = false;
    };
  }, [popular]);

  useEffect(() => {
    const books = featuredCollections.flatMap((collection) => collection.books);
    if (!books.length) {
      setCollectionSources([]);
      return;
    }
    let active = true;
    setCollectionSources([]);
    void (async () => {
      const unique = new Map(books.map((book) => [book.title.toLocaleLowerCase(), book]));
      const matches: EBook[] = [];
      const candidates = [...unique.values()];
      for (let start = 0; start < candidates.length; start += 6) {
        const batch = await Promise.all(
          candidates
            .slice(start, start + 6)
            .map((book) => searchSourceEBooks(book.title, "all").catch(() => [])),
        );
        matches.push(...batch.flat());
      }
      if (active) setCollectionSources(matches);
    })();
    return () => {
      active = false;
    };
  }, [featuredCollections]);

  const loadSources = useCallback((requestedProvider?: string) => {
    const seq = ++sourceSeq.current;
    cursorRef.current = {};
    setHasMore(false);
    setSourceItems(null);
    void listEBookProviders()
      .then((list) => {
        if (seq !== sourceSeq.current) return null;
        setProviders(list);
        const requested = requestedProvider ?? providerIdRef.current;
        const selected = list.some((source) => source.id === requested)
          ? requested
          : (list[0]?.id ?? "");
        providerIdRef.current = selected;
        setProviderId(selected);
        return loadSourceEBookPage(
          undefined,
          selected,
          {},
          {
            onSource: (items) => {
              if (seq === sourceSeq.current)
                setSourceItems((current) => updateSourceItems(current, items));
            },
            onMetadata: (items) => {
              if (seq === sourceSeq.current)
                setSourceItems((current) => updateSourceItems(current, items, true));
            },
          },
        );
      })
      .then((page) => {
        if (!page || seq !== sourceSeq.current) return;
        cursorRef.current = page.cursor;
        setHasMore(page.hasMore);
        void page.enriched.then((items) => {
          if (seq === sourceSeq.current)
            setSourceItems((current) => updateSourceItems(current, items, true));
        });
      })
      .catch(() => {
        if (seq === sourceSeq.current) setSourceItems([]);
      });
  }, []);

  useEffect(() => {
    loadSources();
    const sources = subscribeEBookSources(loadSources);
    const extensions = subscribeEBookExtensions(loadSources);
    return () => {
      window.clearTimeout(searchTimer.current);
      sources();
      extensions();
    };
  }, [loadSources, metadataVersion, uiLanguage]);

  useEffect(() => {
    const update = () => {
      setSaved(ebookLibrary());
      setFavorites(favoriteEBooks());
    };
    window.addEventListener("harbor:ebook-library", update);
    return () => window.removeEventListener("harbor:ebook-library", update);
  }, []);

  useEffect(() => {
    if (!ebookId) {
      setSelected(null);
      return;
    }
    const cached =
      currentItems.get(ebookId) ??
      [...displayFavorites, ...displaySaved].find((ebook) => ebook.id === ebookId);
    setSelected(cached ?? null);
    const source = ebookId.startsWith("source:");
    void (source ? sourceEBookDetail(ebookId) : ebookDetail(ebookId))
      .then((detail) => {
        if (!detail) return;
        setSelected((current) => {
          return current?.books?.length ? { ...detail, books: current.books } : detail;
        });
      })
      .catch(() => {});
  }, [currentItems, ebookId, displayFavorites, displaySaved, uiLanguage]);

  useEffect(() => {
    const onBack = (event: Event) => {
      if (topKind !== "ebook") return;
      if (ebookId) {
        event.preventDefault();
        openEBook();
      } else if (screen !== "browse") {
        event.preventDefault();
        setScreen("browse");
      }
    };
    window.addEventListener("harbor:local-back", onBack);
    return () => window.removeEventListener("harbor:local-back", onBack);
  }, [ebookId, openEBook, screen, topKind]);

  const search = (value: string) => {
    const wasSearching = query.trim().length >= 2;
    setQuery(value);
    const seq = ++searchSeq.current;
    window.clearTimeout(searchTimer.current);
    if (value.trim().length < 2) {
      setResults(null);
      if (wasSearching) loadSources();
      return;
    }
    cursorRef.current = {};
    setHasMore(false);
    setResults(null);
    searchTimer.current = window.setTimeout(() => {
      void loadSourceEBookPage(
        value.trim(),
        providerId,
        {},
        {
          onSource: (items) => {
            if (seq === searchSeq.current)
              setResults((current) => updateSourceItems(current, items));
          },
          onMetadata: (items) => {
            if (seq === searchSeq.current)
              setResults((current) => updateSourceItems(current, items, true));
          },
        },
      )
        .then((page) => {
          if (seq === searchSeq.current) {
            cursorRef.current = page.cursor;
            setHasMore(page.hasMore);
            void page.enriched.then((items) => {
              if (seq === searchSeq.current)
                setResults((current) => updateSourceItems(current, items, true));
            });
          }
        })
        .catch(() => {
          if (seq === searchSeq.current) setResults([]);
        });
    }, 300);
  };

  const loadMore = useCallback(() => {
    if (!hasMore || loadingMoreRef.current) return;
    const sourceId = sourceSeq.current;
    const searchId = searchSeq.current;
    const term = query.trim().length >= 2 ? query.trim() : undefined;
    const current = term ? results : sourceItems;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    void loadSourceEBookPage(term, providerId, cursorRef.current, {
      onSource: (items) => {
        if (sourceId !== sourceSeq.current || searchId !== searchSeq.current) return;
        if (term) setResults((currentItems) => updateSourceItems(currentItems, items));
        else setSourceItems((currentItems) => updateSourceItems(currentItems, items));
      },
      onMetadata: (items) => {
        if (sourceId !== sourceSeq.current || searchId !== searchSeq.current) return;
        if (term) setResults((currentItems) => updateSourceItems(currentItems, items, true));
        else setSourceItems((currentItems) => updateSourceItems(currentItems, items, true));
      },
    })
      .then((page) => {
        if (sourceId !== sourceSeq.current || searchId !== searchSeq.current) return;
        cursorRef.current = page.cursor;
        const known = new Set(
          (current ?? []).flatMap((ebook) => ebook.books ?? [ebook]).map((ebook) => ebook.id),
        );
        const fresh = page.items.filter((ebook) => !known.has(ebook.id));
        setHasMore(page.hasMore && fresh.length > 0);
        const bare = mergeEBookMetadata(fresh, []);
        if (term) setResults((items) => updateSourceItems(items, bare));
        else setSourceItems((items) => updateSourceItems(items, bare));
        void page.enriched.then((items) => {
          if (sourceId !== sourceSeq.current || searchId !== searchSeq.current) return;
          if (term) setResults((currentItems) => updateSourceItems(currentItems, items, true));
          else setSourceItems((currentItems) => updateSourceItems(currentItems, items, true));
        });
      })
      .catch(() => setHasMore(false))
      .finally(() => {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      });
  }, [hasMore, providerId, query, results, sourceItems]);

  if (ebookId) {
    return (
      <EBookDetails
        ebook={selected}
        onBack={() => openEBook()}
        onOpen={(item) => openEBook(String(item.id))}
      />
    );
  }

  if (screen === "sources") {
    return (
      <main className="flex-1 overflow-y-auto overflow-x-hidden px-12 pb-16 pt-24">
        <EBookSourcesView onBack={() => setScreen("browse")} />
      </main>
    );
  }

  if (screen === "collections") {
    return (
      <main className="flex-1 overflow-y-auto overflow-x-hidden px-12 pb-16 pt-24">
        <button
          type="button"
          onClick={() => setScreen("browse")}
          className="mb-7 inline-flex items-center gap-1.5 rounded-full border border-edge-soft bg-canvas/40 px-4 py-2 text-[14px] text-ink-muted transition-colors hover:bg-elevated hover:text-ink"
        >
          <ChevronLeft size={18} />
          Back
        </button>
        <h1 className="mb-8 font-display text-[32px] font-medium tracking-tight text-ink">
          Collections
        </h1>
        <div className="flex flex-col gap-9">
          {resolvedCollections.map((collection) => (
            <MangaRail
              key={collection.name}
              title={collection.name}
              subtitle={`${collection.books.length} books from the same series`}
              items={collection.books}
              onOpen={(book) => openEBook(book.id)}
            />
          ))}
        </div>
      </main>
    );
  }

  const matchesCategory = (ebook: EBook) => {
    if (browseAll) return true;
    const wanted = category || (categoryGroup === "Genre" ? "" : categoryGroup);
    if (!wanted) return true;
    const categories = category
      ? [category]
      : [categoryGroup, ...EBOOK_CATEGORIES[categoryGroup as EBookCategoryGroup]];
    return ebook.genres.some((genre) =>
      categories.some((item) => genre.toLowerCase().includes(item.toLowerCase())),
    );
  };
  const catalog = sourceItems?.filter(matchesCategory) ?? sourceItems;
  const genreGroups = new Map<string, EBook[]>();
  for (const ebook of sourceItems ?? []) {
    for (const genre of ebook.genres) {
      const name = genre.trim();
      if (!name || (category && name.toLocaleLowerCase() !== category.toLocaleLowerCase())) continue;
      const books = genreGroups.get(name) ?? [];
      if (!books.some((book) => book.id === ebook.id)) books.push(ebook);
      genreGroups.set(name, books);
    }
  }
  const genreRails = [...genreGroups.entries()]
    .sort((left, right) => right[1].length - left[1].length || left[0].localeCompare(right[0]))
    .map(([title, items]) => ({ title, items: items.slice(0, 12) }));
  const featuredBooks = (popular ?? []).filter(
    (ebook) => ebook.cover && !/(?:^|\/)default(?:\.[a-z0-9]+)?(?:[?#]|$)/i.test(ebook.cover),
  );
  const heroBooks = featuredBooks.slice(0, 5);
  const heroIds = new Set(heroBooks.map((ebook) => ebook.id));
  const shelfBooks = featuredBooks.filter((ebook) => !heroIds.has(ebook.id)).slice(0, 60);
  const refreshing = query.trim().length >= 2 ? results === null : sourceItems === null;
  const rails: Rail[] =
    query.trim().length >= 2
      ? []
      : [
          ...(displayFavorites.length
            ? [
                {
                  title: "Favorites",
                  subtitle: "Stories you love",
                  items: displayFavorites.filter((item) => item.source === "source"),
                },
              ]
            : []),
          ...(displaySaved.length
            ? [
                {
                  title: "Bookmarks",
                  subtitle: "Saved for later",
                  items: displaySaved.filter((item) => item.source === "source"),
                },
              ]
            : []),
          {
            title: "Popular eBooks",
            subtitle: "Most read and saved of all time",
            items: popular,
          },
        ];

  return (
    <EBookTitleLanguageContext.Provider value={titleLanguage}>
    <main className="flex-1 overflow-y-auto overflow-x-hidden pb-20">
      <EBookLibraryHero
        ebooks={heroBooks}
        shelfBooks={shelfBooks}
        onOpen={(ebook) => openEBook(String(ebook.id))}
      />

      <div className="flex w-full flex-col gap-9 px-12 pt-8">
        {rails.map((rail) => (
          <EBookRail
            key={`${rail.title}:${providerId}`}
            {...rail}
            onOpen={(ebook) => openEBook(String(ebook.id))}
          />
        ))}
        {resolvedCollections.length > 0 && (
          <div className="mb-9 mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setScreen("collections")}
              className="group flex h-full min-h-[84px] items-center gap-4 rounded-2xl border border-edge-soft bg-elevated/40 px-6 py-4 text-start transition-all duration-300 hover:bg-elevated/70 active:scale-[0.99]"
            >
              <span className="relative grid h-12 w-16 shrink-0 place-items-center">
                <span className="absolute h-10 w-7 -translate-x-2.5 -rotate-[18deg] overflow-hidden rounded-[5px] bg-elevated shadow-[0_4px_10px_-4px_rgba(0,0,0,0.6)] ring-1 ring-edge-soft transition-transform duration-300 ease-out group-hover:-translate-x-4 group-hover:-rotate-[28deg]">
                  {collectionBooks[1]?.cover && (
                    <CoverImg src={collectionBooks[1].cover} alt="" className="h-full w-full object-cover" />
                  )}
                </span>
                <span className="absolute h-10 w-7 translate-x-2.5 rotate-[18deg] overflow-hidden rounded-[5px] bg-raised shadow-[0_4px_10px_-4px_rgba(0,0,0,0.6)] ring-1 ring-edge-soft transition-transform duration-300 ease-out group-hover:translate-x-4 group-hover:rotate-[28deg]">
                  {collectionBooks[2]?.cover && (
                    <CoverImg src={collectionBooks[2].cover} alt="" className="h-full w-full object-cover" />
                  )}
                </span>
                <span className="absolute h-10 w-7 overflow-hidden rounded-[5px] bg-gradient-to-br from-accent to-accent/60 shadow-[0_6px_14px_-4px_rgba(0,0,0,0.7)] ring-1 ring-white/10 transition-transform duration-300 ease-out group-hover:-translate-y-1">
                  {collectionBooks[0]?.cover && (
                    <CoverImg src={collectionBooks[0].cover} alt="" className="h-full w-full object-cover" />
                  )}
                </span>
              </span>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-[15.5px] font-semibold text-ink">Collections</span>
                <span className="truncate text-[13px] text-ink-muted">
                  Complete book series from metadata
                </span>
              </div>
              <ChevronRight
                size={22}
                className="shrink-0 text-ink-subtle transition-transform group-hover:translate-x-1"
              />
            </button>
          </div>
        )}
        <div className="mb-[-1rem] mt-1">
          <h2 className="text-[22px] font-medium tracking-tight text-ink">Browse eBooks</h2>
          <p className="text-[13px] text-ink-subtle">
            {providers.find((source) => source.id === providerId)?.name ?? "Installed sources"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="contents">
            <label className="flex h-12 min-w-0 max-w-sm flex-1 items-center gap-3 rounded-2xl border border-edge-soft bg-elevated/45 px-4 text-ink-muted focus-within:border-edge focus-within:bg-elevated/70">
              <Search size={18} />
              <input
                value={query}
                onChange={(event) => search(event.target.value)}
                placeholder="Search eBooks"
                className="min-w-0 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-subtle"
              />
            </label>
            <button
              type="button"
              aria-label="Refresh eBook source"
              title="Refresh source"
              disabled={refreshing}
              onClick={() => (query.trim().length >= 2 ? search(query) : loadSources())}
              className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-edge-soft bg-elevated/45 text-ink-muted transition-colors hover:border-edge hover:bg-elevated/70 hover:text-ink disabled:pointer-events-none disabled:opacity-60"
            >
              <RefreshCw
                size={17}
                className={refreshing ? "animate-spin motion-reduce:animate-none" : ""}
              />
            </button>
            <button
              type="button"
              onClick={() => setScreen("sources")}
              aria-label="Manage eBook sources"
              title="Manage eBook sources"
              className="order-3 me-2 flex items-center gap-2 rounded-lg border border-edge-soft bg-elevated/40 px-3 py-2 text-[13px] text-ink transition-colors hover:bg-elevated/70"
            >
              <Settings size={20} className="text-ink" />
            </button>
          </div>
          <div className="order-2">
            <EBookBrowseDropdown
              label="Language"
              value={titleLanguage}
              options={[
                { id: "auto", label: "Auto" },
                { id: "en", label: "English" },
                { id: "ar", label: "Arabic" },
                { id: "original", label: "Original" },
              ]}
              onSelect={(value) => setTitleLanguage(value as EBookTitleLanguage)}
            />
          </div>
          <div
            className="order-1 ms-auto flex w-fit max-w-full flex-wrap items-center gap-2 rounded-2xl bg-elevated/30 p-2 ring-1 ring-edge-soft/50"
            aria-label="Filter eBooks"
          >
            <EBookBrowseDropdown
              label="Type"
              value={categoryGroup}
              options={[
                { id: "Genre", label: "Genre" },
                { id: "Fiction", label: "Fiction" },
                { id: "Non-fiction", label: "Non-fiction" },
              ]}
              onSelect={(value) => {
                setCategoryGroup(value as EBookBrowseType);
                setBrowseAll(false);
                setCategory("");
                setQuery("");
                setResults(null);
              }}
            />
            <EBookBrowseDropdown
              label="Catalog"
              value={providerId}
              badge={providers.find((source) => source.id === providerId)?.name?.charAt(0)}
              options={providers.map((source) => ({ id: source.id, label: source.name }))}
              onSelect={(id) => {
                providerIdRef.current = id;
                setProviderId(id);
                setQuery("");
                setResults(null);
                loadSources(id);
              }}
            />
            <EBookBrowseDropdown
              label="Genre"
              value={category}
              options={[
                { id: "", label: "All genres" },
                ...Array.from(
                  new Set(
                    categoryGroup && categoryGroup !== "Genre"
                      ? EBOOK_CATEGORIES[categoryGroup]
                      : Object.values(EBOOK_CATEGORIES).flat(),
                  ),
                ).map((item) => ({ id: item, label: item })),
              ]}
              onSelect={(value) => {
                setBrowseAll(false);
                setCategory(value);
                setQuery("");
                setResults(null);
              }}
            />
            <button
              type="button"
              onClick={() => {
                setBrowseAll(true);
                setCategory("");
                setQuery("");
                setResults(null);
              }}
              className="flex h-10 items-center gap-2 rounded-full bg-ink px-5 text-[13.5px] font-semibold text-canvas transition-transform hover:scale-[1.02] active:scale-[0.97]"
            >
              Browse
            </button>
          </div>
        </div>
        {categoryGroup === "Genre" && !browseAll && query.trim().length < 2 ? (
          <div className="flex flex-col gap-9">
            {genreRails.map((rail) => (
              <EBookRail
                key={`genre:${rail.title}:${providerId}`}
                title={rail.title}
                subtitle={`${rail.items.length} ${rail.items.length === 1 ? "book" : "books"}`}
                items={rail.items}
                onOpen={(ebook) => openEBook(String(ebook.id))}
              />
            ))}
            {sourceItems !== null && genreRails.length === 0 && (
              <p className="py-10 text-center text-[14px] text-ink-muted">
                No genre metadata is available from this catalog.
              </p>
            )}
          </div>
        ) : (
          <EBookGrid
            items={query.trim().length >= 2 ? results : catalog}
            loadingMore={loadingMore}
            hasMore={hasMore}
            onEndReached={loadMore}
            onOpen={(ebook) => openEBook(String(ebook.id))}
          />
        )}
      </div>
    </main>
    </EBookTitleLanguageContext.Provider>
  );
}

function EBookBrowseDropdown({
  label,
  value,
  options,
  badge,
  onSelect,
}: {
  label: string;
  value: string;
  options: Array<{ id: string; label: string }>;
  badge?: string;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = options.find((option) => option.id === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex h-10 items-center gap-2 rounded-full border border-edge-soft bg-canvas/50 ps-3 pe-3.5 text-start transition-colors hover:border-edge hover:bg-canvas/70"
      >
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-ink-subtle">
          {label}
        </span>
        {badge && (
          <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] bg-elevated text-[10px] font-bold text-ink-subtle ring-1 ring-edge-soft">
            {badge.toLocaleUpperCase()}
          </span>
        )}
        <span className="max-w-[180px] truncate text-[13.5px] font-medium text-ink">
          {active?.label ?? "None"}
        </span>
        <ChevronDown
          size={14}
          className={`text-ink-muted transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="absolute start-0 z-40 mt-2 max-h-72 min-w-full overflow-y-auto rounded-xl border border-edge-soft bg-raised p-1.5 shadow-[0_18px_44px_-14px_rgba(0,0,0,0.75)]">
          {options.map((option) => (
            <button
              key={option.id || "all"}
              type="button"
              onClick={() => {
                onSelect(option.id);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-start text-[13px] transition-colors hover:bg-elevated ${
                option.id === value ? "text-ink" : "text-ink-muted"
              }`}
            >
              <span className="w-4">{option.id === value && <Check size={14} />}</span>
              <span className="whitespace-nowrap">{option.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

type FeaturedShelfItem =
  | { kind: "spine"; book: EBook; lean: "upright" | "left" | "right"; height: number }
  | { kind: "stack"; books: EBook[] };

const SHELF_STACKS = [
  new Map([
    [5, 2],
    [13, 1],
  ]),
  new Map([
    [2, 5],
    [15, 4],
  ]),
  new Map([
    [7, 1],
    [16, 2],
  ]),
];
const SHELF_LEANS_RIGHT = [new Set([1, 8, 16]), new Set([8, 12]), new Set([1, 10])];
const SHELF_LEANS_LEFT = [new Set([3, 10, 18]), new Set([10, 14]), new Set([3, 12])];

function arrangeFeaturedShelf(books: EBook[], shelfIndex: number): FeaturedShelfItem[] {
  const items: FeaturedShelfItem[] = [];
  const stacks = SHELF_STACKS[shelfIndex] ?? new Map<number, number>();
  const leansRight = SHELF_LEANS_RIGHT[shelfIndex] ?? new Set<number>();
  const leansLeft = SHELF_LEANS_LEFT[shelfIndex] ?? new Set<number>();
  for (let bookIndex = 0; bookIndex < books.length; bookIndex += 1) {
    const stackSize = Math.min(stacks.get(bookIndex) ?? 0, books.length - bookIndex);
    if (stackSize > 0) {
      items.push({ kind: "stack", books: books.slice(bookIndex, bookIndex + stackSize) });
      bookIndex += stackSize - 1;
      continue;
    }
    items.push({
      kind: "spine",
      book: books[bookIndex],
      lean: leansRight.has(bookIndex) ? "right" : leansLeft.has(bookIndex) ? "left" : "upright",
      height: [82, 96, 88, 76, 92, 84][bookIndex % 6],
    });
  }
  return items;
}

const EBOOK_HERO_ROTATE_MS = 9000;

function EBookLibraryHero({
  ebooks,
  shelfBooks,
  onOpen,
}: {
  ebooks: EBook[];
  shelfBooks: EBook[];
  onOpen: (ebook: EBook) => void;
}) {
  const titleLanguage = useContext(EBookTitleLanguageContext);
  const [active, setActive] = useState(0);
  const [shown, setShown] = useState(0);
  const [visible, setVisible] = useState(true);
  const [paused, setPaused] = useState(false);
  const pageVisible = usePageVisible();
  const current = ebooks[shown];
  const currentTitle = current
    ? ebookTitleForLanguage(current, titleLanguage)
    : "A remarkable book for your shelf";
  const artColor = useArtGlow(current?.cover);
  const shelves = [0, 1, 2].map((shelfIndex) =>
    shelfBooks.filter((_, bookIndex) => bookIndex % 3 === shelfIndex).slice(0, 20),
  );
  const arrangedShelves = shelves.map(arrangeFeaturedShelf);

  useEffect(() => {
    if (paused || ebooks.length < 2 || !pageVisible) return;
    const id = window.setInterval(
      () => setActive((index) => (index + 1) % ebooks.length),
      EBOOK_HERO_ROTATE_MS,
    );
    return () => window.clearInterval(id);
  }, [paused, ebooks.length, pageVisible]);

  useEffect(() => {
    if (active >= ebooks.length) setActive(0);
  }, [ebooks.length, active]);

  useEffect(() => {
    if (active === shown) return;
    setVisible(false);
    const timer = window.setTimeout(() => {
      setShown(active);
      setVisible(true);
    }, 280);
    return () => window.clearTimeout(timer);
  }, [active, shown]);

  const fade: CSSProperties = {
    transition:
      "opacity 420ms cubic-bezier(0.22,1,0.36,1), transform 420ms cubic-bezier(0.22,1,0.36,1)",
    opacity: visible ? 1 : 0,
    transform: visible ? "translateY(0)" : "translateY(14px)",
  };

  return (
    <section
      className="group ebook-library-hero"
      style={{ "--ebook-hero-accent": artColor ?? "205 116 50" } as CSSProperties}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="ebook-hero-shelves" aria-hidden="true">
        {arrangedShelves.map((shelf, shelfIndex) => (
          <div className="ebook-hero-shelf" key={shelfIndex}>
            <div className="ebook-hero-books">
              {shelf.map((item) =>
                item.kind === "stack" ? (
                  <div className="ebook-hero-shelf-stack" key={`stack:${item.books[0].id}`}>
                    {item.books.map((book, stackIndex) => (
                      <div
                        className="ebook-hero-horizontal-book"
                        key={book.id}
                        style={{ "--horizontal-book-step": stackIndex } as CSSProperties}
                      >
                        <img src={book.cover} alt="" draggable={false} decoding="async" />
                        <span>{ebookTitleForLanguage(book, titleLanguage)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div
                    className={`ebook-hero-shelf-book ebook-hero-shelf-book--${item.lean}`}
                    key={item.book.id}
                    style={{ "--shelf-book-height": `${item.height}%` } as CSSProperties}
                  >
                    <img
                      className="ebook-hero-spine-art"
                      src={item.book.cover}
                      alt=""
                      draggable={false}
                      decoding="async"
                    />
                    <span className="ebook-hero-spine-title">
                      {ebookTitleForLanguage(item.book, titleLanguage)}
                    </span>
                  </div>
                ),
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="ebook-hero-paper">
        <svg
          className="ebook-hero-paper-shape"
          viewBox="0 0 1120 520"
          preserveAspectRatio="none"
          aria-hidden="true"
          focusable="false"
        >
          <defs>
            <radialGradient id="ebookHeroPaperWash" cx="18%" cy="14%" r="58%">
              <stop offset="0%" stopColor={`rgb(${artColor ?? "205 116 50"})`} stopOpacity="0.1" />
              <stop offset="72%" stopColor="#f2eddf" stopOpacity="0" />
            </radialGradient>
          </defs>
          <path
            className="ebook-hero-paper-fill"
            d="M0 0H790C930 0 1005 54 984 118C965 176 858 160 852 216C846 269 975 268 996 332C1018 399 933 467 806 520H0Z"
          />
          <path
            className="ebook-hero-paper-wash"
            d="M0 0H790C930 0 1005 54 984 118C965 176 858 160 852 216C846 269 975 268 996 332C1018 399 933 467 806 520H0Z"
          />
        </svg>

        <div className="ebook-hero-copy" style={fade}>
          <span className="ebook-hero-kicker">Featured books · Metadata picks</span>
          <h1>{currentTitle}</h1>
          <p>
            {current?.description ||
              "A living shelf for new worlds, beloved stories, and the books you have yet to meet."}
          </p>
          <div className="ebook-hero-meta">
            {current?.year && <span>{current.year}</span>}
            {current?.genres.slice(0, 2).map((genre) => <span key={genre}>{genre}</span>)}
          </div>
          {current && (
            <button type="button" onClick={() => onOpen(current)}>
              <BookOpen size={17} /> Open featured book
            </button>
          )}
        </div>

        <div className="ebook-hero-showcase" aria-hidden="true" style={fade}>
          <div className="ebook-hero-book-shadow" />
          <div className="ebook-hero-book-object">
            <div className="ebook-hero-book-pages" />
            <Poster
              src={current?.cover}
              seed={`ebook-hero:${current?.id ?? "loading"}`}
              ratio="portrait"
              className="ebook-hero-book-cover"
            />
          </div>
          <span className="ebook-hero-edition">Featured pick</span>
        </div>
      </div>

      {ebooks.length > 1 && (
        <>
          <NavArrow
            dir="left"
            onClick={() => setActive((index) => (index - 1 + ebooks.length) % ebooks.length)}
            label="Previous featured book"
            size={38}
            className="absolute start-2 top-1/2 z-20 h-14 w-14 -translate-y-1/2 opacity-25 group-hover:opacity-100"
          />
          <NavArrow
            dir="right"
            onClick={() => setActive((index) => (index + 1) % ebooks.length)}
            label="Next featured book"
            size={38}
            className="absolute end-2 top-1/2 z-20 h-14 w-14 -translate-y-1/2 opacity-25 group-hover:opacity-100"
          />
          <div className="ebook-hero-stepper">
            {ebooks.map((ebook, index) => (
              <button
                key={ebook.id}
                type="button"
                onClick={() => setActive(index)}
                aria-label={`Show featured book ${index + 1}: ${ebook.title}`}
                aria-current={index === active ? "true" : undefined}
                className={index === active ? "is-active" : ""}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function EBookDetailDropdown({
  options,
  selected,
  onSelect,
}: {
  options: Array<{ id: string; label: string }>;
  selected: string;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = options.find((option) => option.id === selected) ?? options[0];
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-11 items-center gap-2 rounded-xl border border-edge-soft bg-surface/60 px-4 text-[14px] text-ink transition-colors hover:border-edge hover:bg-elevated/60"
      >
        <span>{active?.label}</span>
        <ChevronDown
          size={16}
          className={`text-ink-subtle transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 max-h-80 min-w-56 overflow-y-auto rounded-xl border border-edge-soft bg-elevated py-1.5 shadow-[0_18px_44px_rgba(0,0,0,0.45)]">
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => {
                onSelect(option.id);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2 px-4 py-2.5 text-left text-[14px] transition-colors hover:bg-raised ${
                option.id === selected ? "text-ink" : "text-ink-muted"
              }`}
            >
              {option.id === selected ? (
                <Check size={15} className="text-accent" />
              ) : (
                <span className="w-[15px]" />
              )}
              <span className="truncate">{option.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function EBookRail({
  title,
  subtitle,
  items,
  onOpen,
  onEndReached,
  loadingMore,
  hideEmpty,
}: Rail & { onOpen: (ebook: EBook) => void }) {
  if (items?.length === 0)
    return hideEmpty ? null : <p className="text-[14px] text-ink-muted">No eBooks found.</p>;
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-[20px] font-semibold tracking-tight text-ink">{title}</h2>
        <p className="text-[13px] text-ink-subtle">{subtitle}</p>
      </div>
      <Row
        min={144}
        shape="portrait"
        scrollKey={`ebook:${title}`}
        onEndReached={onEndReached}
      >
        {items === null
          ? Array.from({ length: 8 }, (_, index) => (
              <div
                key={index}
                className="aspect-[2/3] animate-pulse rounded-xl bg-elevated/60 motion-reduce:animate-none"
              />
            ))
          : items.map((ebook) => <EBookCard key={ebook.id} ebook={ebook} onOpen={onOpen} />)}
      </Row>
      {loadingMore && <Loader2 size={18} className="animate-spin text-ink-subtle" />}
    </section>
  );
}

function EBookGrid({
  items,
  loadingMore,
  hasMore,
  onEndReached,
  onOpen,
}: {
  items: EBook[] | null;
  loadingMore: boolean;
  hasMore: boolean;
  onEndReached: () => void;
  onOpen: (ebook: EBook) => void;
}) {
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = sentinel.current;
    if (!element || !hasMore) return;
    const observer = new IntersectionObserver(
      ([entry]) => entry?.isIntersecting && onEndReached(),
      { rootMargin: "800px 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [hasMore, onEndReached]);

  if (items?.length === 0)
    return <p className="py-10 text-center text-[14px] text-ink-muted">No eBooks found.</p>;
  return (
    <section>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-4 gap-y-7">
        {items === null
          ? Array.from({ length: 12 }, (_, index) => (
              <div
                key={index}
                className="aspect-[2/3] animate-pulse rounded-xl bg-elevated/60 motion-reduce:animate-none"
              />
            ))
          : items.map((ebook) => <EBookCard key={ebook.id} ebook={ebook} onOpen={onOpen} />)}
      </div>
      <div ref={sentinel} className="h-4" />
      {loadingMore && (
        <div className="flex justify-center py-6">
          <Loader2 size={22} className="animate-spin text-ink-subtle motion-reduce:animate-none" />
        </div>
      )}
      {!hasMore && items && items.length > 0 && (
        <p className="py-6 text-center text-[12.5px] text-ink-subtle">
          That is everything from this source.
        </p>
      )}
    </section>
  );
}

function EBookBookStage({
  ebook,
  rearColor,
}: {
  ebook: EBook;
  rearColor: string | null;
}) {
  return (
    <div
      className="bk-book-stage"
      aria-hidden="true"
      style={{ "--bk-poster-color": rearColor ?? "85 72 59" } as CSSProperties}
    >
      <div className="bk-book">
        <div className="bk-front">
          <div className="bk-cover">
            <Poster
              src={ebook.cover}
              seed={`ebook:${ebook.id}`}
              ratio="portrait"
              lazy
              className="bk-cover-art harbor-card-ring"
            />
            {!ebook.cover && (
              <h2 className="bk-cover-title">
                <span>{ebook.authors[0] || "Bear eBooks"}</span>
                <span>{ebook.title}</span>
              </h2>
            )}
          </div>
          <div className="bk-cover-back">
            {(ebook.internalCover || ebook.cover) && (
              <img
                src={ebook.internalCover || ebook.cover}
                alt=""
                className="bk-internal-cover"
                loading="lazy"
              />
            )}
          </div>
        </div>
        <div className="bk-page">
          <div className="bk-content bk-content-current" />
          <div className="bk-content">
            <div className="bk-story-page">
              <strong>{ebook.title}</strong>
              <p>{ebook.description || "No story summary is available."}</p>
            </div>
          </div>
          <div className="bk-content">
            <div className="bk-left-page-meta">
              <strong>{ebook.genres.slice(0, 3).join(" · ") || "eBook"}</strong>
              {ebook.score != null && (
                <span>★ {(ebook.score > 10 ? ebook.score / 10 : ebook.score).toFixed(1)}</span>
              )}
            </div>
          </div>
          <div className="bk-content" />
          <div className="bk-content" />
        </div>
        <div className="bk-back">
          <span>{ebook.title}</span>
          <small>{ebook.authors[0] || "Bear eBooks"}</small>
        </div>
        <div className="bk-left">
          <h2>
            <span>{ebook.authors[0] || "Bear"}</span>
            <span>{ebook.title}</span>
          </h2>
        </div>
        <div className="bk-top" />
        <div className="bk-bottom" />
      </div>
    </div>
  );
}

function EBookCard({ ebook, onOpen }: { ebook: EBook; onOpen: (ebook: EBook) => void }) {
  const rearColor = useArtGlow(ebook.cover);
  const titleLanguage = useContext(EBookTitleLanguageContext);
  const displayTitle = ebookTitleForLanguage(ebook, titleLanguage);
  const displayEbook = displayTitle === ebook.title ? ebook : { ...ebook, title: displayTitle };
  const cardRef = useRef<HTMLButtonElement>(null);

  const alignEdgeBook = useCallback(() => {
    const card = cardRef.current;
    const stage = card?.querySelector<HTMLElement>(".bk-book-stage");
    const rail = card?.closest<HTMLElement>(".harbor-row-track");
    if (!stage || !rail) return;

    const bookRect = stage.getBoundingClientRect();
    const railRect = rail.getBoundingClientRect();
    const neededRoom = bookRect.width * 0.82;
    const leftRoom = bookRect.left - railRect.left;
    let shift = 0;

    if (leftRoom < neededRoom) {
      shift = Math.min(bookRect.width * 0.65, neededRoom - leftRoom);
    }

    stage.style.setProperty("--bk-edge-shift", `${shift}px`);
  }, []);

  const resetEdgeBook = useCallback(() => {
    cardRef.current
      ?.querySelector<HTMLElement>(".bk-book-stage")
      ?.style.removeProperty("--bk-edge-shift");
  }, []);

  return (
    <button
      ref={cardRef}
      type="button"
      onClick={() => onOpen(ebook)}
      onPointerEnter={alignEdgeBook}
      onPointerLeave={resetEdgeBook}
      onFocus={alignEdgeBook}
      onBlur={resetEdgeBook}
      className="group relative z-0 flex w-full min-w-0 flex-col gap-2 text-start hover:z-20 focus-visible:z-20"
    >
      <EBookBookStage ebook={displayEbook} rearColor={rearColor} />
      <p className="line-clamp-2 min-h-9 text-[13px] font-medium leading-snug text-ink">
        {displayTitle}
      </p>
      <p className="text-[11.5px] text-ink-subtle">
        {[
          ebook.books?.length ? `${ebook.books.length} books` : null,
          ebook.books ? `${new Set(ebook.books.map((book) => book.source)).size} sources` : null,
          ebook.year,
          ebook.volumes ? `${ebook.volumes} vols` : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
    </button>
  );
}

function EBookChapterSection({
  chapters,
  loading,
  volumeGroups,
  selectedVolume,
  onSelectVolume,
  sourceOptions,
  sourceRoute,
  onSelectSource,
  onRead,
}: {
  chapters: EBookChapter[] | null;
  loading: boolean;
  volumeGroups: EBookVolumeGroup[];
  selectedVolume: string | null;
  onSelectVolume: (volume: string) => void;
  sourceOptions: EBook[];
  sourceRoute: string | null;
  onSelectSource: (route: string) => void;
  onRead: (chapter: EBookChapter) => void;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest">("oldest");
  const [pagination, setPagination] = useState({ key: "", count: 30 });
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<"grid" | "list">(() =>
    typeof localStorage !== "undefined" &&
    localStorage.getItem("harbor.ebook.chapterview") === "list"
      ? "list"
      : "grid",
  );
  useEffect(() => localStorage.setItem("harbor.ebook.chapterview", view), [view]);
  const hasVolumes = volumeGroups.some((group) => group.volume);
  const selected = hasVolumes
    ? (volumeGroups.find((group) => group.volume === selectedVolume)?.chapters ?? [])
    : (volumeGroups[0]?.chapters ?? []);
  const ordered = useMemo(() => {
    const term = query.trim().toLowerCase();
    const positioned = selected.length > 0 && selected.every((chapter) => chapter.position != null);
    const positionedNumbers = selected
      .map((chapter) => ({
        position: chapter.position,
        number: labelNumber(chapter.chapter ?? ""),
      }))
      .filter(
        (chapter): chapter is { position: number; number: number } =>
          chapter.position != null && chapter.number != null,
      )
      .sort((left, right) => left.position - right.position);
    const positionDirection =
      positionedNumbers.reduce(
        (direction, chapter, index) =>
          index ? direction + Math.sign(chapter.number - positionedNumbers[index - 1].number) : 0,
        0,
      ) < 0
        ? -1
        : 1;
    const items = selected
      .map((chapter, index) => ({ chapter, index }))
      .filter(
        ({ chapter }) =>
          !term ||
          chapter.title.toLowerCase().includes(term) ||
          chapter.chapter?.toLowerCase().includes(term),
      );
    items.sort((a, b) => {
      if (positioned)
        return (a.chapter.position! - b.chapter.position!) * positionDirection || a.index - b.index;
      const left = a.chapter.chapter ? labelNumber(a.chapter.chapter) : undefined;
      const right = b.chapter.chapter ? labelNumber(b.chapter.chapter) : undefined;
      if (left !== undefined && right !== undefined) return left - right || a.index - b.index;
      if (left !== undefined) return -1;
      if (right !== undefined) return 1;
      return (
        a.chapter.title.localeCompare(b.chapter.title, undefined, { numeric: true }) ||
        a.index - b.index
      );
    });
    return (sort === "newest" ? items.reverse() : items).map(({ chapter }) => chapter);
  }, [query, selected, sort]);
  const pageKey = `${sourceRoute}\0${selectedVolume}\0${sort}\0${view}\0${query}`;
  const visibleCount = pagination.key === pageKey ? pagination.count : 30;
  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node || visibleCount >= ordered.length) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting)
          setPagination((page) => ({
            key: pageKey,
            count: Math.min((page.key === pageKey ? page.count : 30) + 30, ordered.length),
          }));
      },
      { rootMargin: "400px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [ordered.length, pageKey, visibleCount]);
  const rendered = ordered.slice(0, visibleCount);

  if (loading || chapters === null)
    return (
      <section className="flex flex-col gap-6">
        <h2 className="text-[22px] font-medium tracking-tight text-ink">Chapters</h2>
        <div className="rounded-2xl border border-edge-soft bg-surface/40 px-6 py-14 text-center">
          <p className="flex items-center justify-center gap-2 text-[15px] text-ink-muted">
            <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> Loading
            chapters...
          </p>
        </div>
      </section>
    );

  if (!chapters.length)
    return (
      <section className="flex flex-col gap-6">
        <h2 className="text-[22px] font-medium tracking-tight text-ink">Chapters</h2>
        <div className="rounded-2xl border border-edge-soft bg-surface/40 px-6 py-14 text-center text-[15px] text-ink-muted">
          This source returned no chapters for this title.
        </div>
      </section>
    );

  const volumePicker = hasVolumes && (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline gap-3">
        <h2 className="text-[22px] font-medium tracking-tight text-ink">Volumes</h2>
        <span className="text-[15px] text-ink-subtle">
          {volumeGroups.filter((group) => group.volume).length}
        </span>
      </div>
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}
      >
        {volumeGroups.map((group) => (
          <button
            key={group.volume}
            type="button"
            aria-pressed={selectedVolume === group.volume}
            onClick={() => onSelectVolume(group.volume)}
            className={`group flex min-h-[68px] items-center gap-3 rounded-xl border px-4 py-3 text-start transition-colors ${
              selectedVolume === group.volume
                ? "border-accent/70 bg-accent/5"
                : "border-edge-soft bg-surface/60 hover:border-edge hover:bg-elevated/60"
            }`}
          >
            <BookOpen
              size={18}
              className={selectedVolume === group.volume ? "text-accent" : "text-ink-subtle"}
            />
            <span className="min-w-0">
              <span className="block truncate text-[14px] font-semibold text-ink">
                {group.volume ? group.label : "Other"}
              </span>
              <span className="block text-[12px] text-ink-subtle">
                {group.chapters.length} chapters
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );

  if (hasVolumes && selectedVolume === null)
    return (
      <section className="flex flex-col gap-5">
        {volumePicker}
        <div className="rounded-2xl border border-edge-soft bg-surface/40 px-6 py-14 text-center text-[15px] text-ink-muted">
          Select a volume to see its chapters.
        </div>
      </section>
    );

  return (
    <section className="flex flex-col gap-5">
      {volumePicker}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-baseline gap-3">
          <h2 className="text-[22px] font-medium tracking-tight text-ink">Chapters</h2>
          <span className="text-[15px] text-ink-subtle">{selected.length}</span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-11 items-center gap-1 rounded-xl border border-edge-soft bg-surface/60 p-1">
            {(
              [
                ["list", List],
                ["grid", LayoutGrid],
              ] as const
            ).map(([value, Icon]) => (
              <button
                key={value}
                type="button"
                aria-label={`${value} view`}
                onClick={() => setView(value)}
                className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
                  view === value ? "bg-elevated text-ink" : "text-ink-subtle hover:text-ink"
                }`}
              >
                <Icon size={18} />
              </button>
            ))}
          </div>
          <div className="flex h-11 items-center gap-1 rounded-xl border border-edge-soft bg-surface/60 p-1">
            {(["newest", "oldest"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setSort(value)}
                className={`h-9 rounded-lg px-4 text-[13px] font-medium capitalize transition-colors ${
                  sort === value ? "bg-elevated text-ink" : "text-ink-muted hover:text-ink"
                }`}
              >
                {value}
              </button>
            ))}
          </div>
          {sourceOptions.length > 1 && sourceRoute && (
            <EBookDetailDropdown
              options={sourceOptions.map((source) => ({
                id: source.id,
                label: source.providerName ?? source.title,
              }))}
              selected={sourceRoute}
              onSelect={onSelectSource}
            />
          )}
        </div>
      </div>

      <div className="relative">
        <Search
          size={18}
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-subtle"
        />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search chapters..."
          className="h-11 w-full rounded-xl border border-edge-soft bg-surface/60 pl-11 pr-4 text-[14px] text-ink transition-colors placeholder:text-ink-subtle focus:border-edge focus:outline-none"
        />
      </div>

      {ordered.length === 0 ? (
        <div className="rounded-2xl border border-edge-soft bg-surface/40 px-6 py-14 text-center text-[15px] text-ink-muted">
          No chapters match your search.
        </div>
      ) : view === "list" ? (
        <div className="overflow-hidden rounded-2xl border border-edge-soft bg-surface/40">
          {rendered.map((chapter) => (
            <button
              key={chapter.id}
              type="button"
              onClick={() => onRead(chapter)}
              className="group flex min-h-[64px] w-full items-center justify-between gap-4 border-b border-edge-soft/60 px-5 py-3.5 text-start transition-colors last:border-b-0 hover:bg-elevated/40"
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                {chapter.chapter && (
                  <span className="text-[12px] text-ink-subtle">Ch. {chapter.chapter}</span>
                )}
                <span className="truncate text-[16px] font-semibold text-ink">{chapter.title}</span>
              </div>
              <div className="flex shrink-0 items-center gap-2.5">
                <EBookChapterMeta chapter={chapter} />
                <BookOpen
                  size={18}
                  className="shrink-0 text-ink-subtle transition-colors group-hover:text-accent"
                />
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}
        >
          {rendered.map((chapter) => (
            <button
              key={chapter.id}
              type="button"
              onClick={() => onRead(chapter)}
              className="group flex min-h-[64px] flex-col justify-between gap-2 rounded-xl border border-edge-soft bg-surface/60 px-4 py-3.5 text-start transition-colors hover:border-edge hover:bg-elevated/60"
            >
              <div className="flex flex-col gap-0.5">
                {chapter.chapter && (
                  <span className="text-[12px] text-ink-subtle">Ch. {chapter.chapter}</span>
                )}
                <span className="line-clamp-1 text-[15px] font-semibold text-ink">
                  {chapter.title}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <EBookChapterMeta chapter={chapter} />
                <BookOpen
                  size={16}
                  className="shrink-0 text-ink-subtle transition-colors group-hover:text-accent"
                />
              </div>
            </button>
          ))}
        </div>
      )}
      {visibleCount < ordered.length && (
        <div
          ref={loadMoreRef}
          className="flex h-12 items-center justify-center gap-2 text-[13px] text-ink-subtle"
        >
          <Loader2 size={15} className="animate-spin motion-reduce:animate-none" /> Loading more
          chapters...
        </div>
      )}
    </section>
  );
}

function EBookChapterMeta({ chapter }: { chapter: EBookChapter }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-[12.5px] text-ink-subtle">
      {chapter.publishAt && <span className="shrink-0">{chapter.publishAt}</span>}
      {chapter.publishAt && chapter.views !== undefined && <span aria-hidden>·</span>}
      {chapter.views !== undefined && (
        <span className="shrink-0">
          {typeof chapter.views === "number" ? chapter.views.toLocaleString() : chapter.views} views
        </span>
      )}
    </span>
  );
}

function EBookDetails({
  ebook,
  onBack,
  onOpen,
}: {
  ebook: EBook | null;
  onBack: () => void;
  onOpen: (ebook: EBook) => void;
}) {
  const [saved, setSaved] = useState(() => (ebook ? ebookInLibrary(ebook.id) : false));
  const [favorite, setFavorite] = useState(() => (ebook ? ebookIsFavorite(ebook.id) : false));
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [descriptionClipped, setDescriptionClipped] = useState(false);
  const descriptionRef = useRef<HTMLParagraphElement>(null);
  const [recommendations, setRecommendations] = useState<EBook[] | null>(null);
  const [chapters, setChapters] = useState<EBookChapter[] | null>(null);
  const [sourceOptions, setSourceOptions] = useState<EBook[]>([]);
  const [sourceRoute, setSourceRoute] = useState<string | null>(null);
  const [selectedVolume, setSelectedVolume] = useState<string | null>(null);
  const [resolvingSource, setResolvingSource] = useState(false);
  const [reading, setReading] = useState<{
    chapter: EBookChapter;
    content: EBookChapterContent | null;
    error?: string;
  } | null>(null);
  const ebookId = ebook?.id;
  const sourceKey = (ebook?.books ?? (ebook ? [ebook] : []))
    .filter((book) => book.source === "source")
    .map((book) => book.id)
    .join("\0");
  const genreKey = ebook?.genres.join("\0");
  useEffect(() => setSaved(ebookId ? ebookInLibrary(ebookId) : false), [ebookId]);
  useEffect(() => setFavorite(ebookId ? ebookIsFavorite(ebookId) : false), [ebookId]);
  useEffect(() => {
    setDescriptionExpanded(false);
    setDescriptionClipped(false);
  }, [ebookId]);
  useEffect(() => {
    const element = descriptionRef.current;
    if (!element || descriptionExpanded) return;
    const measure = () => setDescriptionClipped(element.scrollHeight > element.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [descriptionExpanded, ebook?.description, ebookId]);
  useEffect(() => {
    if (!ebook) return;
    setRecommendations(null);
    void recommendedEBooks(ebook)
      .then(setRecommendations)
      .catch(() => setRecommendations([]));
  }, [ebookId, ebook?.anilistId, genreKey]);
  useEffect(() => {
    setReading(null);
    if (!ebook) return;
    if (ebook.source === "source") {
      const options = (ebook.books ?? [ebook]).filter((book) => book.source === "source");
      setSourceOptions(options);
      setSourceRoute(options[0]?.id ?? ebook.id);
      setResolvingSource(false);
      return;
    }
    let active = true;
    setSourceOptions([]);
    setSourceRoute(null);
    setResolvingSource(true);
    const key = (value: string) =>
      value
        .normalize("NFKD")
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .trim();
    void loadSourceEBookPage(ebook.title)
      .then(({ items }) => {
        if (!active) return;
        const matches = items.filter((item) => key(item.title) === key(ebook.title));
        setSourceOptions(matches);
        setSourceRoute(matches[0]?.id ?? null);
      })
      .catch(() => {})
      .finally(() => active && setResolvingSource(false));
    return () => {
      active = false;
    };
  }, [ebookId, ebook?.source, ebook?.title, sourceKey]);
  useEffect(() => {
    let active = true;
    if (!sourceRoute) {
      setSelectedVolume(null);
      setChapters(null);
      return;
    }
    setSelectedVolume(null);
    setChapters(null);
    void sourceEBookChapters(sourceRoute)
      .then((items) => active && setChapters(items))
      .catch(() => active && setChapters([]));
    return () => {
      active = false;
    };
  }, [sourceRoute]);
  const volumeGroups = useMemo(() => {
    const groups = new Map<string, { title?: string; chapters: EBookChapter[] }>();
    for (const chapter of chapters ?? []) {
      const volume = chapter.volume?.trim() ?? "";
      const group = groups.get(volume) ?? { chapters: [] };
      groups.set(volume, {
        title: group.title ?? (chapter.volumeTitle?.trim() || undefined),
        chapters: [...group.chapters, chapter],
      });
    }
    return [...groups]
      .map(([volume, group]) => {
        const number = labelNumber(volume);
        const base = number === undefined ? volume || "Chapters" : `Volume ${number}`;
        return {
          volume,
          label: group.title || base,
          number,
          chapters: group.chapters,
        };
      })
      .sort((left, right) => {
        if (!left.volume) return 1;
        if (!right.volume) return -1;
        if (left.number !== undefined && right.number !== undefined)
          return left.number - right.number;
        return left.volume.localeCompare(right.volume, undefined, {
          numeric: true,
          sensitivity: "base",
        });
      });
  }, [chapters]);
  useEffect(() => {
    if (selectedVolume !== null && !volumeGroups.some((group) => group.volume === selectedVolume))
      setSelectedVolume(null);
  }, [selectedVolume, volumeGroups]);
  if (!ebook)
    return (
      <div className="flex flex-1 items-center justify-center text-ink-muted">Loading eBook…</div>
    );
  const facts = [
    ebook.year,
    ebook.status,
    ebook.volumes ? `${ebook.volumes} volumes` : null,
    ebook.chapters ? `${ebook.chapters} chapters` : null,
  ].filter(Boolean);
  const readChapter = (chapter: EBookChapter) => {
    if (!sourceRoute) return;
    setReading({ chapter, content: null });
    void sourceEBookContent(sourceRoute, chapter.id, chapter.title)
      .then((content) =>
        setReading((current) =>
          current?.chapter.id === chapter.id ? { chapter, content } : current,
        ),
      )
      .catch(() =>
        setReading((current) =>
          current?.chapter.id === chapter.id
            ? { chapter, content: {}, error: "This chapter could not be loaded." }
            : current,
        ),
      );
  };
  return (
    <main className="relative flex-1 overflow-y-auto overflow-x-hidden px-12 pb-20 pt-24">
      <div className="flex flex-col gap-10 pb-4">
        <div className="relative -mx-12 -mt-24 min-h-[360px] overflow-hidden">
          <div className="absolute inset-0 z-0">
            {(ebook.banner || ebook.cover) && (
              <img
                src={ebook.banner || ebook.cover}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
                style={
                  ebook.banner
                    ? { objectPosition: "50% 22%" }
                    : { filter: "blur(28px)", transform: "scale(1.18)", objectPosition: "50% 25%" }
                }
              />
            )}
            <div
              aria-hidden
              className="absolute inset-0 bg-gradient-to-r from-[var(--color-canvas)] from-0% via-[color-mix(in_oklch,var(--color-canvas),transparent_45%)] via-55% to-[color-mix(in_oklch,var(--color-canvas),transparent_88%)] to-100%"
            />
            <div
              aria-hidden
              className="absolute inset-x-0 bottom-0 h-[70%]"
              style={{
                background:
                  "linear-gradient(to top, var(--color-canvas), color-mix(in oklch, var(--color-canvas), transparent 55%) 45%, transparent)",
              }}
            />
          </div>
          <div className="relative z-10 px-12 pt-24 pb-8">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1.5 rounded-full border border-edge-soft bg-canvas/40 px-4 py-2 text-[14px] text-ink-muted backdrop-blur-sm transition-colors hover:bg-elevated hover:text-ink"
            >
              <ChevronLeft size={18} /> Back
            </button>
            <div className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-end">
              <div className="w-52 shrink-0 sm:self-start">
                <Poster
                  src={ebook.cover}
                  seed={`ebook:${ebook.id}`}
                  ratio="portrait"
                  className="rounded-2xl shadow-xl ring-1 ring-edge"
                />
              </div>
              <div className="flex min-w-0 flex-1 flex-col items-start gap-4">
                <div className="flex flex-col gap-1.5">
                  <h1
                    className="text-[40px] font-medium leading-[1.05] tracking-tight text-ink drop-shadow-[0_2px_18px_rgba(0,0,0,0.5)]"
                    style={{ fontFamily: '"QR Ames Beta", var(--font-display), serif' }}
                  >
                    {ebook.title}
                  </h1>
                  {ebook.altTitle && ebook.altTitle !== ebook.title && (
                    <p className="text-[16px] text-ink-muted">{ebook.altTitle}</p>
                  )}
                  {ebook.authors.length > 0 && (
                    <p className="text-[14px] text-ink-muted">by {ebook.authors.join(", ")}</p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {facts.map((fact) => (
                    <span
                      key={String(fact)}
                      className="rounded-full bg-elevated/60 px-3 py-1 text-[13px] capitalize text-ink-muted ring-1 ring-edge-soft backdrop-blur-sm"
                    >
                      {fact}
                    </span>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  {ebook.genres.map((genre) => (
                    <span
                      key={genre}
                      className="rounded-full bg-elevated/60 px-3 py-1 text-[12px] text-ink-muted ring-1 ring-edge-soft backdrop-blur-sm"
                    >
                      {genre}
                    </span>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      const next = toggleEBookLibrary(ebook);
                      setSaved(next);
                    }}
                    className="inline-flex h-12 items-center gap-2 rounded-xl bg-accent px-6 text-[15px] font-bold text-canvas transition-transform hover:scale-[1.02] active:scale-[0.97]"
                  >
                    {saved ? <Library size={19} /> : <Bookmark size={19} />}
                    {saved ? "Bookmarked" : "Bookmark"}
                  </button>
                  <button
                    type="button"
                    aria-pressed={favorite}
                    aria-label={favorite ? "Remove favorite" : "Add favorite"}
                    onClick={() => setFavorite(toggleEBookFavorite(ebook))}
                    className={`flex h-12 w-12 items-center justify-center rounded-xl border backdrop-blur-sm transition-colors ${favorite ? "border-rose-400/40 bg-rose-500/15 text-rose-300" : "border-edge bg-elevated/40 text-ink-muted hover:bg-elevated hover:text-ink"}`}
                  >
                    <Heart size={22} fill={favorite ? "currentColor" : "none"} />
                  </button>
                  {ebook.siteUrl && (
                    <button
                      type="button"
                      aria-label={`Open in ${ebook.source === "anilist" ? "AniList" : "Open Library"}`}
                      title={ebook.source === "anilist" ? "AniList" : "Open Library"}
                      onClick={() => openUrl(ebook.siteUrl!)}
                      className="flex h-12 w-12 items-center justify-center rounded-xl border border-edge bg-elevated/40 text-ink-muted backdrop-blur-sm transition-colors hover:bg-elevated hover:text-ink"
                    >
                      <ExternalLink size={21} />
                    </button>
                  )}
                </div>
                <div className="max-w-3xl">
                  <p
                    ref={descriptionRef}
                    className={`whitespace-pre-line text-[15px] leading-relaxed text-ink-muted ${descriptionExpanded ? "" : "line-clamp-4"}`}
                  >
                    {ebook.description || "No description is available for this eBook."}
                  </p>
                  {(descriptionClipped || descriptionExpanded) && (
                    <button
                      type="button"
                      aria-expanded={descriptionExpanded}
                      onClick={() => setDescriptionExpanded((expanded) => !expanded)}
                      className="mt-2 text-[13px] font-semibold text-ink transition-colors hover:text-accent"
                    >
                      {descriptionExpanded ? "Show less" : "Show more"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-10">
          {(resolvingSource || sourceRoute) && (
            <EBookChapterSection
              chapters={chapters}
              loading={resolvingSource}
              volumeGroups={volumeGroups}
              selectedVolume={selectedVolume}
              onSelectVolume={setSelectedVolume}
              sourceOptions={sourceOptions}
              sourceRoute={sourceRoute}
              onSelectSource={setSourceRoute}
              onRead={readChapter}
            />
          )}
          {(ebook.books?.length ?? 0) > 1 && (
            <section className="w-full max-w-3xl rounded-2xl border border-edge-soft bg-elevated/35 p-5">
              <h2 className="text-[17px] font-semibold text-ink">Books & sources</h2>
              <p className="mt-1 text-[12.5px] text-ink-subtle">
                {ebook.books!.length} books grouped under {ebook.seriesTitle || ebook.title}
              </p>
              <div className="mt-4 divide-y divide-edge-soft">
                {ebook.books!.map((book) => (
                  <div key={book.id} className="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
                    <Poster
                      src={book.cover}
                      seed={`ebook-book:${book.id}`}
                      ratio="portrait"
                      className="w-11 shrink-0 rounded-md"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-medium text-ink">{book.title}</p>
                      <p className="truncate text-[11.5px] text-ink-subtle">
                        {[
                          book.authors[0],
                          book.year,
                          book.source === "anilist" ? "AniList" : "Open Library",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    {book.siteUrl && (
                      <button
                        type="button"
                        aria-label={`Open ${book.title}`}
                        onClick={() => openUrl(book.siteUrl!)}
                        className="grid size-9 shrink-0 place-items-center rounded-full border border-edge-soft text-ink-muted hover:bg-elevated hover:text-ink"
                      >
                        <ExternalLink size={15} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
          <EBookRail
            title="Recommended eBooks"
            subtitle="Books readers may also enjoy"
            items={recommendations}
            onOpen={onOpen}
            hideEmpty
          />
        </div>
      </div>
      {reading && (
        <EBookReader
          key={reading.chapter.id}
          bookId={ebook.id}
          bookTitle={ebook.title}
          bookCover={ebook.cover}
          internalCover={ebook.internalCover}
          chapter={reading.chapter}
          content={reading.content}
          error={reading.error}
          volumes={
            volumeGroups.length
              ? volumeGroups
              : [{ volume: "", label: "Chapters", chapters: chapters ?? [reading.chapter] }]
          }
          onSelectChapter={readChapter}
          onClose={() => setReading(null)}
        />
      )}
    </main>
  );
}
