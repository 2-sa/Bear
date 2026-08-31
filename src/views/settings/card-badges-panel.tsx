import { useEffect, useState } from "react";
import { Bookmark, Popcorn } from "lucide-react";
import { useHydratedPoster, useSampleArtwork } from "@/lib/sample-artwork";
import previewPoster3 from "@/assets/preview/poster3.webp";
import letterboxdLogo from "@/assets/addon-logos/letterboxd.png";
import mdblistLogo from "@/assets/addon-logos/mdblist.png";
import traktLogo from "@/assets/trakt.svg";
import simklLogo from "@/assets/simkl.png";
import tmdbLogo from "@/assets/addon-logos/tmdb.png";
import { ImdbIcon } from "@/components/icons/imdb-icon";
import { MalLogo } from "@/components/icons/mal-logo";
import { RtFresh } from "@/components/icons/rt-fresh";
import type { Settings } from "@/lib/settings";
import { useT } from "@/lib/i18n";

export type PreviewFlags = {
  showImdb: boolean;
  showTmdb: boolean;
  showRt: boolean;
  showPopcorn: boolean;
  showMetacritic: boolean;
  showLetterboxd: boolean;
  showMdblist: boolean;
  showTrakt: boolean;
  showMal: boolean;
  showSimkl: boolean;
};

type WatchlistPos = "off" | "topStart" | "topEnd" | "bottomStart" | "bottomEnd";

const WL_PREVIEW_POS: Record<string, string> = {
  topStart: "top-1.5 start-1.5",
  topEnd: "top-1.5 end-1.5",
  bottomStart: "bottom-1.5 start-1.5",
  bottomEnd: "bottom-1.5 end-1.5",
};

function previewExtras(f: PreviewFlags): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  if (f.showPopcorn)
    out.push(
      <span className="flex items-center gap-0.5">
        <Popcorn size={11} strokeWidth={2.4} className="text-accent" />
        <span>85%</span>
      </span>,
    );
  if (f.showMetacritic)
    out.push(
      <span className="flex h-[12px] min-w-[14px] items-center justify-center rounded-[3px] bg-emerald-500 px-0.5 text-[8px] font-bold text-white">
        78
      </span>,
    );
  if (f.showLetterboxd)
    out.push(
      <span className="flex items-center gap-0.5">
        <img src={letterboxdLogo} alt="" className="h-[10px] w-[10px] rounded-[2px] object-cover" />
        <span>4.2</span>
      </span>,
    );
  if (f.showMdblist)
    out.push(
      <span className="flex items-center gap-0.5">
        <img src={mdblistLogo} alt="" className="h-[10px] w-[10px] rounded-[2px] object-contain" />
        <span>76</span>
      </span>,
    );
  if (f.showTrakt)
    out.push(
      <span className="flex items-center gap-0.5">
        <img src={traktLogo} alt="" className="h-[10px] w-[10px] object-contain" />
        <span>88%</span>
      </span>,
    );
  if (f.showSimkl)
    out.push(
      <span className="flex items-center gap-0.5">
        <img src={simklLogo} alt="" className="h-[10px] w-[10px] rounded-[2px] object-contain" />
        <span>8.5</span>
      </span>,
    );
  return out;
}

function PreviewBadgeRow({
  nodes,
  badgePos,
  visible,
}: {
  nodes: React.ReactNode[];
  badgePos: string;
  visible: boolean;
}) {
  if (nodes.length === 0) return null;
  const scale = nodes.length <= 3 ? 1 : nodes.length === 4 ? 0.88 : nodes.length === 5 ? 0.78 : 0.7;
  return (
    <div
      style={scale < 1 ? { transform: `scale(${scale})`, transformOrigin: "right" } : undefined}
      className={`absolute end-1.5 flex items-center gap-1 whitespace-nowrap rounded-md bg-canvas/95 px-1.5 py-0.5 text-[9px] font-semibold text-ink transition-opacity duration-700 ease-in-out ${badgePos} ${
        visible ? "opacity-100" : "opacity-0"
      }`}
    >
      {nodes.map((node, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <span className="opacity-30">·</span>}
          {node}
        </span>
      ))}
    </div>
  );
}

function PreviewCard({
  position,
  phase,
  flags,
  watchlistBadge,
  limit,
}: {
  position: "top" | "bottom";
  phase: "normal" | "anime";
  flags: PreviewFlags;
  watchlistBadge: WatchlistPos;
  limit: number;
}) {
  const normalPoster = useSampleArtwork().poster;
  const animePoster = useHydratedPoster("tt0245429", previewPoster3);
  const extras = previewExtras(flags);
  const normal: React.ReactNode[] = [];
  if (flags.showImdb)
    normal.push(
      <span className="flex items-center gap-1">
        <ImdbIcon className="h-[10px] w-auto rounded-[2px]" />
        <span>8.4</span>
      </span>,
    );
  else if (flags.showTmdb)
    normal.push(
      <span className="flex items-center gap-1">
        <img src={tmdbLogo} alt="" className="h-[11px] w-auto object-contain" />
        <span>7.9</span>
      </span>,
    );
  if (flags.showRt)
    normal.push(
      <span className="flex items-center gap-0.5">
        <RtFresh className="h-[11px] w-auto" />
        <span>92%</span>
      </span>,
    );
  normal.push(...extras);

  const anime: React.ReactNode[] = [];
  if (flags.showMal)
    anime.push(
      <span className="flex items-center gap-0.5">
        <MalLogo className="h-[10px] w-auto text-ink-muted" />
        <span>8.7</span>
      </span>,
    );
  anime.push(...extras);

  const cap = Math.max(1, limit);
  const badgePos = position === "top" ? "top-1.5" : "bottom-1.5";
  return (
    <div className="relative aspect-[2/3] w-full overflow-hidden rounded-xl shadow-[0_10px_28px_-8px_rgba(0,0,0,0.6)] ring-1 ring-edge-soft/60">
      <img
        src={normalPoster}
        alt=""
        draggable={false}
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ease-in-out ${
          phase === "normal" ? "opacity-100" : "opacity-0"
        }`}
      />
      <img
        src={animePoster}
        alt=""
        draggable={false}
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ease-in-out ${
          phase === "anime" ? "opacity-100" : "opacity-0"
        }`}
      />
      <PreviewBadgeRow nodes={normal.slice(0, cap)} badgePos={badgePos} visible={phase === "normal"} />
      <PreviewBadgeRow nodes={anime.slice(0, cap)} badgePos={badgePos} visible={phase === "anime"} />
      {watchlistBadge !== "off" && (
        <span
          className={`absolute z-10 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-canvas/85 text-ink ring-1 ring-edge-soft/70 ${WL_PREVIEW_POS[watchlistBadge]}`}
        >
          <Bookmark size={9} strokeWidth={2.6} fill="currentColor" />
        </span>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">{label}</span>
      {children}
    </div>
  );
}

function Choice({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`h-9 rounded-lg border px-3.5 text-[13px] font-semibold transition-colors ${
        disabled
          ? "cursor-not-allowed border-edge-soft/40 bg-canvas/30 text-ink-subtle/40"
          : active
            ? "border-accent bg-accent/15 text-accent"
            : "border-edge-soft bg-canvas/60 text-ink-muted hover:border-edge hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

export function WatchlistControl({
  value,
  onChange,
}: {
  value: WatchlistPos;
  onChange: (v: WatchlistPos) => void;
}) {
  const t = useT();
  const on = value !== "off";
  const [last, setLast] = useState<Exclude<WatchlistPos, "off">>(value !== "off" ? value : "topEnd");
  const corners: Array<{ v: Exclude<WatchlistPos, "off">; label: string }> = [
    { v: "topStart", label: t("Top left") },
    { v: "topEnd", label: t("Top right") },
    { v: "bottomStart", label: t("Bottom left") },
    { v: "bottomEnd", label: t("Bottom right") },
  ];
  return (
    <div className="flex flex-col gap-2.5">
      <button
        type="button"
        onClick={() => onChange(on ? "off" : last)}
        className="flex items-center justify-between gap-4 rounded-xl border border-edge-soft bg-canvas/60 px-3.5 py-2.5 text-start transition-colors hover:border-edge"
      >
        <span className="flex items-center gap-2 text-[13px] font-medium text-ink">
          <Bookmark size={14} strokeWidth={2.2} className="text-ink-muted" />
          {t("Show a bookmark on saved titles")}
        </span>
        <span
          aria-hidden
          className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${on ? "bg-ink" : "bg-edge"}`}
        >
          <span
            className={`absolute start-[2px] top-0.5 h-5 w-5 rounded-full bg-canvas transition-transform ${
              on ? "translate-x-4 rtl:-translate-x-4" : "translate-x-0"
            }`}
          />
        </span>
      </button>
      {on && (
        <div className="grid grid-cols-2 gap-1.5">
          {corners.map((c) => {
            const active = value === c.v;
            return (
              <button
                key={c.v}
                type="button"
                onClick={() => {
                  setLast(c.v);
                  onChange(c.v);
                }}
                className={`h-9 rounded-lg border text-[12.5px] font-semibold transition-colors ${
                  active
                    ? "border-accent bg-accent/15 text-accent"
                    : "border-edge-soft bg-canvas/60 text-ink-muted hover:border-edge hover:text-ink"
                }`}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function CardBadgesPanel({
  settings,
  update,
  flags,
  enabledBadgeCount,
}: {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  flags: PreviewFlags;
  enabledBadgeCount: number;
}) {
  const t = useT();
  const [phase, setPhase] = useState<"normal" | "anime">("normal");
  useEffect(() => {
    const id = window.setInterval(() => setPhase((p) => (p === "normal" ? "anime" : "normal")), 4000);
    return () => window.clearInterval(id);
  }, []);
  const placement: "top" | "bottom" = settings.badgePlacement === "top" ? "top" : "bottom";
  const maxN = Math.max(2, enabledBadgeCount);
  const effLimit = Math.min(settings.cardBadgeLimit, maxN);

  return (
    <div className="flex flex-col gap-6 rounded-2xl border border-edge-soft bg-canvas/40 p-5 sm:flex-row sm:items-start sm:gap-7">
      <div className="mx-auto w-36 shrink-0 sm:mx-0">
        <PreviewCard
          position={placement}
          phase={phase}
          flags={flags}
          watchlistBadge={settings.watchlistBadge}
          limit={effLimit}
        />
        <p className="mt-2.5 text-center text-[11px] font-medium uppercase tracking-[0.14em] text-ink-subtle">
          {t("Live preview")}
        </p>
      </div>

      <div className="flex flex-1 flex-col gap-5">
        <Field label={t("Score position")}>
          <div className="flex gap-2">
            <Choice active={placement === "top"} onClick={() => update({ badgePlacement: "top" })}>
              {t("Top")}
            </Choice>
            <Choice active={placement === "bottom"} onClick={() => update({ badgePlacement: "bottom" })}>
              {t("Bottom")}
            </Choice>
          </div>
        </Field>

        <Field label={t("Max scores per card")}>
          <div className="flex flex-wrap items-center gap-2">
            {[2, 3, 4, 5, 6].map((n) => (
              <Choice
                key={n}
                active={effLimit === n}
                disabled={n > maxN}
                onClick={() => update({ cardBadgeLimit: n })}
              >
                {n}
              </Choice>
            ))}
            <span className="ms-1 text-[12px] text-ink-subtle">
              {t("{n} enabled", { n: enabledBadgeCount })}
            </span>
          </div>
        </Field>

        <Field label={t("Watchlist bookmark")}>
          <WatchlistControl
            value={settings.watchlistBadge}
            onChange={(v) => update({ watchlistBadge: v })}
          />
        </Field>

        <Field label={t("Watched badge")}>
          <div className="flex gap-2">
            <Choice
              active={settings.showWatchedBadge}
              onClick={() => update({ showWatchedBadge: true })}
            >
              {t("On")}
            </Choice>
            <Choice
              active={!settings.showWatchedBadge}
              onClick={() => update({ showWatchedBadge: false })}
            >
              {t("Off")}
            </Choice>
          </div>
        </Field>
      </div>
    </div>
  );
}
