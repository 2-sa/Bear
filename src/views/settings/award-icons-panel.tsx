import { RotateCcw, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { defaultAwardIcon } from "@/components/icons/award-logo";
import { useT } from "@/lib/i18n";
import {
  AWARD_ICON_REGISTRY,
  clearCustomIcon,
  installPackFromFiles,
  installPackFromUrl,
  installPackFromZip,
  removePack,
  resolveAwardIcon,
  setCustomIcon,
  useAwardPacks,
} from "@/lib/award-icons";
function pickAndUpload(key: string) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/png,image/webp,image/jpeg,image/svg+xml";
  input.onchange = () => {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const src = reader.result as string;
      if (file.type === "image/svg+xml") {
        setCustomIcon(key, src);
        return;
      }
      const img = new Image();
      img.onload = () => {
        const max = 128;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d")?.drawImage(img, 0, 0, w, h);
        setCustomIcon(key, canvas.toDataURL("image/png"));
      };
      img.onerror = () => setCustomIcon(key, src);
      img.src = src;
    };
    reader.readAsDataURL(file);
  };
  input.click();
}

export function AwardIconsPanel() {
  const t = useT();
  const { packs, custom } = useAwardPacks();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const packUrlRef = useRef<HTMLInputElement>(null);

  const copyFilename = (key: string) => {
    navigator.clipboard?.writeText(`${key}.png`).catch(() => {});
    setCopied(key);
    window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 1200);
  };

  const [zipMsg, setZipMsg] = useState<string | null>(null);

  const install = async () => {
    if (!url.trim()) return;
    setBusy(true);
    setErr(null);
    setZipMsg(null);
    try {
      await installPackFromUrl(url.trim());
      setUrl("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Install failed");
    } finally {
      setBusy(false);
    }
  };

  const importZip = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".zip,application/zip";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      setBusy(true);
      setErr(null);
      setZipMsg(null);
      try {
        const r = await installPackFromZip(file);
        setZipMsg(
          `${t("Imported")} ${r.matched}${r.unmatched.length ? ` · ${t("skipped")} ${r.unmatched.length}` : ""}`,
        );
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Import failed");
      } finally {
        setBusy(false);
      }
    };
    input.click();
  };

  const uploadMultiple = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/webp,image/jpeg,image/svg+xml";
    input.multiple = true;
    input.onchange = async () => {
      const files = Array.from(input.files ?? []);
      if (files.length === 0) return;
      setBusy(true);
      setErr(null);
      setZipMsg(null);
      try {
        const r = await installPackFromFiles(files);
        setZipMsg(
          `${t("Imported")} ${r.matched}${r.unmatched.length ? ` · ${t("skipped")} ${r.unmatched.length}` : ""}`,
        );
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Import failed");
      } finally {
        setBusy(false);
      }
    };
    input.click();
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1.5">
        <h2 className="text-[22px] font-medium tracking-tight text-ink">{t("Award Icons")}</h2>
        <p className="max-w-2xl text-[14px] leading-relaxed text-ink-muted">
          {t(
            "Bear ships a neutral trophy for every award. Install an icon pack or upload your own image per award to make them yours. Packs are hosted by whoever makes them, so the artwork is theirs, not bundled with Bear.",
          )}
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h3 className="text-[14px] font-semibold text-ink">{t("Install a pack")}</h3>
        <div className="flex gap-2">
          <input
            ref={packUrlRef}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && install()}
            placeholder="https://example.com/my-award-pack.json"
            className="h-11 flex-1 rounded-lg border border-edge bg-surface px-3.5 text-[14px] text-ink outline-none placeholder:text-ink-subtle focus:border-accent"
          />
          <button
            type="button"
            onClick={install}
            disabled={busy || !url.trim()}
            className="h-11 rounded-lg bg-accent px-5 text-[13px] font-semibold text-canvas transition-colors hover:bg-accent/90 disabled:opacity-40"
          >
            {busy ? t("Installing...") : t("Install")}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={uploadMultiple}
            disabled={busy}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-edge bg-surface px-4 text-[13px] font-medium text-ink transition-colors hover:bg-elevated disabled:opacity-40"
          >
            <Upload size={14} />
            {t("Upload multiple images")}
          </button>
          <button
            type="button"
            onClick={importZip}
            disabled={busy}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-edge bg-surface px-4 text-[13px] font-medium text-ink transition-colors hover:bg-elevated disabled:opacity-40"
          >
            <Upload size={14} />
            {t("Import a .zip pack")}
          </button>
          {zipMsg && <span className="text-[12.5px] text-ink-muted">{zipMsg}</span>}
        </div>
        {err && <p className="text-[12.5px] text-danger">{err}</p>}
        {packs.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="mt-1 text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-subtle">
              {t("Installed packs")}
            </span>
            {packs.map((p) => (
              <div
                key={p.name}
                className="flex items-center justify-between gap-3 rounded-lg border border-edge-soft bg-surface/60 px-3.5 py-2.5"
              >
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-[13.5px] font-medium text-ink">{p.name}</span>
                  <span className="truncate text-[11.5px] text-ink-subtle">
                    {[p.author, `${Object.keys(p.icons).length} icons`].filter(Boolean).join(" · ")}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => removePack(p.name)}
                  aria-label={t("Remove")}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-elevated hover:text-danger"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-5">
        <h3 className="text-[14px] font-semibold text-ink">{t("Customize each award")}</h3>
        <p className="-mt-2.5 text-[12.5px] leading-relaxed text-ink-muted">
          {t(
            "Upload an image per award, or name your zip files after the ID shown under each one (tap to copy). Natural names work too, so best_soundtrack, movie_of_the_year, etc. still match.",
          )}
        </p>
        {AWARD_ICON_REGISTRY.map((group) => (
          <div key={group.title} className="flex flex-col gap-2.5">
            <span className="text-[12px] font-semibold uppercase tracking-[0.1em] text-ink-subtle">
              {t(group.title)}
            </span>
            <div className="grid grid-cols-2 gap-2 xl:grid-cols-3">
              {group.items.map((item) => {
                const icon = resolveAwardIcon(item.key) ?? defaultAwardIcon(item.key);
                const isCustom = item.key in custom;
                return (
                  <div
                    key={item.key}
                    className="flex items-center gap-2.5 rounded-lg border border-edge-soft bg-surface/50 px-2.5 py-2"
                  >
                    <img
                      src={icon}
                      alt=""
                      className="h-8 w-8 shrink-0 rounded object-contain"
                      draggable={false}
                    />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[12.5px] leading-tight text-ink">
                        {t(item.label)}
                      </span>
                      <button
                        type="button"
                        onClick={() => copyFilename(item.key)}
                        title={t("Copy filename")}
                        className="truncate text-start font-mono text-[10px] text-ink-subtle transition-colors hover:text-accent"
                      >
                        {copied === item.key ? t("copied!") : `${item.key}.png`}
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => pickAndUpload(item.key)}
                      aria-label={t("Upload")}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-elevated hover:text-ink"
                    >
                      <Upload size={13.5} />
                    </button>
                    {isCustom && (
                      <button
                        type="button"
                        onClick={() => clearCustomIcon(item.key)}
                        aria-label={t("Reset")}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-elevated hover:text-ink"
                      >
                        <RotateCcw size={13} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-3">
        <button
          type="button"
          onClick={() => setShowHelp((v) => !v)}
          className="self-start text-[13px] font-semibold text-accent transition-colors hover:text-accent/80"
        >
          {showHelp ? t("Hide pack instructions") : t("How to make an award pack")}
        </button>
        {showHelp && (
          <div className="flex flex-col gap-3 rounded-xl border border-edge-soft bg-surface/50 p-4 text-[13.5px] leading-relaxed text-ink-muted">
            <p>
              {t(
                "An award pack is a single JSON file plus the images it points to. Host both anywhere public (your own server, a GitHub repo, etc.) and share the JSON URL. Bear only stores the URLs you install, never the images.",
              )}
            </p>
            <pre className="overflow-x-auto rounded-lg bg-canvas/70 p-3 text-[12px] text-ink">{`{
  "name": "My Award Pack",
  "author": "you",
  "version": "1.0",
  "icons": {
    "oscar": "https://your-host.com/oscar.png",
    "emmy": "https://your-host.com/emmy.png",
    "crunchyroll": "https://your-host.com/cr.png",
    "best_romance": "https://your-host.com/romance.png"
  }
}`}</pre>
            <p>
              {t(
                "Each key above is an award ID. Any key you omit falls back to the default trophy (or a lower-priority pack). The full list of IDs is every award shown in the grid above.",
              )}
            </p>
            <p className="font-semibold text-ink">{t("Or just zip up images")}</p>
            <p>
              {t(
                "Name each image file after its award ID and put them in a .zip, then use \"Import a .zip pack\" above. No JSON, no hosting needed. Bear matches each file to its award, stores it locally, resizes it, and skips anything it doesn't recognize.",
              )}
            </p>
            <pre className="overflow-x-auto rounded-lg bg-canvas/70 p-3 text-[12px] text-ink">{`my-pack.zip
├─ oscar.png
├─ emmy.png
├─ crunchyroll.png
└─ best_romance.png`}</pre>
          </div>
        )}
      </section>
    </div>
  );
}
