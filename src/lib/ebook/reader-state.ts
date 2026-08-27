import { persistCritical } from "@/lib/storage-recovery";

export type EBookReaderPrefs = {
  engine: "harbor" | "legacy";
  mode: "long" | "long-h" | "paged" | "double" | "book";
  doubleGap: number;
  direction: "auto" | "ltr" | "rtl";
  fontSize: number;
  lineHeight: number;
  width: number;
  background: "dark" | "dim" | "light";
  brightness: number;
  focusMode: boolean;
  mouseLineTrack: boolean;
  font: "literary" | "arabic" | "classic";
};

export type EBookBookmark = {
  id: string;
  bookId: string;
  chapterId: string;
  chapterTitle: string;
  line: number;
  preview: string;
  createdAt: number;
};

export type EBookAnnotation = {
  id: string;
  chapterId: string;
  ranges: Array<{ line: number; start: number; end: number }>;
  text: string;
  color: string;
  density: number;
  title: string;
  body: string;
  tags: string[];
  reference: boolean;
  createdAt: number;
};

const PREFS = "harbor.ebook.reader.v1";
const DEFAULTS: EBookReaderPrefs = {
  engine: "harbor",
  mode: "long",
  doubleGap: 16,
  direction: "auto",
  fontSize: 19,
  lineHeight: 1.85,
  width: 768,
  background: "dark",
  brightness: 100,
  focusMode: false,
  mouseLineTrack: false,
  font: "literary",
};

const safe = (value: string) => encodeURIComponent(value);
const bookmarksKey = (profile: string, bookId: string) =>
  `harbor.ebook.bookmarks.v1.${safe(profile)}.${safe(bookId)}`;
const annotationsKey = (profile: string, bookId: string) =>
  `harbor.ebook.annotations.v1.${safe(profile)}.${safe(bookId)}`;
const progressKey = (profile: string, bookId: string, chapterId: string) =>
  `harbor.ebook.progress.v1.${safe(profile)}.${safe(bookId)}.${safe(chapterId)}`;

export function loadEBookReaderPrefs(): EBookReaderPrefs {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(PREFS) || "{}") };
  } catch {
    return DEFAULTS;
  }
}

export function saveEBookReaderPrefs(value: EBookReaderPrefs): void {
  persistCritical(PREFS, JSON.stringify(value));
}

export function loadEBookBookmarks(profile: string, bookId: string): EBookBookmark[] {
  try {
    const value = JSON.parse(localStorage.getItem(bookmarksKey(profile, bookId)) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export function addEBookBookmark(
  profile: string,
  bookmark: Omit<EBookBookmark, "id" | "createdAt">,
): EBookBookmark[] {
  const items = loadEBookBookmarks(profile, bookmark.bookId);
  const next = {
    ...bookmark,
    id: `bm${Date.now().toString(36)}`,
    createdAt: Date.now(),
  };
  const list = [
    next,
    ...items.filter((item) => item.chapterId !== next.chapterId || item.line !== next.line),
  ].slice(0, 300);
  persistCritical(bookmarksKey(profile, bookmark.bookId), JSON.stringify(list));
  return list;
}

export function removeEBookBookmark(profile: string, bookId: string, id: string): EBookBookmark[] {
  const list = loadEBookBookmarks(profile, bookId).filter((item) => item.id !== id);
  persistCritical(bookmarksKey(profile, bookId), JSON.stringify(list));
  return list;
}

export function loadEBookAnnotations(profile: string, bookId: string): EBookAnnotation[] {
  try {
    const value = JSON.parse(localStorage.getItem(annotationsKey(profile, bookId)) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export function saveEBookAnnotation(
  profile: string,
  bookId: string,
  annotation: Omit<EBookAnnotation, "id" | "createdAt"> & Partial<Pick<EBookAnnotation, "id" | "createdAt">>,
): EBookAnnotation[] {
  const items = loadEBookAnnotations(profile, bookId);
  const next = {
    ...annotation,
    id: annotation.id ?? `an${Date.now().toString(36)}`,
    createdAt: annotation.createdAt ?? Date.now(),
  } as EBookAnnotation;
  const list = [next, ...items.filter((item) => item.id !== next.id)].slice(0, 1000);
  persistCritical(annotationsKey(profile, bookId), JSON.stringify(list));
  return list;
}

export function removeEBookAnnotation(
  profile: string,
  bookId: string,
  id: string,
): EBookAnnotation[] {
  const list = loadEBookAnnotations(profile, bookId).filter((item) => item.id !== id);
  persistCritical(annotationsKey(profile, bookId), JSON.stringify(list));
  return list;
}

export function loadEBookProgress(profile: string, bookId: string, chapterId: string): number {
  const value = Number(localStorage.getItem(progressKey(profile, bookId, chapterId)));
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

export function saveEBookProgress(
  profile: string,
  bookId: string,
  chapterId: string,
  line: number,
): void {
  persistCritical(progressKey(profile, bookId, chapterId), String(line));
}
