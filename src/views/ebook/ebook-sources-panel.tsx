import {
  AlertCircle,
  ArrowRight,
  Blocks,
  BookOpen,
  Check,
  ChevronDown,
  ChevronLeft,
  Database,
  Download,
  FileText,
  Folder,
  FolderOpen,
  Languages,
  Library,
  Loader2,
  PackageOpen,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import "./ebook-sources-panel.css";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  addEBookRepo,
  browseEBookRepo,
  installEBookPlugin,
  installedEBookPlugins,
  loadEBookExtensions,
  ebookRepoUrls,
  removeEBookPlugin,
  removeEBookRepo,
  setEBookPluginEnabled,
  subscribeEBookExtensions,
  type EBookPluginManifest,
  type EBookPluginRepo,
} from "@/lib/ebook/extensions";
import {
  addEBookFolder,
  addEBookHtmlSource,
  listEBookSources,
  parseEBookSourceConfig,
  removeEBookSource,
  subscribeEBookSources,
  type EBookSource,
} from "@/lib/ebook/sources";
import { CARD, INPUT, PRIMARY_BTN } from "@/views/manga/manga-sources-panel/shared";
import { PluginGuide } from "@/views/manga/manga-sources-panel/plugin-guide";
import {
  googleBooksApiKey,
  setGoogleBooksApiKey,
  validateGoogleBooksApiKey,
} from "@/lib/ebook/api";
import deepseekLogo from "@/assets/ai-logos/deepseek.png";
import {
  loadEBookTranslationSettings,
  saveEBookTranslationSettings,
  type EBookTranslationSettings,
} from "@/lib/ebook/translation";

const EXAMPLE = `{
  "name": "My eBook Source",
  "baseUrl": "https://example.test",
  "popularPath": "/ebooks?sort=popular&page={page}",
  "searchPath": "/search?q={query}&page={page}",
  "list": {
    "item": "article.ebook",
    "title": "a.title",
    "link": "a.title@href",
    "cover": "img@src"
  },
  "detail": {
    "title": "h1",
    "cover": "img.cover@src",
    "description": ".description",
    "author": ".author",
    "status": ".status"
  },
  "chapters": {
    "item": "a.chapter",
    "link": "@href",
    "title": ".name",
    "chapter": "@data-number",
    "volume": ".volume",
    "date": "time@datetime",
    "views": ".views"
  },
  "content": { "body": ".chapter-content" }
}`;

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="mt-2 px-1 text-[12.5px] font-bold uppercase tracking-[0.12em] text-ink-subtle">
      {children}
    </p>
  );
}

function MetadataProviders() {
  const [key, setKey] = useState(googleBooksApiKey);
  const [state, setState] = useState<"idle" | "testing" | "saved" | "error">("idle");
  const [error, setError] = useState("");
  const save = async () => {
    if (state === "testing") return;
    setState("testing");
    setError("");
    try {
      await validateGoogleBooksApiKey(key);
      setGoogleBooksApiKey(key);
      setState("saved");
      window.setTimeout(() => setState("idle"), 1600);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not validate this API key.");
      setState("error");
    }
  };
  return (
    <div className="flex flex-col gap-3">
      <SectionLabel>Metadata</SectionLabel>
      <div className={`${CARD} flex flex-col gap-3 p-5`}>
        <div>
          <p className="text-[15px] font-semibold text-ink">Google Books</p>
          <p className="text-[13px] text-ink-muted">
            Add a Google Books API key for book titles, covers, authors, and descriptions. Wikidata
            works automatically as the final metadata fallback.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_7.5rem]">
          <input
            type="password"
            value={key}
            onChange={(event) => {
              setKey(event.target.value);
              setState("idle");
              setError("");
            }}
            onKeyDown={(event) => event.key === "Enter" && void save()}
            placeholder="Google Books API key"
            autoComplete="off"
            className={`${INPUT} min-w-0 flex-1`}
          />
          <button
            type="button"
            disabled={state === "testing"}
            aria-live="polite"
            className={`${PRIMARY_BTN} w-full min-w-[7.5rem] px-5 active:scale-[0.96] disabled:cursor-wait`}
            onClick={() => void save()}
          >
            {state === "testing" ? (
              <Loader2 size={17} className="animate-spin motion-reduce:animate-none" />
            ) : (
              <Check size={17} />
            )}
            {state === "testing" ? "Testing" : state === "saved" ? "Saved" : "Save"}
          </button>
        </div>
        {error && (
          <p className="flex items-start gap-2 text-[12.5px] leading-relaxed text-danger">
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </p>
        )}
      </div>
    </div>
  );
}

function TranslationSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string; sub?: string }>;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value) ?? options[0];
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", escape);
    };
  }, [open]);
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-[12px] font-semibold uppercase tracking-[0.12em] text-ink-subtle">
        {label}
      </span>
      <div ref={root} className="relative">
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
          className={`flex h-12 w-full items-center gap-3 rounded-xl border px-3.5 text-start outline-none transition-all ${
            open
              ? "border-accent/70 bg-accent/5 shadow-[0_0_0_3px_rgba(255,159,77,0.10)]"
              : "border-edge bg-canvas hover:border-accent/40"
          }`}
        >
          <span className="h-2 w-2 shrink-0 rounded-full bg-accent shadow-[0_0_10px_rgba(255,159,77,0.55)]" />
          <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-ink">
            {selected.label}
          </span>
          <ChevronDown
            size={16}
            className={`shrink-0 text-ink-subtle transition-transform duration-200 ${open ? "rotate-180 text-accent" : ""}`}
          />
        </button>
        {open && (
          <div
            role="listbox"
            className="harbor-rise absolute inset-x-0 top-[calc(100%+7px)] z-40 overflow-hidden rounded-xl border border-edge bg-canvas/95 p-1.5 shadow-[0_20px_55px_-18px_rgba(0,0,0,0.82)] backdrop-blur-xl"
          >
            {options.map((option) => {
              const active = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-start transition-colors ${
                    active
                      ? "bg-accent/14 text-ink"
                      : "text-ink-muted hover:bg-elevated hover:text-ink"
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${active ? "bg-accent" : "bg-edge"}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block truncate text-[13.5px] ${active ? "font-semibold" : "font-medium"}`}
                    >
                      {option.label}
                    </span>
                    {option.sub && (
                      <span className="mt-0.5 block truncate text-[11.5px] text-ink-subtle">
                        {option.sub}
                      </span>
                    )}
                  </span>
                  {active && <Check size={16} className="shrink-0 text-accent" />}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </label>
  );
}

function Translation() {
  const [settings, setSettings] = useState(loadEBookTranslationSettings);
  const [saved, setSaved] = useState(false);
  const patch = (next: Partial<EBookTranslationSettings>) =>
    setSettings((current) => ({ ...current, ...next }));
  const save = () => {
    saveEBookTranslationSettings({ ...settings, apiKey: settings.apiKey.trim() });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1200);
  };
  return (
    <div className="flex flex-col gap-3">
      <SectionLabel>Translation</SectionLabel>
      <div className={`${CARD} flex flex-col gap-4 p-5`}>
        <div className="flex items-center gap-3.5">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white ring-1 ring-black/10">
            <img src={deepseekLogo} alt="" className="h-7 w-7 object-contain" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2 text-[15px] font-semibold text-ink">
              <Languages size={17} /> DeepSeek chapter translation
            </span>
            <span className="text-[13px] leading-relaxed text-ink-muted">
              Sends only the chapter you open to DeepSeek. Volumes, chapters, and metadata stay
              unchanged.
            </span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={settings.enabled}
            onClick={() => patch({ enabled: !settings.enabled })}
            className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${settings.enabled ? "bg-accent" : "bg-edge"}`}
          >
            <span
              className={`absolute top-1 h-5 w-5 rounded-full bg-canvas shadow-sm transition-transform ${settings.enabled ? "start-6" : "start-1"}`}
            />
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <TranslationSelect
            label="Model"
            value={settings.model}
            onChange={(model) => patch({ model })}
            options={[
              {
                value: "deepseek-v4-flash",
                label: "DeepSeek V4 Flash",
                sub: "Fast · recommended for chapters",
              },
              {
                value: "deepseek-v4-pro",
                label: "DeepSeek V4 Pro",
                sub: "Higher quality · slower",
              },
            ]}
          />
          <TranslationSelect
            label="Translate to"
            value={settings.targetLanguage}
            onChange={(targetLanguage) =>
              patch({
                targetLanguage: targetLanguage as EBookTranslationSettings["targetLanguage"],
              })
            }
            options={[
              { value: "en", label: "English", sub: "English" },
              { value: "ar", label: "Arabic", sub: "العربية" },
              { value: "pt", label: "Portuguese", sub: "Português" },
              { value: "ru", label: "Russian", sub: "Русский" },
            ]}
          />
        </div>
        <div className="flex gap-2">
          <input
            type="password"
            value={settings.apiKey}
            onChange={(event) => patch({ apiKey: event.target.value })}
            placeholder="DeepSeek API key (sk-...)"
            autoComplete="off"
            className={`${INPUT} min-w-0 flex-1`}
          />
          <button type="button" onClick={save} className={`${PRIMARY_BTN} px-5`}>
            <Check size={17} /> {saved ? "Saved" : "Save"}
          </button>
        </div>
        <p className="text-[12.5px] leading-relaxed text-ink-subtle">
          Translation runs when a chapter opens and uses one API request. If it fails or is
          truncated, Bear keeps the original chapter.
        </p>
      </div>
    </div>
  );
}

function SourceIcon({ source }: { source: EBookSource }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-canvas text-ink-muted ring-1 ring-edge-soft">
      {source.iconUrl && !failed ? (
        <img
          src={source.iconUrl}
          alt=""
          className="h-7 w-7 object-contain"
          onError={() => setFailed(true)}
        />
      ) : source.kind === "local" ? (
        <FolderOpen size={20} />
      ) : (
        <FileText size={20} />
      )}
    </span>
  );
}

function SourceRow({ source }: { source: EBookSource }) {
  const [removing, setRemoving] = useState(false);
  return (
    <div
      className={`overflow-hidden transition-all duration-300 ${removing ? "max-h-0 scale-95 opacity-0" : "max-h-28"}`}
    >
      <div className={CARD}>
        <div className="flex items-center gap-4 px-5 py-4">
          <SourceIcon source={source} />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-[16px] font-semibold text-ink">{source.name}</span>
            <span className="truncate text-[13px] text-ink-subtle">{source.location}</span>
          </span>
          <span className="rounded-md bg-raised px-2 py-0.5 text-[11px] font-bold text-ink-muted ring-1 ring-edge-soft">
            {source.kind === "local" ? "Folder" : "Site"}
          </span>
          <button
            type="button"
            aria-label={`Remove ${source.name}`}
            onClick={() => {
              setRemoving(true);
              window.setTimeout(() => removeEBookSource(source.id), 240);
            }}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-raised text-ink-subtle ring-1 ring-edge-soft transition-all hover:text-danger active:scale-95"
          >
            <Trash2 size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

function LocalFolderTutorial({ onClose, onChoose }: { onClose: () => void; onChoose: () => void }) {
  return createPortal(
    <div
      className="animate-fade-in fixed inset-0 z-[80] grid place-items-center bg-black/60 p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="animate-modal-in flex w-full max-w-md flex-col gap-5 rounded-2xl border border-edge bg-surface p-6 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <h2 className="font-display text-[21px] font-medium tracking-tight text-ink">
            Add a local folder
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-xl border border-edge-soft text-ink-subtle hover:bg-elevated hover:text-ink"
          >
            <X size={18} />
          </button>
        </div>
        <p className="text-[14px] leading-relaxed text-ink-muted">
          Pick one library folder. Each subfolder is one eBook. Put its chapters inside as TXT,
          Markdown, HTML, or EPUB files and optionally add a cover image.
        </p>
        <div className="flex flex-col gap-2 rounded-xl bg-canvas p-4 text-[13.5px] ring-1 ring-edge-soft">
          <span className="flex items-center gap-2 text-ink-muted">
            <FolderOpen size={16} /> My eBooks
          </span>
          <span className="ms-6 flex items-center gap-2 font-semibold text-ink">
            <Folder size={16} className="text-accent" /> Lord of Mysteries
          </span>
          <span className="ms-12 flex items-center gap-2 text-ink-muted">
            <FileText size={16} /> Volume 1.epub
          </span>
          <span className="ms-12 flex items-center gap-2 text-ink-muted">
            <FileText size={16} /> Chapter 2.txt
          </span>
          <span className="ms-12 flex items-center gap-2 text-ink-muted">
            <BookOpen size={16} /> cover.jpg
          </span>
        </div>
        <button
          type="button"
          onClick={() => {
            onClose();
            onChoose();
          }}
          className={PRIMARY_BTN}
        >
          <FolderOpen size={18} /> Choose folder
        </button>
      </div>
    </div>,
    document.body,
  );
}

function LocalFolder() {
  const [tutorial, setTutorial] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const choose = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const path = await open({ directory: true, multiple: false, title: "Choose eBook folder" });
      if (typeof path === "string" && !addEBookFolder(path)) setError("Could not add that folder");
    } catch {
      setError("Folder selection is available in the Bear app");
    }
  };
  return (
    <>
      <div className={`group transition-all hover:ring-edge ${CARD}`}>
        <button
          type="button"
          onClick={() => setTutorial(true)}
          className="flex w-full items-center gap-4 px-5 py-4 text-start active:scale-[0.99]"
        >
          <span className="grid h-12 w-12 place-items-center rounded-xl bg-canvas text-ink-muted ring-1 ring-edge-soft">
            <FolderOpen size={20} />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-[16px] font-semibold text-ink">Local folder</span>
            <span className="truncate text-[13px] text-ink-muted">
              Read eBook files you already have
            </span>
          </span>
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-raised text-ink-muted ring-1 ring-edge-soft">
            <Plus size={18} />
          </span>
        </button>
        {error && <p className="px-5 pb-4 text-[13px] font-medium text-danger">{error}</p>}
      </div>
      {tutorial && <LocalFolderTutorial onClose={() => setTutorial(false)} onChoose={choose} />}
    </>
  );
}

function CustomSource() {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState(false);
  const add = () => {
    try {
      if (!addEBookHtmlSource(parseEBookSourceConfig(value)))
        throw new Error("Could not save source");
      setError(null);
      setAdded(true);
      window.setTimeout(() => {
        setAdded(false);
        setOpen(false);
        setValue("");
      }, 650);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Invalid source config");
    }
  };
  return (
    <div className={`${CARD} overflow-hidden ${open ? "xl:col-span-2" : ""}`}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center gap-4 px-5 py-4 text-start active:scale-[0.99]"
      >
        <span className="grid h-12 w-12 place-items-center rounded-xl bg-canvas text-ink-muted ring-1 ring-edge-soft">
          <FileText size={20} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[16px] font-semibold text-ink">Custom source</span>
          <span className="text-[13px] text-ink-muted">
            Connect a server-rendered eBook site with JSON selectors
          </span>
        </span>
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-raised text-ink-muted ring-1 ring-edge-soft">
          <Plus size={18} className={`transition-transform ${open ? "rotate-45" : ""}`} />
        </span>
      </button>
      {open && (
        <div className="harbor-rise flex flex-col gap-3 border-t border-edge-soft p-5">
          <p className="text-[13px] leading-relaxed text-ink-muted">
            Bear performs plain HTTP requests and CSS-selector parsing. It does not bypass logins,
            paywalls, or access controls.
          </p>
          <textarea
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={EXAMPLE}
            spellCheck={false}
            className="h-64 w-full resize-y rounded-xl border border-edge bg-canvas p-4 font-mono text-[12.5px] leading-relaxed text-ink outline-none placeholder:text-ink-subtle/65 focus:border-accent/55"
          />
          <button
            type="button"
            onClick={() => setValue(EXAMPLE)}
            className="self-start text-[12.5px] font-medium text-accent"
          >
            Use template
          </button>
          {error && <p className="text-[13px] font-medium text-danger">{error}</p>}
          <button type="button" onClick={add} className={PRIMARY_BTN}>
            {added ? <Check size={18} /> : <Plus size={18} />}
            {added ? "Source added" : "Add source"}
          </button>
        </div>
      )}
    </div>
  );
}

function InstalledSourceRow({ item }: { item: ReturnType<typeof installedEBookPlugins>[number] }) {
  return (
    <div className="flex items-center gap-3.5 px-5 py-3.5">
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-canvas text-[12px] font-bold text-ink-muted ring-1 ring-edge-soft">
        {item.name
          .replace(/[^a-z0-9]/gi, "")
          .slice(0, 2)
          .toUpperCase()}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[15px] font-semibold text-ink">{item.name}</span>
        <span className="text-[12.5px] text-ink-muted">
          {item.lang} · v{item.version}
        </span>
      </span>
      <button
        type="button"
        role="switch"
        aria-label={`Enable ${item.name}`}
        aria-checked={item.enabled}
        onClick={() => void setEBookPluginEnabled(item.id, !item.enabled)}
        className={`relative h-6 w-10 rounded-full ${item.enabled ? "bg-ink" : "bg-edge"}`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-canvas transition-transform ${item.enabled ? "start-[18px]" : "start-0.5"}`}
        />
      </button>
      <button
        type="button"
        aria-label={`Remove ${item.name}`}
        onClick={() => void removeEBookPlugin(item.id)}
        className="grid h-9 w-9 place-items-center rounded-lg bg-raised text-ink-subtle ring-1 ring-edge-soft hover:text-danger"
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
}

function PluginRow({ item, repoUrl }: { item: EBookPluginManifest; repoUrl: string }) {
  const installed = installedEBookPlugins().find((plugin) => plugin.id === item.id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const action = async () => {
    setBusy(true);
    setError(null);
    try {
      if (!installed) await installEBookPlugin(item, repoUrl);
      else await removeEBookPlugin(item.id);
    } catch {
      setError("Install failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex items-center gap-3.5 px-5 py-3.5">
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-canvas text-[12px] font-bold text-ink-muted ring-1 ring-edge-soft">
        {item.name
          .replace(/[^a-z0-9]/gi, "")
          .slice(0, 2)
          .toUpperCase()}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[15px] font-semibold text-ink">{item.name}</span>
        <span className="text-[12.5px] text-ink-muted">
          {item.lang} · v{item.version}
          {error && <span className="text-danger"> · {error}</span>}
        </span>
      </span>
      {installed && (
        <button
          type="button"
          role="switch"
          aria-checked={installed.enabled}
          onClick={() => void setEBookPluginEnabled(installed.id, !installed.enabled)}
          className={`relative h-6 w-10 rounded-full ${installed.enabled ? "bg-ink" : "bg-edge"}`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-canvas transition-transform ${installed.enabled ? "start-[18px]" : "start-0.5"}`}
          />
        </button>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={() => void action()}
        className={`flex h-9 min-w-[104px] items-center justify-center gap-1.5 rounded-xl px-4 text-[13.5px] font-semibold disabled:opacity-60 ${installed ? "bg-raised text-ink-subtle ring-1 ring-edge-soft hover:text-danger" : "bg-accent text-canvas"}`}
      >
        {busy ? (
          <Loader2 size={15} className="animate-spin" />
        ) : installed ? (
          <Trash2 size={15} />
        ) : (
          <Download size={15} />
        )}
        {installed ? "Remove" : "Install"}
      </button>
    </div>
  );
}

function RepoCard({ url }: { url: string }) {
  const [repo, setRepo] = useState<EBookPluginRepo | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [updating, setUpdating] = useState(false);
  const [updateError, setUpdateError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setState("loading");
    void browseEBookRepo(url)
      .then((value) => {
        if (!cancelled) {
          setRepo(value);
          setState("ready");
        }
      })
      .catch(() => !cancelled && setState("error"));
    return () => {
      cancelled = true;
    };
  }, [url]);
  const update = async () => {
    setUpdating(true);
    setUpdateError(false);
    try {
      const next = await browseEBookRepo(url);
      const installed = new Map(
        installedEBookPlugins()
          .filter((item) => item.repoUrl === url)
          .map((item) => [item.id, item]),
      );
      for (const item of next.plugins) {
        const current = installed.get(item.id);
        if (current && current.version !== item.version) await installEBookPlugin(item, url);
      }
      setRepo(next);
      setState("ready");
    } catch {
      setUpdateError(true);
    } finally {
      setUpdating(false);
    }
  };
  return (
    <div className={`${CARD} overflow-hidden`}>
      <div className="flex items-center gap-3.5 px-5 py-3.5">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-canvas text-ink-muted ring-1 ring-edge-soft">
          <PackageOpen size={18} />
        </span>
        <span className="min-w-0 flex-1 truncate text-[15.5px] font-semibold text-ink">
          {repo?.name ?? new URL(url).host}
        </span>
        <button
          type="button"
          aria-label="Update repository"
          title="Update repository"
          disabled={updating || state === "loading"}
          onClick={() => void update()}
          className="grid h-9 w-9 place-items-center rounded-lg bg-raised text-ink-subtle ring-1 ring-edge-soft hover:text-accent disabled:opacity-50"
        >
          <RefreshCw size={16} className={updating ? "animate-spin" : ""} />
        </button>
        <button
          type="button"
          aria-label="Remove repository"
          onClick={() => void removeEBookRepo(url)}
          className="grid h-9 w-9 place-items-center rounded-lg bg-raised text-ink-subtle ring-1 ring-edge-soft hover:text-danger"
        >
          <Trash2 size={16} />
        </button>
      </div>
      {updateError && (
        <p className="border-t border-edge-soft px-5 py-2.5 text-[13px] font-medium text-danger">
          Repository update failed.
        </p>
      )}
      {state === "loading" && (
        <div className="flex items-center justify-center gap-2 border-t border-edge-soft py-8 text-[13.5px] text-ink-subtle">
          <Loader2 size={17} className="animate-spin" /> Loading extensions…
        </div>
      )}
      {state === "error" && (
        <div className="flex items-center justify-center gap-2 border-t border-edge-soft py-8 text-[13.5px] text-ink-muted">
          <AlertCircle size={16} className="text-danger" /> Could not reach this repository.
        </div>
      )}
      {state === "ready" &&
        repo &&
        (repo.plugins.length ? (
          <div className="divide-y divide-edge-soft border-t border-edge-soft">
            {repo.plugins.map((item) => (
              <PluginRow key={item.id} item={item} repoUrl={url} />
            ))}
          </div>
        ) : (
          <div className="border-t border-edge-soft py-8 text-center text-[13.5px] text-ink-muted">
            This repository lists no eBook extensions.
          </div>
        ))}
    </div>
  );
}

function Extensions() {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      await addEBookRepo(url.trim());
      setUrl("");
    } catch {
      setError("Could not load that eBook extension repository");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-3">
      <SectionLabel>Extensions</SectionLabel>
      <div className={`flex flex-col gap-3 px-5 py-4 ${CARD}`}>
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-canvas text-ink-muted ring-1 ring-edge-soft">
            <ShieldCheck size={18} />
          </span>
          <span className="text-[15.5px] font-semibold text-ink">Bring your own extensions</span>
        </div>
        <p className="text-[13.5px] leading-relaxed text-ink-muted">
          eBook extensions use Bear’s isolated worker, HTTP bridge, and HTML parser—the same
          sandbox used by Manga extensions. Only add repositories you trust.
        </p>
      </div>
      <div className={`flex flex-col gap-2.5 px-5 py-4 ${CARD}`}>
        <div className="flex items-center gap-2 text-[13.5px] font-semibold text-ink">
          <Blocks size={16} /> Add a repository
        </div>
        <div className="flex gap-2.5">
          <input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && !busy && void add()}
            placeholder="https://example.com/ebooks.json"
            className={`${INPUT} min-w-0 flex-1`}
          />
          <button
            type="button"
            onClick={() => void add()}
            disabled={busy || !url.trim()}
            className="flex h-12 items-center gap-2 rounded-xl bg-accent px-5 text-[14.5px] font-semibold text-canvas disabled:opacity-60"
          >
            {busy ? <Loader2 size={17} className="animate-spin" /> : <Plus size={17} />} Add
          </button>
        </div>
        {error && <p className="text-[13px] font-medium text-danger">{error}</p>}
      </div>
      {ebookRepoUrls().length ? (
        ebookRepoUrls().map((item) => <RepoCard key={item} url={item} />)
      ) : (
        <p className="px-1 text-[13.5px] text-ink-subtle">
          No repositories yet. Add one above to browse eBook extensions.
        </p>
      )}
    </div>
  );
}

function WorkspaceSection({
  id,
  eyebrow,
  title,
  description,
  icon,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className="ebook-source-workspace-section scroll-mt-6">
      <header className="ebook-source-workspace-heading">
        <span className="ebook-source-workspace-icon">{icon}</span>
        <span className="min-w-0">
          <span className="block text-[11px] font-bold uppercase tracking-[0.2em] text-accent">
            {eyebrow}
          </span>
          <h2 className="mt-1 font-display text-[27px] font-medium tracking-tight text-ink">
            {title}
          </h2>
          <p className="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-ink-muted">
            {description}
          </p>
        </span>
      </header>
      <div className="flex flex-col gap-5">{children}</div>
    </section>
  );
}

export function EBookSourcesView({ onBack }: { onBack: () => void }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    void loadEBookExtensions();
    const bump = () => setTick((value) => value + 1);
    const sources = subscribeEBookSources(bump);
    const extensions = subscribeEBookExtensions(bump);
    return () => {
      sources();
      extensions();
    };
  }, []);
  const sources = useMemo(() => listEBookSources(), [tick]);
  const installed = useMemo(() => installedEBookPlugins(), [tick]);
  const total = sources.length + installed.length;
  const enabled = installed.filter((source) => source.enabled).length;
  const [activeSection, setActiveSection] = useState("ebook-source-library");
  useEffect(() => {
    const sections = [
      "ebook-source-library",
      "ebook-source-intelligence",
      "ebook-source-extensions",
    ]
      .map((id) => document.getElementById(id))
      .filter((element): element is HTMLElement => !!element);
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];
        if (visible?.target.id) setActiveSection(visible.target.id);
      },
      { rootMargin: "-12% 0px -58%", threshold: [0.05, 0.25, 0.6] },
    );
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);
  const jumpTo = (id: string) => {
    setActiveSection(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const contents = [
    {
      id: "ebook-source-library",
      label: "Library",
      sub: `${sources.length + installed.length} connected`,
      icon: <Library size={17} />,
    },
    {
      id: "ebook-source-intelligence",
      label: "Intelligence",
      sub: "Metadata & translation",
      icon: <Sparkles size={17} />,
    },
    {
      id: "ebook-source-extensions",
      label: "Extensions",
      sub: `${ebookRepoUrls().length} repositories`,
      icon: <Blocks size={17} />,
    },
  ];
  return (
    <div
      className="ebook-sources-shell mx-auto flex w-full max-w-[1180px] flex-col gap-7"
      style={{ animation: "harbor-view-in 0.4s cubic-bezier(0.32,0.72,0.24,1) both" }}
    >
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-xl bg-elevated px-4 py-2.5 text-[15px] font-medium text-ink shadow-[0_2px_8px_-2px_rgba(0,0,0,0.4)] ring-1 ring-edge-soft hover:bg-raised active:scale-[0.97]"
        >
          <ChevronLeft size={19} /> Back
        </button>
        {total > 0 && (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-[15px] font-semibold text-canvas active:scale-[0.97]"
          >
            Done <span className="text-canvas/80">· {total}</span>
            <ArrowRight size={18} />
          </button>
        )}
      </div>
      <section className="ebook-sources-hero">
        <div className="ebook-sources-hero-copy">
          <span className="ebook-sources-kicker">
            <BookOpen size={15} /> Bear reading room
          </span>
          <h1 className="font-display text-[clamp(38px,5vw,62px)] font-medium leading-[0.98] tracking-[-0.04em] text-ink">
            Build your own
            <span className="block text-accent">living library.</span>
          </h1>
          <p className="max-w-2xl text-[15px] leading-relaxed text-ink-muted">
            Connect books you own, trusted reading sources, and metadata services. Bear keeps the
            shelf coherent while every source stays under your control.
          </p>
          <div className="ebook-sources-stats" aria-label="Source overview">
            <span><strong>{total}</strong><small>Connected</small></span>
            <span><strong>{enabled}</strong><small>Active</small></span>
            <span><strong>{ebookRepoUrls().length}</strong><small>Repositories</small></span>
          </div>
        </div>
        <div className="ebook-sources-bookplate" aria-hidden="true">
          <div className="ebook-sources-bookplate-mark"><BookOpen size={34} /></div>
          <p>EX LIBRIS</p>
          <strong>BEAR</strong>
          <span>Private reading collection</span>
          <div className="ebook-sources-spines">
            <i /><i /><i /><i /><i />
          </div>
        </div>
      </section>

      <div className="grid items-start gap-7 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="ebook-sources-contents lg:sticky lg:top-4">
          <p className="px-3 pb-3 text-[11px] font-bold uppercase tracking-[0.22em] text-ink-subtle">
            Contents
          </p>
          <nav className="flex flex-col gap-1" aria-label="eBook source settings">
            {contents.map((item, index) => (
              <button
                key={item.id}
                type="button"
                onClick={() => jumpTo(item.id)}
                className={`ebook-sources-content-link ${activeSection === item.id ? "is-active" : ""}`}
              >
                <span className="ebook-sources-content-number">0{index + 1}</span>
                <span className="ebook-sources-content-icon">{item.icon}</span>
                <span className="min-w-0 flex-1 text-start">
                  <strong>{item.label}</strong>
                  <small>{item.sub}</small>
                </span>
              </button>
            ))}
          </nav>
          <div className="ebook-sources-privacy-note">
            <ShieldCheck size={17} />
            <p><strong>Your shelf, your rules.</strong><span>Bear never hosts your books.</span></p>
          </div>
        </aside>

        <div className="flex min-w-0 flex-col gap-7">
          <WorkspaceSection
            id="ebook-source-library"
            eyebrow="01 · Collection"
            title="Library sources"
            description="Manage every place Bear can read from, whether it lives on disk or across the web."
            icon={<Library size={22} />}
          >
            {installed.length > 0 && (
              <div className="flex flex-col gap-3">
                <SectionLabel>Installed sources</SectionLabel>
                <div className={`${CARD} divide-y divide-edge-soft overflow-hidden`}>
                  {installed.map((source) => (
                    <InstalledSourceRow key={source.id} item={source} />
                  ))}
                </div>
              </div>
            )}
            {sources.length > 0 && (
              <div className="flex flex-col gap-3">
                <SectionLabel>Your sources</SectionLabel>
                {sources.map((source) => (
                  <SourceRow key={source.id} source={source} />
                ))}
              </div>
            )}
            <div className="flex flex-col gap-3">
              <SectionLabel>Bring your own</SectionLabel>
              <div className="grid gap-3 xl:grid-cols-2">
                <LocalFolder />
                <CustomSource />
              </div>
            </div>
          </WorkspaceSection>

          <WorkspaceSection
            id="ebook-source-intelligence"
            eyebrow="02 · Enrichment"
            title="Library intelligence"
            description="Shape the metadata and reading language Bear uses without changing your original files."
            icon={<Database size={22} />}
          >
            <MetadataProviders />
            <Translation />
          </WorkspaceSection>

          <WorkspaceSection
            id="ebook-source-extensions"
            eyebrow="03 · Expand"
            title="Extension dock"
            description="Bring trusted source packages aboard through Bear’s isolated extension worker."
            icon={<Blocks size={22} />}
          >
            <Extensions />
            <PluginGuide kind="ebook" />
          </WorkspaceSection>
        </div>
      </div>
    </div>
  );
}
