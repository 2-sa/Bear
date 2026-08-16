import { Dropdown } from "@/components/dropdown";
import { useSettings } from "@/lib/settings";
import { useT } from "@/lib/i18n";
import { ALL_LANGUAGE_NAMES } from "@/lib/subtitles/language";
import { Section } from "../shared";
import { Label, SubField } from "../player-panel/internals";

export function DualSubtitleSection() {
  const { settings, update } = useSettings();
  const t = useT();
  const enabled = settings.secondarySubLang.trim().length > 0;
  const placements: Array<{ id: "top" | "bottom"; label: string }> = [
    { id: "top", label: t("Top of the screen") },
    { id: "bottom", label: t("Above the main line") },
  ];

  return (
    <Section
      title={t("Dual subtitles")}
      subtitle={t(
        "Show a second subtitle in another language at the same time. Handy when you are learning a language: keep the one you are learning as your main subtitle, and put your own language here.",
      )}
    >
      <div className="flex flex-col gap-2.5">
        <Label>{t("Second subtitle language")}</Label>
        <Dropdown
          value={settings.secondarySubLang}
          onChange={(value) => update({ secondarySubLang: value })}
          options={[
            { value: "", label: t("Off") },
            ...ALL_LANGUAGE_NAMES.map((name) => ({ value: name, label: name })),
          ]}
          className="w-full max-w-[340px]"
        />
        <p className="text-[12px] leading-relaxed text-ink-subtle">
          {t(
            "Bear loads it automatically when a track in that language exists. You can also set or clear the second track for one video from the subtitle menu in the player.",
          )}
        </p>
      </div>

      {enabled && (
        <>
          <div className="flex flex-col gap-2.5">
            <Label>{t("Where it shows")}</Label>
            <div className="grid grid-cols-2 gap-2">
              {placements.map((placement) => {
                const selected = settings.subSecondaryPlacement === placement.id;
                return (
                  <button
                    key={placement.id}
                    type="button"
                    onClick={() => update({ subSecondaryPlacement: placement.id })}
                    className={`flex h-10 items-center justify-center rounded-xl border text-[12.5px] font-semibold transition-colors ${
                      selected
                        ? "border-ink bg-elevated text-ink"
                        : "border-edge-soft bg-canvas/40 text-ink-muted hover:border-edge hover:text-ink"
                    }`}
                  >
                    {placement.label}
                  </button>
                );
              })}
            </div>
          </div>

          <SubField
            label={t("Second line size")}
            value={`${Math.round(settings.subSecondaryScale * 100)}%`}
          >
            <input
              type="range"
              min={0.4}
              max={1.4}
              step={0.05}
              value={settings.subSecondaryScale}
              onChange={(event) => {
                const value = Number.parseFloat(event.target.value);
                if (Number.isFinite(value)) {
                  update({ subSecondaryScale: Math.max(0.4, Math.min(1.4, value)) });
                }
              }}
              className="h-1 w-full appearance-none rounded-full bg-edge-soft accent-ink"
            />
          </SubField>
        </>
      )}
    </Section>
  );
}
