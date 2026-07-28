import { AlignLeft, HelpCircle, Image as ImageIcon, Lock, Popcorn, Sparkles } from "lucide-react";
import { HoverTooltip } from "@/components/hover-tooltip";
import tmdbLogo from "@/assets/addon-logos/tmdb.png";
import letterboxdLogo from "@/assets/addon-logos/letterboxd.png";
import mdblistLogo from "@/assets/addon-logos/mdblist.png";
import traktLogo from "@/assets/trakt.svg";
import simklLogo from "@/assets/simkl.png";
import { ImdbIcon } from "@/components/icons/imdb-icon";
import { MalLogo } from "@/components/icons/mal-logo";
import { RtFresh } from "@/components/icons/rt-fresh";
import { RtRotten } from "@/components/icons/rt-rotten";
import type { Settings } from "@/lib/settings";
import { useT } from "@/lib/i18n";

export function ImdbBadge({ compact = false }: { compact?: boolean } = {}) {
  return (
    <ImdbIcon
      className={`shrink-0 rounded-[3px] shadow-[0_1px_2px_rgba(0,0,0,0.25)] ${compact ? "h-[18px]" : "h-7"} w-auto`}
    />
  );
}

export function MalBadge({ compact = false }: { compact?: boolean } = {}) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-md text-white shadow-[0_1px_2px_rgba(0,0,0,0.25)] ${
        compact ? "h-[18px] w-10 px-1.5" : "h-7 w-[52px] px-2.5"
      }`}
      style={{ background: "#2E51A2" }}
    >
      <MalLogo className={compact ? "h-2.5 w-auto" : "h-[14px] w-auto"} />
    </span>
  );
}

function TmdbBadge() {
  return <img src={tmdbLogo} alt="" className="h-7 w-7 shrink-0 rounded-md object-contain" />;
}

function RtPairBadge() {
  return (
    <span className="flex shrink-0 items-center -space-x-2">
      <span className="relative z-10 flex h-9 w-9 items-center justify-center rounded-full bg-canvas/80 shadow-[0_2px_6px_rgba(0,0,0,0.25)] ring-1 ring-edge-soft">
        <RtFresh className="h-5 w-5" />
      </span>
      <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-canvas/80 shadow-[0_2px_6px_rgba(0,0,0,0.25)] ring-1 ring-edge-soft">
        <RtRotten className="h-5 w-5" />
      </span>
    </span>
  );
}

function PopcornBadge() {
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-canvas ring-1 ring-edge-soft">
      <Popcorn size={15} strokeWidth={2.2} className="text-accent" />
    </span>
  );
}

function MetacriticBadge() {
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-emerald-500 text-[14px] font-bold text-white shadow-[0_1px_2px_rgba(0,0,0,0.25)]">
      M
    </span>
  );
}

function LetterboxdBadge() {
  return <img src={letterboxdLogo} alt="" className="h-7 w-7 shrink-0 rounded-md object-cover shadow-[0_1px_2px_rgba(0,0,0,0.25)]" />;
}

function MdblistBadge() {
  return <img src={mdblistLogo} alt="" className="h-7 w-7 shrink-0 rounded-md object-contain" />;
}

function TraktBadge() {
  return <img src={traktLogo} alt="" className="h-7 w-7 shrink-0 object-contain" />;
}

function SimklBadge() {
  return <img src={simklLogo} alt="" className="h-7 w-7 shrink-0 rounded-md object-contain" />;
}

type BoolKey = {
  [K in keyof Settings]: Settings[K] extends boolean ? K : never;
}[keyof Settings];

type Source = {
  id: string;
  name: string;
  badge: React.ReactNode;
  cardKey: BoolKey;
  detailKey?: BoolKey;
  lockKey?: "tmdb" | "omdb" | "mdblist";
  anime?: boolean;
  note?: string;
};

function MiniToggle({
  on,
  disabled,
  label,
  onClick,
}: {
  on: boolean;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      aria-pressed={on}
      className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${
        disabled ? "cursor-not-allowed bg-edge/40 opacity-45" : on ? "bg-ink" : "bg-edge hover:bg-edge/80"
      }`}
    >
      <span
        className={`absolute start-[2px] top-0.5 h-5 w-5 rounded-full bg-canvas transition-transform ${
          on ? "translate-x-4 rtl:-translate-x-4" : "translate-x-0"
        }`}
      />
    </button>
  );
}

export function RatingsMatrix({
  settings,
  update,
}: {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
}) {
  const t = useT();

  const lockReason = (key?: "tmdb" | "omdb" | "mdblist"): string | null => {
    if (key === "tmdb") return settings.tmdbKey ? null : t("Add a TMDB key above to unlock.");
    if (key === "omdb") return settings.omdbKey ? null : t("Add an OMDb key above to unlock.");
    if (key === "mdblist") return settings.mdblistKey ? null : t("Add an MDBList key above to unlock.");
    return null;
  };

  const sources: Source[] = [
    { id: "imdb", name: "IMDb", badge: <ImdbBadge />, cardKey: "showImdbBadge", detailKey: "showImdbDetail", lockKey: "tmdb" },
    { id: "tmdb", name: "TMDB", badge: <TmdbBadge />, cardKey: "showTmdbBadge", detailKey: "showTmdbDetail", lockKey: "tmdb", note: t("The TMDB community score.") },
    { id: "rt", name: t("Rotten Tomatoes"), badge: <RtPairBadge />, cardKey: "showRtBadge", detailKey: "showRtDetail", lockKey: "omdb" },
    { id: "audience", name: t("Audience"), badge: <PopcornBadge />, cardKey: "showPopcornBadge", detailKey: "showRtAudienceDetail", lockKey: "mdblist" },
    { id: "metacritic", name: "Metacritic", badge: <MetacriticBadge />, cardKey: "showMetacriticBadge", detailKey: "showMetacriticDetail", lockKey: "mdblist" },
    { id: "letterboxd", name: "Letterboxd", badge: <LetterboxdBadge />, cardKey: "showLetterboxdBadge", detailKey: "showLetterboxdDetail", lockKey: "mdblist" },
    { id: "mdblist", name: "MDBList", badge: <MdblistBadge />, cardKey: "showMdblistBadge", detailKey: "showMdblistDetail", lockKey: "mdblist" },
    { id: "trakt", name: "Trakt", badge: <TraktBadge />, cardKey: "showTraktBadge", detailKey: "showTraktDetail", lockKey: "mdblist" },
    { id: "simkl", name: "SIMKL", badge: <SimklBadge />, cardKey: "showSimklBadge", detailKey: "showSimklDetail" },
    { id: "mal", name: "MAL", badge: <MalBadge />, cardKey: "showMalBadge", detailKey: "showMalDetail", anime: true },
  ];

  const setCard = (src: Source, next: boolean) => {
    if (src.id === "simkl") update({ showSimklBadge: next, simklShowCommunityRatings: next });
    else update({ [src.cardKey]: next } as Partial<Settings>);
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-1 px-1">
        <span className="text-[13.5px] font-semibold text-ink">{t("Where scores appear")}</span>
        <span className="text-[12px] leading-snug text-ink-subtle">
          {t("Give each score a home: on poster cards, on the detail page, or both. Flip the switch in each column.")}
        </span>
        <span className="mt-0.5 flex items-center gap-1.5 text-[11.5px] leading-snug text-ink-subtle/90">
          <Sparkles size={12} strokeWidth={2.2} className="shrink-0 text-accent/80" />
          <span>{t("Native to Bear. No RPDB or ratings addon needed.")}</span>
          <HoverTooltip
            side="top"
            align="center"
            label={t("These badges are drawn on posters as you browse. RPDB, in the keys above, is a separate option that bakes scores into the poster image itself.")}
          >
            <span className="flex h-3.5 w-3.5 cursor-help items-center justify-center text-ink-subtle/60 transition-colors hover:text-ink">
              <HelpCircle size={12} strokeWidth={2} />
            </span>
          </HoverTooltip>
        </span>
      </div>

      <div className="flex items-center gap-3.5 px-4">
        <span className="flex-1 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">
          {t("Rating")}
        </span>
        <HoverTooltip
          side="top"
          align="center"
          label={t("The little score chip printed on poster cards across your rows and grids.")}
        >
          <span className="flex w-10 cursor-help flex-col items-center gap-1 text-ink-subtle">
            <ImageIcon size={14} strokeWidth={2} />
            <span className="text-[9.5px] font-semibold uppercase tracking-[0.1em]">{t("Cards")}</span>
          </span>
        </HoverTooltip>
        <HoverTooltip
          side="top"
          align="center"
          label={t("The ratings row on a title's detail page, next to runtime and genre.")}
        >
          <span className="flex w-10 cursor-help flex-col items-center gap-1 text-ink-subtle">
            <AlignLeft size={14} strokeWidth={2} />
            <span className="text-[9.5px] font-semibold uppercase tracking-[0.1em]">{t("Details")}</span>
          </span>
        </HoverTooltip>
      </div>

      <div className="flex flex-col divide-y divide-edge-soft/40 overflow-hidden rounded-2xl border border-edge-soft/60 bg-canvas/30">
        {sources.map((src) => {
          const lock = lockReason(src.lockKey);
          const cardVal = settings[src.cardKey] === true;
          const detailVal = src.detailKey ? settings[src.detailKey] === true : false;
          const subText = lock ?? src.note;
          return (
            <div key={src.id} className={`flex items-center gap-3.5 px-4 py-2.5 ${lock ? "opacity-60" : ""}`}>
              <span className={`relative ${lock ? "saturate-50" : ""}`}>
                {src.badge}
                {lock && (
                  <span className="absolute -bottom-1 -end-1 flex h-4 w-4 items-center justify-center rounded-full bg-canvas text-ink-subtle ring-1 ring-edge">
                    <Lock size={9} strokeWidth={2.4} />
                  </span>
                )}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex items-center gap-1.5 text-[13.5px] font-medium text-ink">
                  {src.name}
                  {src.anime && (
                    <span className="rounded-full bg-elevated px-1.5 py-[1px] text-[9.5px] font-semibold uppercase tracking-wide text-ink-subtle ring-1 ring-edge-soft/60">
                      {t("Anime")}
                    </span>
                  )}
                </span>
                {subText && (
                  <span className={`text-[11.5px] leading-snug ${lock ? "text-accent/85" : "text-ink-subtle"}`}>
                    {subText}
                  </span>
                )}
              </div>
              <MiniToggle
                on={cardVal && !lock}
                disabled={!!lock}
                label={`${src.name} ${t("Cards")}`}
                onClick={() => setCard(src, !cardVal)}
              />
              {src.detailKey ? (
                <MiniToggle
                  on={detailVal}
                  label={`${src.name} ${t("Details")}`}
                  onClick={() => update({ [src.detailKey!]: !detailVal, showDetailRatings: true } as Partial<Settings>)}
                />
              ) : (
                <HoverTooltip
                  side="top"
                  align="center"
                  label={t("This score only appears on cards.")}
                >
                  <span className="flex h-6 w-10 shrink-0 cursor-help items-center justify-center rounded-full bg-edge/25 ring-1 ring-edge-soft/40">
                    <span className="h-[3px] w-3 rounded-full bg-ink-subtle/45" />
                  </span>
                </HoverTooltip>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
