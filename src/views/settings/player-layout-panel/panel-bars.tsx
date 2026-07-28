import { Pencil, RotateCcw, Save, Undo2 } from "lucide-react";
import type { PlayerChromeConfig, ThemeId } from "@/lib/player-chrome";
import { useT } from "@/lib/i18n";
import { ChromeMiniPreview } from "./chrome-mini-preview";

export function EditLayoutCard({
  theme,
  config,
  visibleCount,
  hiddenCount,
  activeProfileName,
  onOpen,
}: {
  theme: ThemeId;
  config: PlayerChromeConfig;
  visibleCount: number;
  hiddenCount: number;
  activeProfileName: string | null;
  onOpen: () => void;
}) {
  const t = useT();
  const themeName = theme === "stremio" ? t("Stremio") : t("Default");
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-edge-soft bg-canvas transition-transform duration-200 hover:-translate-y-0.5">
      <div className="relative h-[212px] w-full">
        <ChromeMiniPreview theme={theme} config={config} />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-2/3 bg-gradient-to-b from-black/55 via-black/20 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-4 p-5">
          <div className="flex flex-col gap-1">
            <h3 className="text-[16px] font-semibold tracking-tight text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.6)]">
              {t("Player layout")}
            </h3>
            <p className="max-w-[44ch] text-[12.5px] leading-relaxed text-white/80 drop-shadow-[0_1px_3px_rgba(0,0,0,0.55)]">
              {t("A live preview of your player. Open the editor to move, hide, or reorder any control.")}
            </p>
            <p className="mt-0.5 text-[11.5px] text-white/60 drop-shadow-[0_1px_3px_rgba(0,0,0,0.55)]">
              {activeProfileName ? (
                <>
                  {t("Profile")} <span className="text-white/85">{activeProfileName}</span> ·{" "}
                </>
              ) : null}
              {visibleCount} {t("visible")}
              {hiddenCount > 0 ? t(", {hiddenCount} hidden", { hiddenCount: String(hiddenCount) }) : ""} ·{" "}
              {t("{themeName} theme", { themeName: themeName })}
            </p>
          </div>
          <span className="flex shrink-0 items-center gap-2 rounded-xl bg-ink px-4 py-2.5 text-[13px] font-semibold text-canvas shadow-[0_6px_20px_-8px_rgba(0,0,0,0.7)] transition-transform duration-200 group-hover:scale-[1.03]">
            <Pencil size={14} strokeWidth={2.4} />
            {t("Edit layout")}
          </span>
        </div>
      </div>
      <button
        type="button"
        onClick={onOpen}
        aria-label={t("Edit player layout")}
        className="absolute inset-0 z-40 transition-transform duration-150 active:scale-[0.997]"
      />
    </div>
  );
}

export function ThemeTabs({ value, onChange }: { value: ThemeId; onChange: (v: ThemeId) => void }) {
  const t = useT();
  const tabs: Array<{ id: ThemeId; label: string; sub: string }> = [
    { id: "default", label: t("Default"), sub: t("Bear's native player chrome.") },
    { id: "stremio", label: t("Stremio"), sub: t("Familiar Stremio button order.") },
  ];
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-edge-soft bg-canvas/40 p-1.5">
      {tabs.map((t) => {
        const selected = value === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className={`flex flex-1 flex-col items-start gap-0.5 rounded-xl px-4 py-2.5 text-start transition-colors ${
              selected
                ? "bg-elevated text-ink shadow-[inset_0_0_0_1px_var(--color-edge)]"
                : "text-ink-muted hover:bg-elevated/60 hover:text-ink"
            }`}
          >
            <span className="text-[13.5px] font-semibold">{t.label}</span>
            <span className={`text-[11.5px] ${selected ? "text-ink-muted" : "text-ink-subtle"}`}>
              {t.sub}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function FooterBar({
  dirty,
  justSaved,
  confirmingReset,
  onSave,
  onDiscard,
  onResetAll,
}: {
  dirty: boolean;
  justSaved: boolean;
  confirmingReset: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onResetAll: () => void;
}) {
  const t = useT();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-edge-soft bg-elevated/40 px-5 py-4">
      <button
        type="button"
        onClick={onResetAll}
        className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[12.5px] font-semibold transition-colors ${
          confirmingReset
            ? "bg-danger text-white"
            : "text-ink-muted hover:bg-raised hover:text-ink"
        }`}
      >
        <RotateCcw size={12.5} strokeWidth={2.4} />
        {confirmingReset ? t("Confirm full reset") : t("Reset all to default")}
      </button>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onDiscard}
          disabled={!dirty}
          className="flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[12.5px] font-semibold text-ink-muted transition-colors hover:bg-raised hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Undo2 size={12.5} strokeWidth={2.4} />
          {t("Discard changes")}
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={!dirty}
          className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-[12.5px] font-semibold transition-all duration-150 active:scale-[0.97] ${
            justSaved
              ? "bg-accent/15 text-accent"
              : dirty
                ? "bg-ink text-canvas hover:scale-[1.02]"
                : "cursor-not-allowed bg-raised text-ink-subtle opacity-60"
          }`}
        >
          <Save size={12.5} strokeWidth={2.4} />
          {justSaved ? t("Saved") : t("Save changes")}
        </button>
      </div>
    </div>
  );
}
