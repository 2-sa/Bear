import { useCallback, useEffect, useMemo, useState } from "react";
import type { EBookChapter, EBookChapterContent } from "@/lib/ebook/providers";
import { createEBookPages } from "@/lib/ebook/text-pages";
import {
  loadEBookProgress,
  loadEBookReaderPrefs,
  saveEBookProgress,
  saveEBookReaderPrefs,
} from "@/lib/ebook/reader-state";
import { useProfiles } from "@/lib/profiles";
import { MangaReader } from "@/views/manga/manga-reader";
import { HarborReader } from "./harbor-reader";

const PREFS = "harbor.ebook.manga-reader.v1";

function textDirection(text: string): "ltr" | "rtl" {
  const rtl = text.match(/[\u0600-\u06ff\u0750-\u077f]/g)?.length ?? 0;
  const ltr = text.match(/[A-Za-z]/g)?.length ?? 0;
  return rtl > ltr ? "rtl" : "ltr";
}

export function EBookReader({
  bookId,
  bookTitle,
  chapter,
  content,
  error,
  onClose,
}: {
  bookId: string;
  bookTitle: string;
  chapter: EBookChapter;
  content: EBookChapterContent | null;
  error?: string;
  onClose: () => void;
}) {
  const { activeId } = useProfiles();
  const profile = activeId ?? "default";
  const direction = textDirection(content?.text ?? "");
  const [engine, setEngine] = useState(() => loadEBookReaderPrefs().engine);
  const [pages, setPages] = useState<Awaited<ReturnType<typeof createEBookPages>> | null>(null);
  useEffect(() => {
    let cancelled = false;
    let generated: Awaited<ReturnType<typeof createEBookPages>> = [];
    setPages(null);
    if (content && engine === "legacy") {
      void createEBookPages(content, direction).then((next) => {
        generated = next;
        if (cancelled) {
          next.forEach((page) => page.url.startsWith("blob:") && URL.revokeObjectURL(page.url));
        } else setPages(next);
      });
    }
    return () => {
      cancelled = true;
      generated.forEach((page) => page.url.startsWith("blob:") && URL.revokeObjectURL(page.url));
    };
  }, [content, direction, engine]);
  const mangaChapter = useMemo(
    () => ({
      id: chapter.id,
      chapter: chapter.chapter ?? (chapter.position != null ? String(chapter.position) : null),
      title: chapter.title,
      pages: pages?.length ?? 0,
      language: direction === "rtl" ? "ar" : "en",
    }),
    [chapter.chapter, chapter.id, chapter.position, chapter.title, direction, pages?.length],
  );
  const savePage = useCallback(
    (page: number) => saveEBookProgress(profile, bookId, chapter.id, page),
    [bookId, chapter.id, profile],
  );

  if (!content || error || (engine === "legacy" && !pages)) {
    return (
      <div className="fixed inset-0 z-[90] grid place-items-center bg-[#0b0b0d] text-ink">
        <div className="text-center">
          <p className={error ? "text-red-400" : "text-ink-muted"}>{error ?? "Loading chapter…"}</p>
          {error && (
            <button
              type="button"
              onClick={onClose}
              className="mt-4 rounded-xl bg-raised px-4 py-2 text-sm"
            >
              Close reader
            </button>
          )}
        </div>
      </div>
    );
  }

  const changeEngine = (value: "harbor" | "legacy") => {
    const prefs = { ...loadEBookReaderPrefs(), engine: value };
    saveEBookReaderPrefs(prefs);
    setEngine(value);
  };

  if (engine === "harbor") {
    return (
      <HarborReader
        profile={profile}
        bookId={bookId}
        bookTitle={bookTitle}
        chapter={chapter}
        content={content}
        direction={direction}
        onClose={onClose}
        onUseLegacy={() => changeEngine("legacy")}
      />
    );
  }

  if (!localStorage.getItem(PREFS)) {
    localStorage.setItem(PREFS, JSON.stringify({ rtl: direction === "rtl" }));
  }

  return (
    <>
      <MangaReader
        chapters={[mangaChapter]}
        index={0}
        manga={{ id: `ebook:${bookId}`, title: bookTitle }}
        pagesOverride={pages ?? []}
        prefsKey={PREFS}
        disableMangaPersistence
        startPage={loadEBookProgress(profile, bookId, chapter.id)}
        onPageChange={savePage}
        onExit={onClose}
        onChangeIndex={() => undefined}
      />
      <button
        type="button"
        onClick={() => changeEngine("harbor")}
        className="fixed bottom-5 left-5 z-[100] rounded-full border border-white/15 bg-black/70 px-4 py-2 text-xs text-white backdrop-blur-xl hover:border-accent hover:text-accent"
      >
        Use Bear Reader
      </button>
    </>
  );
}
