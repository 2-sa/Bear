import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bookmark,
  BookOpen,
  ChevronLeft,
  Copy,
  Gauge,
  Headphones,
  Highlighter,
  Link2,
  MessageSquareText,
  Moon,
  Pause,
  Play,
  Search,
  Settings2,
  Sun,
  Trash2,
  Type,
  X,
} from "lucide-react";
import type { EBookChapter, EBookChapterContent } from "@/lib/ebook/providers";
import {
  addEBookBookmark,
  loadEBookAnnotations,
  loadEBookBookmarks,
  loadEBookProgress,
  loadEBookReaderPrefs,
  removeEBookBookmark,
  removeEBookAnnotation,
  saveEBookAnnotation,
  saveEBookProgress,
  saveEBookReaderPrefs,
  type EBookAnnotation,
  type EBookReaderPrefs,
} from "@/lib/ebook/reader-state";

type Props = {
  profile: string;
  bookId: string;
  bookTitle: string;
  chapter: EBookChapter;
  content: EBookChapterContent;
  direction: "ltr" | "rtl";
  volumes: EBookReaderVolume[];
  onSelectChapter: (chapter: EBookChapter) => void;
  onClose: () => void;
  onUseLegacy: () => void;
};

export type EBookReaderVolume = {
  volume: string;
  label: string;
  chapters: EBookChapter[];
};

const fontFamily = {
  literary: 'Georgia, "Times New Roman", serif',
  arabic: '"Traditional Arabic", "Noto Naskh Arabic", serif',
  classic: '"Book Antiqua", Palatino, serif',
};

const paper = {
  dark: { desk: "#090a0c", page: "#17181b", ink: "#e9e3d8", muted: "#8f8b84" },
  dim: { desk: "#17130f", page: "#2d261e", ink: "#eadbc5", muted: "#aa9a86" },
  light: { desk: "#c8c0b3", page: "#f4eddf", ink: "#29251f", muted: "#776f64" },
};

const inks = ["#f2c867", "#efa862", "#e89991", "#d184a5", "#bba4d9", "#9fc8dd", "#8fc9c2", "#b4cfa2"];
const stripMarks = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed]/g, "").toLocaleLowerCase();
type ReaderSelection = { ranges: EBookAnnotation["ranges"]; text: string; x: number; y: number };

export function HarborReader({
  profile,
  bookId,
  bookTitle,
  chapter,
  content,
  direction,
  volumes,
  onSelectChapter,
  onClose,
  onUseLegacy,
}: Props) {
  const [prefs, setPrefs] = useState<EBookReaderPrefs>(loadEBookReaderPrefs);
  const [panel, setPanel] = useState<"settings" | "search" | "bookmarks" | "annotations" | null>(null);
  const [chaptersOpen, setChaptersOpen] = useState(false);
  const currentVolume = volumes.find((volume) =>
    volume.chapters.some((item) => item.id === chapter.id),
  ) ?? volumes[0];
  const [sidebarVolume, setSidebarVolume] = useState(currentVolume?.volume ?? "");
  const shownVolume =
    volumes.find((volume) => volume.volume === sidebarVolume) ?? currentVolume;
  const shownChapters = shownVolume?.chapters ?? [];
  const [query, setQuery] = useState("");
  const [showFutureResults, setShowFutureResults] = useState(false);
  const [current, setCurrent] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const [chrome, setChrome] = useState(true);
  const [bookmarks, setBookmarks] = useState(() => loadEBookBookmarks(profile, bookId));
  const [annotations, setAnnotations] = useState(() => loadEBookAnnotations(profile, bookId));
  const [selection, setSelection] = useState<ReaderSelection | null>(null);
  const [editing, setEditing] = useState<EBookAnnotation | null>(null);
  const [trace, setTrace] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const article = useRef<HTMLElement>(null);
  const blocks = useRef<Array<HTMLElement | null>>([]);
  const speechIndex = useRef(0);
  const tracedLine = useRef(-1);
  const smartTarget = useRef<number | null>(null);
  const chromeTimer = useRef<number | undefined>(undefined);
  const traceFrame = useRef(0);
  const traceY = useRef<number | null>(null);
  const progressId = `${chapter.id}:harbor`;
  const paragraphs = useMemo(
    () =>
      (content.text ?? "")
        .replace(/\r/g, "")
        .split(/\n{2,}/)
        .map((value) => value.replace(/\n/g, " ").trim())
        .filter(Boolean),
    [content.text],
  );
  const colors = paper[prefs.background];
  const effectiveDirection = prefs.direction === "auto" ? direction : prefs.direction;

  const updateTrace = useCallback((mouseY?: number) => {
    if (mouseY != null) {
      traceY.current = mouseY;
      smartTarget.current = null;
    }
    cancelAnimationFrame(traceFrame.current);
    traceFrame.current = requestAnimationFrame(() => {
      const page = article.current;
      if (!page) return;
      if (mouseY == null && smartTarget.current != null) {
        const paragraph = blocks.current[smartTarget.current];
        if (!paragraph) return;
        const paragraphRect = paragraph.getBoundingClientRect();
        const next = { top: paragraphRect.top - 2, left: paragraphRect.left, width: paragraphRect.width, height: paragraphRect.height + 4 };
        setTrace((previous) => previous && Math.abs(previous.top - next.top) < 1 && previous.left === next.left && previous.width === next.width && previous.height === next.height ? previous : next);
        return;
      }
      const pageRect = page.getBoundingClientRect();
      if (traceY.current == null) {
        const top = scroller.current?.getBoundingClientRect().top ?? 0;
        const anchor = blocks.current.find((node) => node && node.getBoundingClientRect().bottom > top + 72);
        const walker = anchor && document.createTreeWalker(anchor, NodeFilter.SHOW_TEXT);
        let textNode = walker?.nextNode();
        while (textNode && !textNode.textContent?.trim()) textNode = walker?.nextNode();
        if (textNode?.textContent) {
          const first = document.createRange();
          const offset = textNode.textContent.search(/\S/);
          first.setStart(textNode, Math.max(0, offset));
          first.setEnd(textNode, Math.min(textNode.textContent.length, Math.max(0, offset) + 1));
          const firstRect = first.getClientRects()[0];
          if (firstRect) traceY.current = firstRect.top + firstRect.height / 2;
        }
      }
      const y = traceY.current ?? Math.min(window.innerHeight * 0.3, pageRect.bottom - 24);
      const x = pageRect.left + pageRect.width / 2;
      const range = (document as Document & { caretRangeFromPoint?: (x: number, y: number) => Range | null }).caretRangeFromPoint?.(x, y);
      if (!range) return;
      const paragraph = (range.startContainer.nodeType === Node.ELEMENT_NODE
        ? range.startContainer as Element
        : range.startContainer.parentElement)?.closest<HTMLElement>("[data-reader-line]");
      if (!paragraph) return;
      let lineRect = range.getClientRects()[0];
      if (!lineRect && range.startContainer.nodeType === Node.TEXT_NODE) {
        const probe = range.cloneRange();
        const length = range.startContainer.textContent?.length ?? 0;
        if (range.startOffset < length) probe.setEnd(range.startContainer, range.startOffset + 1);
        else if (range.startOffset > 0) probe.setStart(range.startContainer, range.startOffset - 1);
        lineRect = probe.getClientRects()[0];
      }
      if (!lineRect) return;
      const paragraphRect = paragraph.getBoundingClientRect();
      const line = Number(paragraph.dataset.readerLine);
      if (Number.isInteger(line) && tracedLine.current !== line) {
        tracedLine.current = line;
        setCurrent(line);
        saveEBookProgress(profile, bookId, progressId, line);
      }
      const next = { top: paragraphRect.top - 2, left: paragraphRect.left, width: paragraphRect.width, height: paragraphRect.height + 4 };
      setTrace((previous) => previous && Math.abs(previous.top - next.top) < 1 && previous.left === next.left && previous.width === next.width && previous.height === next.height ? previous : next);
    });
  }, [bookId, profile, progressId]);

  const patchPrefs = (patch: Partial<EBookReaderPrefs>) => {
    setPrefs((value) => {
      const next = { ...value, ...patch };
      saveEBookReaderPrefs(next);
      return next;
    });
  };

  const revealChrome = useCallback(() => {
    setChrome(true);
    window.clearTimeout(chromeTimer.current);
    if (prefs.focusMode)
      chromeTimer.current = window.setTimeout(() => setChrome(false), 2200);
  }, [prefs.focusMode]);

  const goTo = useCallback((index: number) => {
    const next = Math.max(0, Math.min(paragraphs.length - 1, index));
    smartTarget.current = next;
    blocks.current[next]?.scrollIntoView({ block: "center", behavior: "smooth" });
    tracedLine.current = next;
    setCurrent(next);
  }, [paragraphs.length]);

  useEffect(() => {
    const saved = loadEBookProgress(profile, bookId, progressId);
    const timer = window.setTimeout(() => { goTo(saved); updateTrace(); }, 80);
    return () => window.clearTimeout(timer);
  }, [bookId, goTo, profile, progressId, updateTrace]);

  useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        updateTrace();
      });
    };
    root.addEventListener("scroll", update, { passive: true });
    return () => {
      root.removeEventListener("scroll", update);
      cancelAnimationFrame(frame);
    };
  }, [bookId, profile, progressId, updateTrace]);

  useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    let wheel = 0;
    let reset = 0;
    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX) || !paragraphs.length) return;
      event.preventDefault();
      wheel += event.deltaY;
      window.clearTimeout(reset);
      reset = window.setTimeout(() => { wheel = 0; }, 140);
      if (Math.abs(wheel) < 32) return;
      const direction = wheel > 0 ? 1 : -1;
      wheel = 0;
      const next = Math.max(0, Math.min(paragraphs.length - 1, (tracedLine.current < 0 ? 0 : tracedLine.current) + direction));
      const paragraph = blocks.current[next];
      if (!paragraph || next === tracedLine.current) return;
      smartTarget.current = next;
      tracedLine.current = next;
      setCurrent(next);
      saveEBookProgress(profile, bookId, progressId, next);
      const rect = paragraph.getBoundingClientRect();
      const safeTop = 88;
      const safeBottom = window.innerHeight - 104;
      let offset = 0;
      if (rect.height > safeBottom - safeTop) offset = rect.top - safeTop;
      else if (rect.bottom > safeBottom) offset = rect.bottom - safeBottom;
      else if (rect.top < safeTop) offset = rect.top - safeTop;
      if (offset) root.scrollBy({ top: offset, behavior: "smooth" });
      updateTrace();
    };
    root.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      root.removeEventListener("wheel", onWheel);
      window.clearTimeout(reset);
    };
  }, [bookId, paragraphs.length, profile, progressId, updateTrace]);

  useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    let hold = 0;
    let pointer = -1;
    let startX = 0;
    let startY = 0;
    let startScroll = 0;
    let ready = false;
    let dragging = false;
    let suppressClick = false;
    const restore = () => {
      window.clearTimeout(hold);
      ready = false;
      root.style.cursor = "";
      root.style.userSelect = "";
    };
    const down = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || event.button !== 0 || (event.target as Element).closest("button,input,textarea,select,a,[contenteditable=true]")) return;
      pointer = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
      startScroll = root.scrollTop;
      dragging = false;
      hold = window.setTimeout(() => {
        ready = true;
        root.style.cursor = "grab";
      }, 100);
    };
    const move = (event: PointerEvent) => {
      if (event.pointerId !== pointer) return;
      const x = event.clientX - startX;
      const y = event.clientY - startY;
      if (!ready && Math.hypot(x, y) > 5) {
        window.clearTimeout(hold);
        pointer = -1;
        return;
      }
      if (!ready || Math.abs(y) < 2) return;
      if (!dragging) {
        dragging = true;
        smartTarget.current = tracedLine.current;
        root.setPointerCapture(pointer);
        root.style.cursor = "grabbing";
        root.style.userSelect = "none";
        window.getSelection()?.removeAllRanges();
      }
      event.preventDefault();
      root.scrollTop = startScroll - y;
    };
    const up = (event: PointerEvent) => {
      if (event.pointerId !== pointer) return;
      if (dragging) {
        suppressClick = true;
        updateTrace();
        if (root.hasPointerCapture(pointer)) root.releasePointerCapture(pointer);
      }
      pointer = -1;
      dragging = false;
      restore();
    };
    const click = (event: MouseEvent) => {
      if (!suppressClick) return;
      suppressClick = false;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    root.addEventListener("pointerdown", down);
    root.addEventListener("pointermove", move);
    root.addEventListener("pointerup", up);
    root.addEventListener("pointercancel", up);
    root.addEventListener("click", click, true);
    return () => {
      restore();
      root.removeEventListener("pointerdown", down);
      root.removeEventListener("pointermove", move);
      root.removeEventListener("pointerup", up);
      root.removeEventListener("pointercancel", up);
      root.removeEventListener("click", click, true);
    };
  }, [updateTrace]);

  useEffect(() => {
    return () => {
      window.clearTimeout(chromeTimer.current);
      cancelAnimationFrame(traceFrame.current);
      window.speechSynthesis?.cancel();
    };
  }, []);

  const stopSpeech = () => {
    window.speechSynthesis?.cancel();
    setSpeaking(false);
  };

  const speakFrom = (index = current) => {
    if (!("speechSynthesis" in window) || !paragraphs.length) return;
    window.speechSynthesis.cancel();
    speechIndex.current = index;
    setSpeaking(true);
    const next = () => {
      const text = paragraphs[speechIndex.current];
      if (!text) return setSpeaking(false);
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = effectiveDirection === "rtl" ? "ar" : "en";
      utterance.rate = 0.95;
      utterance.onstart = () => goTo(speechIndex.current);
      utterance.onend = () => {
        speechIndex.current += 1;
        next();
      };
      utterance.onerror = () => setSpeaking(false);
      window.speechSynthesis.speak(utterance);
    };
    next();
  };

  const addBookmark = (index = current) => {
    setBookmarks(
      addEBookBookmark(profile, {
        bookId,
        chapterId: chapter.id,
        chapterTitle: chapter.title || `Chapter ${chapter.chapter ?? ""}`.trim(),
        line: index,
        preview: paragraphs[index]?.slice(0, 140) ?? "",
      }),
    );
    setPanel("bookmarks");
  };

  const results = useMemo(() => {
    const term = stripMarks(query.trim());
    if (!term) return [];
    return paragraphs
      .map((text, index) => ({ text, index }))
      .filter(({ text }) => stripMarks(text).includes(term));
  }, [paragraphs, query]);
  const shownResults = showFutureResults ? results : results.filter((result) => result.index <= current);
  const hiddenResults = results.length - shownResults.length;

  useEffect(() => setShowFutureResults(false), [query]);
  useEffect(() => {
    const owner = volumes.find((volume) =>
      volume.chapters.some((item) => item.id === chapter.id),
    );
    if (owner) setSidebarVolume(owner.volume);
  }, [chapter.id, volumes]);
  useEffect(() => {
    if (!chaptersOpen) return;
    const timer = window.setTimeout(() => document.querySelector<HTMLElement>("[data-current-chapter=true]")?.scrollIntoView({ block: "center" }), 0);
    return () => window.clearTimeout(timer);
  }, [chapter.id, chaptersOpen, sidebarVolume]);
  useEffect(() => {
    if (!prefs.mouseLineTrack) traceY.current = null;
    updateTrace();
  }, [prefs.mouseLineTrack, prefs.fontSize, prefs.lineHeight, prefs.width, updateTrace]);

  const captureSelection = (event: React.MouseEvent<HTMLElement>) => {
    const selected = window.getSelection();
    if (!selected || selected.isCollapsed || !selected.rangeCount) return setSelection(null);
    const source = selected.getRangeAt(0);
    const ranges = blocks.current.flatMap((paragraph, line) => {
      if (!paragraph || !source.intersectsNode(paragraph)) return [];
      const range = document.createRange();
      range.selectNodeContents(paragraph);
      if (paragraph.contains(source.startContainer)) range.setStart(source.startContainer, source.startOffset);
      if (paragraph.contains(source.endContainer)) range.setEnd(source.endContainer, source.endOffset);
      const text = range.toString();
      if (!text) return [];
      const before = document.createRange();
      before.selectNodeContents(paragraph);
      before.setEnd(range.startContainer, range.startOffset);
      const start = before.toString().length;
      return [{ line, start, end: start + text.length }];
    });
    if (!ranges.length) return setSelection(null);
    setSelection({ ranges, text: selected.toString().trim(), x: event.clientX, y: event.clientY - 12 });
    event.stopPropagation();
  };

  const draftAnnotation = (reference = false, color = inks[0]): EBookAnnotation | null => selection && ({
    id: `an${Date.now().toString(36)}`,
    chapterId: chapter.id,
    ranges: selection.ranges,
    text: selection.text,
    color,
    density: 58,
    title: "",
    body: "",
    tags: [],
    reference,
    createdAt: Date.now(),
  });

  const storeAnnotation = (annotation: EBookAnnotation) => {
    setAnnotations(saveEBookAnnotation(profile, bookId, annotation));
    window.getSelection()?.removeAllRanges();
    setSelection(null);
    setEditing(null);
  };

  const quickHighlight = (color: string) => {
    const annotation = draftAnnotation(false, color);
    if (annotation) storeAnnotation(annotation);
  };

  const renderText = (text: string, line: number) => {
    const ranges = annotations.flatMap((annotation) => {
      const direct = annotation.chapterId === chapter.id
        ? annotation.ranges.filter((range) => range.line === line).map((range) => ({ ...range, annotation }))
        : [];
      if (!annotation.reference || !annotation.text) return direct;
      const found: Array<{ line: number; start: number; end: number; annotation: EBookAnnotation }> = [];
      const haystack = text.toLocaleLowerCase();
      const needle = annotation.text.toLocaleLowerCase();
      let start = 0;
      while ((start = haystack.indexOf(needle, start)) >= 0) {
        found.push({ line, start, end: start + needle.length, annotation });
        start += Math.max(1, needle.length);
      }
      return [...direct, ...found];
    }).sort((a, b) => a.start - b.start || b.end - a.end);
    if (!ranges.length) return text;
    const output: React.ReactNode[] = [];
    let cursor = 0;
    ranges.forEach(({ start: rawStart, end: rawEnd, annotation }) => {
      const start = Math.max(cursor, Math.min(text.length, rawStart));
      const end = Math.max(start, Math.min(text.length, rawEnd));
      if (start > cursor) output.push(text.slice(cursor, start));
      if (end > start) output.push(
        <mark
          key={`${annotation.id}:${line}:${start}`}
          className="reader-annotation"
          style={{ background: `color-mix(in srgb, ${annotation.color} ${annotation.density}%, transparent)` }}
          onClick={(event) => { event.stopPropagation(); setEditing(annotation); }}
        >{text.slice(start, end)}</mark>,
      );
      cursor = end;
    });
    if (cursor < text.length) output.push(text.slice(cursor));
    return output;
  };

  return (
    <div
      className="fixed inset-0 z-[90] overflow-hidden transition-colors duration-300"
      style={{ background: colors.desk, color: colors.ink, filter: `brightness(${prefs.brightness}%)` }}
      onMouseMove={revealChrome}
      onClick={revealChrome}
    >
      <div
        className={`absolute inset-x-0 top-0 z-30 flex h-16 items-center justify-between border-b px-5 backdrop-blur-xl transition duration-300 ${chrome ? "translate-y-0 opacity-100" : "-translate-y-full opacity-0"}`}
        style={{ background: `${colors.desk}df`, borderColor: `${colors.muted}35` }}
      >
        <div className="flex items-center gap-1">
          <button className="reader-icon" onClick={onClose} aria-label="Close reader"><X size={20} /></button>
          <button className={`reader-icon ${chaptersOpen ? "reader-icon-accent" : ""}`} onClick={() => { setChaptersOpen((open) => !open); setPanel(null); }} aria-label="Chapters"><BookOpen size={19} /></button>
        </div>
        <div className="min-w-0 text-center">
          <div className="truncate text-sm font-semibold">{chapter.title || bookTitle}</div>
          <div className="mt-0.5 text-[11px]" style={{ color: colors.muted }}>
            {current + 1} / {Math.max(1, paragraphs.length)} · {bookTitle}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button className="reader-icon" onClick={() => { setPanel("search"); setChaptersOpen(false); }} aria-label="Search chapter"><Search size={18} /></button>
          <button className="reader-icon" onClick={() => { setPanel("annotations"); setChaptersOpen(false); }} aria-label="Notes and highlights"><Highlighter size={18} /></button>
          <button className="reader-icon" onClick={() => { setPanel("bookmarks"); setChaptersOpen(false); }} aria-label="Bookmarks"><Bookmark size={18} /></button>
          <button className="reader-icon" onClick={() => { setPanel("settings"); setChaptersOpen(false); }} aria-label="Reader settings"><Settings2 size={19} /></button>
        </div>
      </div>

      <div ref={scroller} className="absolute inset-0 overflow-y-auto px-4 pb-32 pt-24 sm:px-8">
        <article
          ref={article}
          dir={effectiveDirection}
          className="relative mx-auto min-h-[calc(100vh-8rem)] rounded-[2px] px-7 py-14 shadow-[0_28px_90px_rgba(0,0,0,.42)] transition-[width,background-color] duration-300 sm:px-14"
          style={{
            width: `min(100%, ${prefs.width}px)`,
            background: colors.page,
            color: colors.ink,
            fontFamily: fontFamily[prefs.font],
            fontSize: `${prefs.fontSize}px`,
            lineHeight: prefs.lineHeight,
          }}
          onMouseUp={captureSelection}
          onMouseMove={(event) => prefs.mouseLineTrack && updateTrace(event.clientY)}
        >
          <div className="pointer-events-none absolute inset-y-0 start-0 w-px bg-gradient-to-b from-transparent via-black/10 to-transparent" />
          <header className="mb-12 border-b pb-7" style={{ borderColor: `${colors.muted}35` }}>
            <div className="mb-2 text-xs font-semibold uppercase tracking-[.24em]" style={{ color: colors.muted }}>Bear Reader</div>
            <h1 className="text-balance text-[1.85em] font-semibold leading-tight">{chapter.title || bookTitle}</h1>
          </header>
          {paragraphs.map((text, index) => (
            <p
              key={index}
              data-reader-line={index}
              ref={(node) => { blocks.current[index] = node; }}
              className={`relative mb-[1.1em] scroll-mt-24 text-pretty transition-colors ${index === current ? "reader-current" : ""}`}
              style={{ textAlign: "start" }}
              onMouseEnter={() => prefs.mouseLineTrack && setCurrent(index)}
              onDoubleClick={() => { setCurrent(index); addBookmark(index); }}
            >
              {renderText(text, index)}
            </p>
          ))}
          {(content.images ?? []).map((src, index) => <img key={src + index} src={src} className="mx-auto my-10 max-h-[80vh] max-w-full rounded" alt="" />)}
        </article>
      </div>

      {trace && <div dir={effectiveDirection} className="pointer-events-none fixed z-20 rounded-sm border-s-2 border-accent/60 bg-accent/[.10] shadow-[0_0_22px_rgba(255,159,77,.08)] transition-[top,height] duration-100" style={trace}><span className="absolute -start-8 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-accent shadow-[0_0_12px_currentColor]" /></div>}

      {selection && !editing && (
        <SelectionToolbar
          selection={selection}
          direction={effectiveDirection}
          onColor={quickHighlight}
          onListen={() => {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(selection.text);
            utterance.lang = effectiveDirection === "rtl" ? "ar" : "en";
            window.speechSynthesis.speak(utterance);
          }}
          onNote={() => setEditing(draftAnnotation(false))}
          onReference={() => setEditing(draftAnnotation(true))}
          onCopy={() => void navigator.clipboard.writeText(selection.text)}
        />
      )}

      <div
        className={`absolute inset-x-0 bottom-5 z-30 mx-auto flex w-fit items-center gap-1 rounded-full border p-1.5 shadow-2xl backdrop-blur-xl transition duration-300 ${chrome ? "translate-y-0 opacity-100" : "translate-y-10 opacity-0"}`}
        style={{ background: `${colors.desk}e8`, borderColor: `${colors.muted}45` }}
      >
        <button className="reader-icon" onClick={() => goTo(current - 1)} aria-label="Previous passage"><ChevronLeft size={19} /></button>
        <button className="reader-icon" onClick={() => addBookmark()} aria-label="Bookmark current passage"><Highlighter size={18} /></button>
        <button className="reader-icon reader-icon-accent" onClick={speaking ? stopSpeech : () => speakFrom()} aria-label={speaking ? "Stop reading" : "Read aloud"}>{speaking ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}</button>
        <div className="px-3 text-xs tabular-nums" style={{ color: colors.muted }}>{Math.round(((current + 1) / Math.max(1, paragraphs.length)) * 100)}%</div>
      </div>

      {chaptersOpen && (
        <aside className="absolute inset-y-0 start-0 z-40 flex w-full max-w-[390px] flex-col border-e p-5 shadow-2xl backdrop-blur-2xl" style={{ background: `${colors.page}f7`, borderColor: `${colors.muted}35` }}>
          <div className="flex items-center justify-between">
            <div><div className="text-[10px] font-semibold uppercase tracking-[.2em]" style={{ color: colors.muted }}>Chapters</div><h2 className="mt-1 text-lg font-semibold">{shownVolume?.label ?? "Chapters"}</h2></div>
            <button className="reader-icon" onClick={() => setChaptersOpen(false)} aria-label="Close chapters"><X size={18} /></button>
          </div>
          {volumes.length > 1 && <label className="mt-4 block"><span className="text-[10px] font-semibold uppercase tracking-[.18em]" style={{ color: colors.muted }}>Volume</span><select value={shownVolume?.volume ?? ""} onChange={(event) => setSidebarVolume(event.target.value)} className="mt-2 h-11 w-full rounded-xl border px-3 text-sm outline-none transition focus:border-accent" style={{ background: colors.page, borderColor: `${colors.muted}45`, color: colors.ink }}>{volumes.map((volume) => <option key={volume.volume || "chapters"} value={volume.volume}>{volume.label} · {volume.chapters.length} chapters</option>)}</select></label>}
          <div className="mt-4 flex items-center justify-between border-y py-3 text-xs" style={{ borderColor: `${colors.muted}25`, color: colors.muted }}><span>{shownChapters.length} chapters</span><span>{shownChapters.some((item) => item.id === chapter.id) ? `${shownChapters.findIndex((item) => item.id === chapter.id) + 1} / ${shownChapters.length}` : "Select a chapter"}</span></div>
          <div className="mt-3 min-h-0 flex-1 space-y-1 overflow-y-auto pe-1 pb-10">
            {shownChapters.map((item, index) => {
              const active = item.id === chapter.id;
              return <button key={item.id} data-current-chapter={active || undefined} onClick={() => !active && onSelectChapter(item)} className={`group flex w-full items-start gap-3 rounded-xl border px-3 py-3 text-start transition ${active ? "border-accent/50 bg-accent/10" : "border-transparent hover:border-white/10 hover:bg-white/5"}`}><span className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] tabular-nums ${active ? "bg-accent text-black" : "bg-white/5"}`}>{index + 1}</span><span className="min-w-0"><strong className={`line-clamp-2 block text-sm ${active ? "text-accent" : ""}`}>{item.title || `Chapter ${item.chapter ?? index + 1}`}</strong><span className="mt-1 block text-[11px]" style={{ color: colors.muted }}>{item.chapter ? `Chapter ${item.chapter}` : `Position ${index + 1}`}</span></span></button>;
            })}
          </div>
        </aside>
      )}

      {panel && (
        <div className="absolute inset-y-0 end-0 z-40 w-full max-w-[390px] border-s p-5 shadow-2xl backdrop-blur-2xl" style={{ background: `${colors.page}f7`, borderColor: `${colors.muted}35` }}>
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-lg font-semibold">{panel === "settings" ? "Reading settings" : panel === "search" ? "Search chapter" : panel === "annotations" ? "Notes & highlights" : "Bookmarks"}</h2>
            <button className="reader-icon" onClick={() => setPanel(null)} aria-label="Close panel"><X size={18} /></button>
          </div>
          {panel === "settings" && <Settings prefs={prefs} patch={patchPrefs} colors={colors} onUseLegacy={onUseLegacy} />}
          {panel === "search" && (
            <div>
              <div className="flex items-center gap-2 rounded-xl border px-3" style={{ borderColor: `${colors.muted}45` }}><Search size={17} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} className="h-11 min-w-0 flex-1 bg-transparent outline-none" placeholder="Find a word or passage" /></div>
              <div className="mt-3 rounded-xl border px-3 py-2 text-xs" style={{ borderColor: `${colors.muted}25`, color: colors.muted }}>Diacritic-insensitive · results ahead stay sealed</div>
              <div className="mt-4 space-y-2 overflow-y-auto pb-10">
                {shownResults.map((result) => <button key={result.index} onClick={() => { goTo(result.index); setPanel(null); }} className="w-full rounded-xl border p-3 text-start text-sm transition hover:border-accent/60" style={{ borderColor: `${colors.muted}25` }}><span className="mb-1 block text-[10px] uppercase tracking-widest opacity-50">Passage {result.index + 1}</span>{result.text.slice(0, 220)}</button>)}
                {hiddenResults > 0 && <button onClick={() => setShowFutureResults(true)} className="w-full rounded-xl border border-dashed border-accent/50 p-5 text-sm text-accent"><strong className="block text-base">{hiddenResults} {hiddenResults === 1 ? "match" : "matches"} ahead</strong><span className="mt-1 block text-xs opacity-70">Show them anyway</span></button>}
              </div>
            </div>
          )}
          {panel === "annotations" && (
            <div className="space-y-2 overflow-y-auto pb-10">
              {!annotations.length && <p style={{ color: colors.muted }}>Select a passage to add a highlight, note, or reference.</p>}
              {annotations.map((annotation) => <button key={annotation.id} onClick={() => setEditing(annotation)} className="w-full rounded-xl border p-3 text-start" style={{ borderColor: `${colors.muted}25` }}><span className="mb-2 block h-1 w-10 rounded-full" style={{ background: annotation.color, opacity: annotation.density / 100 }} /><strong className="block text-sm">{annotation.title || (annotation.reference ? "Reference" : annotation.body ? "Note" : "Highlight")}</strong><span className="mt-1 line-clamp-3 block text-xs" style={{ color: colors.muted }}>{annotation.text}</span>{annotation.tags.length > 0 && <span className="mt-2 block text-[10px] uppercase tracking-wider opacity-50">{annotation.tags.join(" · ")}</span>}</button>)}
            </div>
          )}
          {panel === "bookmarks" && (
            <div className="space-y-2">
              {!bookmarks.length && <p style={{ color: colors.muted }}>No saved passages yet.</p>}
              {bookmarks.map((bookmark) => <div key={bookmark.id} className="flex gap-2 rounded-xl border p-3" style={{ borderColor: `${colors.muted}25` }}><button className="min-w-0 flex-1 text-start" onClick={() => { goTo(bookmark.line); setPanel(null); }}><div className="text-sm font-medium">{bookmark.chapterTitle}</div><div className="mt-1 line-clamp-3 text-xs" style={{ color: colors.muted }}>{bookmark.preview}</div></button><button onClick={() => setBookmarks(removeEBookBookmark(profile, bookId, bookmark.id))} className="self-start p-2" aria-label="Delete bookmark"><Trash2 size={16} /></button></div>)}
            </div>
          )}
        </div>
      )}
      {editing && <AnnotationEditor annotation={editing} bookTitle={bookTitle} direction={effectiveDirection} onChange={setEditing} onSave={() => storeAnnotation(editing)} onDelete={() => { setAnnotations(removeEBookAnnotation(profile, bookId, editing.id)); setEditing(null); }} onClose={() => setEditing(null)} />}
      <style>{`.reader-icon{display:grid;width:42px;height:42px;place-items:center;border-radius:999px;color:inherit;transition:.16s ease}.reader-icon:hover{background:rgba(127,127,127,.16);transform:translateY(-1px)}.reader-icon:active{transform:scale(.92)}.reader-icon-accent{background:var(--color-accent);color:#111}.reader-current{border-radius:4px}.reader-annotation{color:inherit;border-radius:3px;padding:.04em .02em;cursor:pointer}.reader-annotation:hover{outline:1px solid color-mix(in srgb,var(--color-accent) 60%,transparent)}`}</style>
    </div>
  );
}

function SelectionToolbar({ selection, direction, onColor, onListen, onNote, onReference, onCopy }: {
  selection: ReaderSelection;
  direction: "ltr" | "rtl";
  onColor: (color: string) => void;
  onListen: () => void;
  onNote: () => void;
  onReference: () => void;
  onCopy: () => void;
}) {
  return (
    <div
      dir={direction}
      className="fixed z-[70] w-max max-w-[calc(100vw-24px)] -translate-x-1/2 -translate-y-full overflow-hidden rounded-2xl border border-white/10 bg-[#101011]/95 text-[#e8e3d9] shadow-[0_22px_70px_rgba(0,0,0,.62)] backdrop-blur-2xl"
      style={{ left: Math.min(window.innerWidth - 24, Math.max(24, selection.x)), top: Math.max(88, selection.y) }}
      onMouseDown={(event) => event.preventDefault()}
    >
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2.5">
        {inks.map((color) => <button key={color} onClick={() => onColor(color)} className="h-6 w-6 rounded-full border border-white/20 shadow-inner transition hover:scale-110" style={{ background: color }} aria-label={`Highlight ${color}`} />)}
      </div>
      <div className="flex items-center overflow-x-auto p-1.5 text-xs">
        <SelectionAction icon={<Headphones size={15} />} label={direction === "rtl" ? "استماع" : "Listen"} onClick={onListen} />
        <SelectionAction icon={<MessageSquareText size={15} />} label={direction === "rtl" ? "ملاحظة" : "Note"} onClick={onNote} />
        <SelectionAction icon={<Link2 size={15} />} label={direction === "rtl" ? "إضافة مرجع" : "Add reference"} onClick={onReference} />
        <SelectionAction icon={<Copy size={15} />} label={direction === "rtl" ? "نسخ" : "Copy"} onClick={onCopy} />
      </div>
    </div>
  );
}

function SelectionAction({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return <button onClick={onClick} className="flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 transition hover:bg-white/10">{icon}<span>{label}</span></button>;
}

function AnnotationEditor({ annotation, bookTitle, direction, onChange, onSave, onDelete, onClose }: {
  annotation: EBookAnnotation;
  bookTitle: string;
  direction: "ltr" | "rtl";
  onChange: (annotation: EBookAnnotation) => void;
  onSave: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  return (
    <div className="absolute inset-0 z-[80] grid place-items-center bg-black/65 p-4 backdrop-blur-md" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div dir={direction} className="grid max-h-[min(760px,92vh)] w-full max-w-[920px] overflow-hidden rounded-2xl border border-white/10 bg-[#111112] text-[#e8e3d9] shadow-[0_34px_100px_rgba(0,0,0,.72)] md:grid-cols-[1fr_280px]">
        <main className="flex min-h-[500px] flex-col p-8 md:p-10">
          <div className="text-xs uppercase tracking-[.2em] text-accent">{annotation.reference ? "Reference passage" : "Highlighted passage"}</div>
          <blockquote className="mt-4 border-s-2 ps-4 text-lg leading-relaxed" style={{ borderColor: annotation.color }}><mark style={{ background: `color-mix(in srgb, ${annotation.color} ${annotation.density}%, transparent)`, color: "inherit" }}>{annotation.text}</mark></blockquote>
          <input value={annotation.title} onChange={(event) => onChange({ ...annotation, title: event.target.value })} className="mt-8 border-b border-white/10 bg-transparent py-3 text-2xl outline-none placeholder:text-white/25" placeholder="Title (optional)" />
          <textarea autoFocus value={annotation.body} onChange={(event) => onChange({ ...annotation, body: event.target.value })} className="mt-4 min-h-48 flex-1 resize-none bg-transparent text-lg leading-relaxed outline-none placeholder:text-white/25" placeholder="Write here… nothing will interrupt you." />
          <div className="border-t border-white/10 pt-3 text-xs text-white/35">{annotation.body.length} characters</div>
        </main>
        <aside className="flex flex-col border-t border-white/10 bg-white/[.025] p-5 md:border-s md:border-t-0">
          <div className="flex items-center justify-between"><strong>{annotation.reference ? "Reference" : "Annotation"}</strong><button className="reader-icon" onClick={onClose}><X size={17} /></button></div>
          <Setting label="Ink colour"><div className="flex flex-wrap gap-2">{inks.map((color) => <button key={color} onClick={() => onChange({ ...annotation, color })} className={`h-8 w-8 rounded-full border-2 ${annotation.color === color ? "border-white" : "border-transparent"}`} style={{ background: color }} />)}</div></Setting>
          <Range icon={<Highlighter size={16} />} label="Ink density" value={annotation.density} min={20} max={90} step={5} onChange={(density) => onChange({ ...annotation, density })} />
          <Setting label="Tags"><input value={annotation.tags.join(", ")} onChange={(event) => onChange({ ...annotation, tags: event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean) })} className="h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm outline-none focus:border-accent/60" placeholder="study, character, quote" /></Setting>
          <div className="mt-auto border-t border-white/10 pt-4 text-xs text-white/40"><div>{bookTitle}</div><div className="mt-1">{annotation.reference ? "Marks every recurrence of this phrase" : "Saved to this passage"}</div></div>
          <div className="mt-4 flex gap-2"><button onClick={onSave} className="h-11 flex-1 rounded-xl bg-accent font-semibold text-black">Save</button><button onClick={onDelete} className="reader-icon text-red-400" aria-label="Delete"><Trash2 size={17} /></button></div>
        </aside>
      </div>
    </div>
  );
}

function Settings({ prefs, patch, colors, onUseLegacy }: { prefs: EBookReaderPrefs; patch: (value: Partial<EBookReaderPrefs>) => void; colors: (typeof paper)[keyof typeof paper]; onUseLegacy: () => void }) {
  return <div className="space-y-6">
    <Setting label="Paper"><div className="grid grid-cols-3 gap-2">{(["dark", "dim", "light"] as const).map((background) => <button key={background} onClick={() => patch({ background })} className={`grid h-12 place-items-center rounded-xl border capitalize ${prefs.background === background ? "border-accent text-accent" : ""}`} style={{ borderColor: prefs.background === background ? undefined : `${colors.muted}35` }}>{background === "light" ? <Sun size={18} /> : <Moon size={18} />}</button>)}</div></Setting>
    <Setting label="Type"><div className="grid grid-cols-3 gap-2">{(["literary", "arabic", "classic"] as const).map((font) => <button key={font} onClick={() => patch({ font })} className={`rounded-xl border px-2 py-3 capitalize ${prefs.font === font ? "border-accent text-accent" : ""}`} style={{ borderColor: prefs.font === font ? undefined : `${colors.muted}35`, fontFamily: fontFamily[font] }}>{font}</button>)}</div></Setting>
    <Range icon={<Type size={16} />} label="Text size" value={prefs.fontSize} min={15} max={34} onChange={(fontSize) => patch({ fontSize })} />
    <Range icon={<Gauge size={16} />} label="Line height" value={prefs.lineHeight} min={1.25} max={2.4} step={0.05} onChange={(lineHeight) => patch({ lineHeight })} />
    <Range icon={<BookOpen size={16} />} label="Page width" value={prefs.width} min={520} max={1080} step={20} onChange={(width) => patch({ width })} />
    <Range icon={<Sun size={16} />} label="Brightness" value={prefs.brightness} min={55} max={120} onChange={(brightness) => patch({ brightness })} />
    <Setting label="Direction"><div className="grid grid-cols-3 gap-2">{(["auto", "ltr", "rtl"] as const).map((direction) => <button key={direction} onClick={() => patch({ direction })} className={`rounded-xl border py-2 uppercase ${prefs.direction === direction ? "border-accent text-accent" : ""}`} style={{ borderColor: prefs.direction === direction ? undefined : `${colors.muted}35` }}>{direction}</button>)}</div></Setting>
    <label className="flex items-center justify-between gap-4"><span>Focus mode</span><input type="checkbox" checked={prefs.focusMode} onChange={(event) => patch({ focusMode: event.target.checked })} className="h-5 w-5 accent-[var(--color-accent)]" /></label>
    <label className="flex items-center justify-between gap-4"><span>Mouse line tracking</span><input type="checkbox" checked={prefs.mouseLineTrack} onChange={(event) => patch({ mouseLineTrack: event.target.checked })} className="h-5 w-5 accent-[var(--color-accent)]" /></label>
    <button onClick={onUseLegacy} className="w-full rounded-xl border px-4 py-3 text-sm" style={{ borderColor: `${colors.muted}45` }}>Use legacy Manga-style engine</button>
  </div>;
}

function Setting({ label, children }: { label: string; children: React.ReactNode }) { return <section><div className="mb-2 text-xs font-semibold uppercase tracking-[.18em] opacity-60">{label}</div>{children}</section>; }
function Range({ icon, label, value, min, max, step = 1, onChange }: { icon: React.ReactNode; label: string; value: number; min: number; max: number; step?: number; onChange: (value: number) => void }) { return <label className="block"><span className="mb-2 flex items-center justify-between text-sm"><span className="flex items-center gap-2">{icon}{label}</span><span className="tabular-nums opacity-60">{value}</span></span><input type="range" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} className="w-full accent-[var(--color-accent)]" /></label>; }
