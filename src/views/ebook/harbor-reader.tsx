import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bookmark,
  BookOpen,
  ChevronLeft,
  Gauge,
  Highlighter,
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
  loadEBookBookmarks,
  loadEBookProgress,
  loadEBookReaderPrefs,
  removeEBookBookmark,
  saveEBookProgress,
  saveEBookReaderPrefs,
  type EBookReaderPrefs,
} from "@/lib/ebook/reader-state";

type Props = {
  profile: string;
  bookId: string;
  bookTitle: string;
  chapter: EBookChapter;
  content: EBookChapterContent;
  direction: "ltr" | "rtl";
  onClose: () => void;
  onUseLegacy: () => void;
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

export function HarborReader({
  profile,
  bookId,
  bookTitle,
  chapter,
  content,
  direction,
  onClose,
  onUseLegacy,
}: Props) {
  const [prefs, setPrefs] = useState<EBookReaderPrefs>(loadEBookReaderPrefs);
  const [panel, setPanel] = useState<"settings" | "search" | "bookmarks" | null>(null);
  const [query, setQuery] = useState("");
  const [current, setCurrent] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const [chrome, setChrome] = useState(true);
  const [bookmarks, setBookmarks] = useState(() => loadEBookBookmarks(profile, bookId));
  const scroller = useRef<HTMLDivElement>(null);
  const blocks = useRef<Array<HTMLElement | null>>([]);
  const speechIndex = useRef(0);
  const chromeTimer = useRef<number | undefined>(undefined);
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
    blocks.current[next]?.scrollIntoView({ block: "center", behavior: "smooth" });
    setCurrent(next);
  }, [paragraphs.length]);

  useEffect(() => {
    const saved = loadEBookProgress(profile, bookId, progressId);
    const timer = window.setTimeout(() => goTo(saved), 80);
    return () => window.clearTimeout(timer);
  }, [bookId, goTo, profile, progressId]);

  useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const top = root.getBoundingClientRect().top + 120;
        let nearest = 0;
        let distance = Number.POSITIVE_INFINITY;
        blocks.current.forEach((node, index) => {
          if (!node) return;
          const next = Math.abs(node.getBoundingClientRect().top - top);
          if (next < distance) {
            distance = next;
            nearest = index;
          }
        });
        setCurrent(nearest);
        saveEBookProgress(profile, bookId, progressId, nearest);
      });
    };
    root.addEventListener("scroll", update, { passive: true });
    return () => {
      root.removeEventListener("scroll", update);
      cancelAnimationFrame(frame);
    };
  }, [bookId, profile, progressId]);

  useEffect(() => {
    return () => {
      window.clearTimeout(chromeTimer.current);
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
    const term = query.trim().toLocaleLowerCase();
    if (!term) return [];
    return paragraphs
      .map((text, index) => ({ text, index }))
      .filter(({ text }) => text.toLocaleLowerCase().includes(term))
      .slice(0, 100);
  }, [paragraphs, query]);

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
        <button className="reader-icon" onClick={onClose} aria-label="Close reader">
          <X size={20} />
        </button>
        <div className="min-w-0 text-center">
          <div className="truncate text-sm font-semibold">{chapter.title || bookTitle}</div>
          <div className="mt-0.5 text-[11px]" style={{ color: colors.muted }}>
            {current + 1} / {Math.max(1, paragraphs.length)} · {bookTitle}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button className="reader-icon" onClick={() => setPanel("search")} aria-label="Search chapter"><Search size={18} /></button>
          <button className="reader-icon" onClick={() => setPanel("bookmarks")} aria-label="Bookmarks"><Bookmark size={18} /></button>
          <button className="reader-icon" onClick={() => setPanel("settings")} aria-label="Reader settings"><Settings2 size={19} /></button>
        </div>
      </div>

      <div ref={scroller} className="absolute inset-0 overflow-y-auto px-4 pb-32 pt-24 sm:px-8">
        <article
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
              {index === current && <span className="absolute -start-6 top-[.65em] h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_12px_currentColor]" />}
              {text}
            </p>
          ))}
          {(content.images ?? []).map((src, index) => <img key={src + index} src={src} className="mx-auto my-10 max-h-[80vh] max-w-full rounded" alt="" />)}
        </article>
      </div>

      <div
        className={`absolute inset-x-0 bottom-5 z-30 mx-auto flex w-fit items-center gap-1 rounded-full border p-1.5 shadow-2xl backdrop-blur-xl transition duration-300 ${chrome ? "translate-y-0 opacity-100" : "translate-y-10 opacity-0"}`}
        style={{ background: `${colors.desk}e8`, borderColor: `${colors.muted}45` }}
      >
        <button className="reader-icon" onClick={() => goTo(current - 1)} aria-label="Previous passage"><ChevronLeft size={19} /></button>
        <button className="reader-icon" onClick={() => addBookmark()} aria-label="Bookmark current passage"><Highlighter size={18} /></button>
        <button className="reader-icon reader-icon-accent" onClick={speaking ? stopSpeech : () => speakFrom()} aria-label={speaking ? "Stop reading" : "Read aloud"}>{speaking ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}</button>
        <div className="px-3 text-xs tabular-nums" style={{ color: colors.muted }}>{Math.round(((current + 1) / Math.max(1, paragraphs.length)) * 100)}%</div>
      </div>

      {panel && (
        <div className="absolute inset-y-0 end-0 z-40 w-full max-w-[390px] border-s p-5 shadow-2xl backdrop-blur-2xl" style={{ background: `${colors.page}f7`, borderColor: `${colors.muted}35` }}>
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-lg font-semibold">{panel === "settings" ? "Reading settings" : panel === "search" ? "Search chapter" : "Bookmarks"}</h2>
            <button className="reader-icon" onClick={() => setPanel(null)} aria-label="Close panel"><X size={18} /></button>
          </div>
          {panel === "settings" && <Settings prefs={prefs} patch={patchPrefs} colors={colors} onUseLegacy={onUseLegacy} />}
          {panel === "search" && (
            <div>
              <div className="flex items-center gap-2 rounded-xl border px-3" style={{ borderColor: `${colors.muted}45` }}><Search size={17} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} className="h-11 min-w-0 flex-1 bg-transparent outline-none" placeholder="Find a word or passage" /></div>
              <div className="mt-4 space-y-2 overflow-y-auto pb-10">
                {results.map((result) => <button key={result.index} onClick={() => { goTo(result.index); setPanel(null); }} className="w-full rounded-xl border p-3 text-start text-sm transition hover:border-accent/60" style={{ borderColor: `${colors.muted}25` }}>{result.text.slice(0, 170)}</button>)}
              </div>
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
      <style>{`.reader-icon{display:grid;width:42px;height:42px;place-items:center;border-radius:999px;color:inherit;transition:.16s ease}.reader-icon:hover{background:rgba(127,127,127,.16);transform:translateY(-1px)}.reader-icon:active{transform:scale(.92)}.reader-icon-accent{background:var(--color-accent);color:#111}.reader-current{background:linear-gradient(90deg,color-mix(in srgb,var(--color-accent) 10%,transparent),transparent 70%);border-radius:4px}`}</style>
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
