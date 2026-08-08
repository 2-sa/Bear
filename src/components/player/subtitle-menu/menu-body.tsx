import { Check, FolderOpen, Languages, Loader2, Search as SearchIcon, SlidersHorizontal, Timer, Wand2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Flag } from "@/components/flag";
import { hasImportedSubTitle, markImportedSub, useImportedSubs } from "@/lib/player/imported-subs";
import { useT } from "@/lib/i18n";
import { openSyncBar } from "@/lib/player/sub-sync";
import { useAutoSyncHandle } from "@/components/player/autosync/autosync-store";
import { Tooltip } from "../transport/tooltip";
import { filterTracksByPreferredLanguage } from "@/lib/subtitles/language";
import { SearchSection } from "./search-section";
import { VariantRow } from "./variant-row";
import { Count, EmptyState, ImportBanner, Tab, ToggleChip } from "./menu-body-parts";
import type { SubtitleMenuProps } from "./types";
import { groupByLang, isVeryNewRelease } from "./utils";

type SourceFilter = "all" | "embedded" | "external";
const ALL_LANGS = "__all__";

export function MenuBody(props: SubtitleMenuProps & { onClose: () => void }) {
  const tr = useT();
  const { tracks, selectedId, onSelect, onClose, delaySec, metaReleaseDate, onOpenStyleBar } =
    props;
  const preferredLanguages = props.preferredLanguages ?? [];
  const importedTitles = useImportedSubs();
  const languageTracks = useMemo(() => {
    const filtered = filterTracksByPreferredLanguage(tracks, preferredLanguages);

    const keep = new Set(filtered);
    for (const t of tracks) {
      const isImported = hasImportedSubTitle(t.title) || importedTitles.has(t.title ?? "");
      if (isImported || t.id === props.selectedId) keep.add(t);
    }
    return tracks.filter((t) => keep.has(t));
  }, [tracks, preferredLanguages, importedTitles, props.selectedId]);
  const groups = useMemo(() => groupByLang(languageTracks), [languageTracks]);
  const [searchSettled, setSearchSettled] = useState(false);
  const [activeLang, setActiveLang] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [hideHI, setHideHI] = useState(false);
  const [forcedOnly, setForcedOnly] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [justImported, setJustImported] = useState<string | null>(null);

  useEffect(() => {
    if (languageTracks.length > 0) return;
    setSearchSettled(false);
    const timer = setTimeout(() => setSearchSettled(true), 9000);
    return () => clearTimeout(timer);
  }, [languageTracks.length]);

  useEffect(() => {
    if (groups.length === 0) {
      setActiveLang(null);
      return;
    }
    if (activeLang === ALL_LANGS) return;
    if (!activeLang || !groups.some((g) => g.langKey === activeLang)) {
      const sel = groups.find((g) => g.variants.some((v) => v.id === selectedId));
      setActiveLang(sel?.langKey ?? groups[0].langKey);
    }
  }, [groups, activeLang, selectedId]);

  const veryNewMovie = useMemo(() => isVeryNewRelease(metaReleaseDate), [metaReleaseDate]);
  const allLangs = activeLang === ALL_LANGS;
  const activeGroup = useMemo(
    () => groups.find((g) => g.langKey === activeLang) ?? null,
    [groups, activeLang],
  );
  const visibleVariants = useMemo(() => {
    const list = allLangs ? languageTracks : (activeGroup?.variants ?? []);
    return list.filter((t) => {
      if (sourceFilter === "embedded" && t.external) return false;
      if (sourceFilter === "external" && !t.external) return false;
      if (hideHI && t.hearingImpaired) return false;
      if (forcedOnly && !t.forced) return false;
      return true;
    });
  }, [allLangs, languageTracks, activeGroup, sourceFilter, hideHI, forcedOnly]);

  const totalEmbedded = languageTracks.filter((t) => !t.external).length;
  const totalExternal = languageTracks.filter((t) => t.external).length;
  const offSelected = selectedId == null;
  const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  const [localError, setLocalError] = useState<string | null>(null);
  const delayNonZero = delaySec !== 0;
  const autoSync = useAutoSyncHandle();
  const selectedTrack = useMemo(() => tracks.find((t) => t.id === selectedId) ?? null, [tracks, selectedId]);
  const autoSyncBusy = autoSync?.status === "analyzing";
  const autoSyncApplied = autoSync?.status === "synced" || autoSync?.status === "best-effort";
  const autoSyncOn = autoSyncBusy || autoSyncApplied;
  const canAutoSync = selectedTrack?.external === true || autoSyncOn;

  const loadLocal = async () => {
    setLocalError(null);
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const path = await open({
        multiple: false,
        filters: [{ name: "Subtitles", extensions: ["srt", "ass", "ssa", "vtt", "sub"] }],
      });
      if (typeof path !== "string") return;
      const name = path.split(/[\\/]/).pop() || tr("Local subtitle");
      const ok = await props.onAddSubtitle(path, undefined, name);
      if (ok === false) {
        setLocalError(tr("Couldn't load that subtitle file. Try another."));
        return;
      }
      markImportedSub(name);
      setActiveLang(ALL_LANGS);
      setJustImported(name);
      window.setTimeout(() => onClose(), 1700);
    } catch (e) {
      console.warn("[subtitles] local load failed", e);
      setLocalError(tr("Couldn't load that subtitle file. Try another."));
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* ── Header ── */}
      <header className="flex items-center justify-between border-b border-edge-soft px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <span className="text-[13.5px] font-semibold text-ink">{tr("Subtitles")}</span>
          {tracks.length > 0 && (
            <span className="text-[11.5px] tabular-nums text-ink-subtle">
              {languageTracks.length}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <Tooltip
            label={
              autoSyncBusy
                ? tr("Cancel auto-sync")
                : autoSyncApplied
                  ? tr("Turn off auto-sync")
                  : canAutoSync
                    ? tr("Auto-sync this subtitle now")
                    : tr("Pick an external subtitle to auto-sync")
            }
            side="bottom"
            align="end"
          >
            <button
              type="button"
              disabled={!canAutoSync}
              onClick={() => {
                if (!canAutoSync) return;
                if (autoSyncOn) {
                  autoSync?.stop();
                  return;
                }
                autoSync?.run();
                onClose();
              }}
              aria-label={tr("Auto sync")}
              aria-pressed={autoSyncOn}
              className={`flex h-9 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-semibold transition-colors ${
                autoSyncOn
                  ? "bg-accent text-canvas hover:brightness-110"
                  : canAutoSync
                    ? "text-ink-muted hover:bg-raised hover:text-ink"
                    : "cursor-not-allowed text-ink-subtle/50"
              }`}
            >
              {autoSyncBusy ? (
                <Loader2 size={14} strokeWidth={2.4} className="animate-spin motion-reduce:animate-none" />
              ) : (
                <Wand2 size={14} strokeWidth={2.2} />
              )}
              {autoSyncBusy ? tr("Cancel sync") : autoSyncApplied ? tr("Synced: on") : tr("Auto sync")}
            </button>
          </Tooltip>

          {/* ── Sync button → opens the floating player-level bar ── */}
          <Tooltip label={tr("Subtitle sync")} side="bottom" align="end">
            <button
              type="button"
              onClick={() => {
                openSyncBar();
                onClose();
              }}
              aria-label={tr("Subtitle sync")}
              className="relative flex h-9 w-9 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-raised hover:text-ink"
            >
              <Timer size={16} strokeWidth={2} />
              {/* badge when delay is active */}
              {delayNonZero && (
                <span className="absolute end-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-accent" />
              )}
            </button>
          </Tooltip>

          {/* ── Style bar button ── */}
          {onOpenStyleBar && (
            <button
              type="button"
              onClick={() => {
                onOpenStyleBar();
                onClose();
              }}
              aria-label={tr("Subtitle appearance")}
              className="flex h-9 w-9 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-raised hover:text-ink"
            >
              <SlidersHorizontal size={18} strokeWidth={2} />
            </button>
          )}

          <button
            onClick={onClose}
            aria-label={tr("Close")}
            className="flex h-9 w-9 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-raised hover:text-ink"
          >
            <X size={16} strokeWidth={2.2} />
          </button>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="flex min-h-0 flex-1">
        {/* Language sidebar */}
        <aside className="flex w-[128px] shrink-0 flex-col gap-0.5 overflow-y-auto border-e border-edge-soft bg-canvas/30 p-2">
          <button
            onClick={() => {
              if (offSelected) return;
              onSelect(null);
              onClose();
            }}
            disabled={offSelected}
            className={`flex items-center gap-2 rounded-md px-2.5 py-2 text-start text-[12.5px] font-semibold transition-colors ${
              offSelected
                ? "text-ink-subtle"
                : "bg-elevated text-ink ring-1 ring-edge hover:bg-raised"
            }`}
          >
            <span
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                offSelected ? "bg-raised text-ink-subtle" : "bg-accent text-canvas"
              }`}
            >
              {offSelected ? null : <Check size={9} strokeWidth={3} />}
            </span>
            {offSelected ? tr("Off") : tr("On")}
          </button>

          {groups.length > 0 && (
            <div className="mt-1.5 mb-0.5 px-2.5 text-[10px] font-bold uppercase tracking-[0.16em] text-ink-subtle">
              {tr("Languages")}
            </div>
          )}
          {groups.length > 1 && (
            <button
              onClick={() => setActiveLang(ALL_LANGS)}
              className={`flex items-center gap-2 rounded-md px-2.5 py-2 text-start text-[12.5px] font-medium transition-colors ${
                allLangs
                  ? "bg-elevated text-ink ring-1 ring-edge"
                  : "text-ink-muted hover:bg-elevated/60 hover:text-ink"
              }`}
            >
              <Languages size={14} strokeWidth={2} className="shrink-0" />
              <span className="flex-1 truncate">{tr("All languages")}</span>
              <span className="text-[10.5px] tabular-nums text-ink-subtle">
                {languageTracks.length}
              </span>
            </button>
          )}
          {groups.map((g) => {
            const isActive = activeLang === g.langKey;
            const hasSelected = g.variants.some((v) => v.id === selectedId);
            return (
              <button
                key={g.langKey}
                onClick={() => setActiveLang(g.langKey)}
                className={`group flex items-center gap-2 rounded-md px-2.5 py-2 text-start text-[12.5px] transition-colors ${
                  isActive
                    ? "bg-elevated text-ink ring-1 ring-edge"
                    : "text-ink-muted hover:bg-elevated/60 hover:text-ink"
                }`}
              >
                <Flag language={g.langDisplay} size="sm" showLabel={false} />
                <span className="flex-1 truncate font-medium">{g.langDisplay}</span>
                {hasSelected && <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent" />}
                <span className="text-[10.5px] tabular-nums text-ink-subtle">
                  {g.variants.length}
                </span>
              </button>
            );
          })}
        </aside>

        {/* Track list section */}
        <section className="flex min-h-0 min-w-0 flex-1 flex-col">
          {!searchOpen && languageTracks.length > 0 && (activeGroup || allLangs) && (
            <div className="flex flex-wrap items-center gap-1.5 border-b border-edge-soft bg-canvas/15 px-3 py-2">
              <Tab active={sourceFilter === "all"} onClick={() => setSourceFilter("all")}>
                {tr("All")} <Count value={languageTracks.length} />
              </Tab>
              <Tab
                active={sourceFilter === "embedded"}
                onClick={() => setSourceFilter("embedded")}
                disabled={totalEmbedded === 0}
              >
                {tr("Embedded")} <Count value={totalEmbedded} />
              </Tab>
              <Tab
                active={sourceFilter === "external"}
                onClick={() => setSourceFilter("external")}
                disabled={totalExternal === 0}
              >
                {tr("External")} <Count value={totalExternal} />
              </Tab>
              <span className="ms-auto flex items-center gap-1">
                <ToggleChip
                  active={!hideHI}
                  onClick={() => setHideHI((v) => !v)}
                  label={tr("HI")}
                  hint={hideHI ? tr("Hidden") : tr("Shown")}
                />
                <ToggleChip
                  active={forcedOnly}
                  onClick={() => setForcedOnly((v) => !v)}
                  label={tr("Forced")}
                />
              </span>
            </div>
          )}

          {searchOpen ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <SearchSection {...props} />
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              {justImported && <ImportBanner name={justImported} />}
              {languageTracks.length === 0 ? (
                <EmptyState searchSettled={searchSettled} veryNewMovie={veryNewMovie} />
              ) : visibleVariants.length === 0 ? (
                <p className="px-5 py-6 text-[13.5px] text-ink-muted">
                  {tr("No tracks match these filters. Try toggling HI/SDH or Forced.")}
                </p>
              ) : (
                <div className="flex flex-col gap-0.5 p-2">
                  {visibleVariants.map((t) => (
                    <VariantRow
                      key={t.id}
                      track={t}
                      selected={t.id === selectedId}
                      onPick={() => {
                        onSelect(t.id);
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {localError && (
            <div className="shrink-0 border-t border-edge-soft bg-danger/10 px-3 py-1.5 text-[11.5px] text-danger">
              {localError}
            </div>
          )}

          <div className="flex shrink-0 items-stretch border-t border-edge-soft">
            <button
              onClick={() => setSearchOpen((v) => !v)}
              className="flex flex-1 items-center gap-2 px-3 py-2 text-start text-[12px] font-semibold text-ink-muted transition-colors hover:bg-canvas/40 hover:text-ink"
            >
              <SearchIcon size={12} strokeWidth={2.2} />
              {searchOpen ? tr("Hide search") : tr("Find more subtitles")}
            </button>
            {isTauri && (
              <Tooltip label={tr("Load a .srt or .ass from your computer")} align="end">
                <button
                  onClick={() => void loadLocal()}
                  className="flex h-full shrink-0 items-center gap-2 border-s border-edge-soft px-3 py-2 text-[12px] font-semibold text-ink-muted transition-colors hover:bg-canvas/40 hover:text-ink"
                >
                  <FolderOpen size={12} strokeWidth={2.2} />
                  {tr("Load file")}
                </button>
              </Tooltip>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
