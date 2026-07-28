import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { Section, Segmented } from "./shared";

const CHOICES: ReadonlyArray<{ value: string; label: string }> = [
  { value: "15", label: "15s" },
  { value: "30", label: "30s" },
  { value: "45", label: "45s" },
  { value: "60", label: "60s" },
  { value: "90", label: "90s" },
];

export function AddonTimeoutSetting() {
  const t = useT();
  const { settings, update } = useSettings();
  const current = String(settings.addonTimeoutSec ?? 30);
  return (
    <Section
      title={t("Addon wait time")}
      subtitle={t(
        "How long Bear waits for each addon to return streams. Aggregators that search many sources can need 45s or more. Results appear as each addon answers, so a longer wait never delays the fast ones.",
      )}
    >
      <Segmented
        value={CHOICES.some((c) => c.value === current) ? current : "30"}
        options={CHOICES}
        onChange={(v) => update({ addonTimeoutSec: Number(v) })}
      />
      <span className="text-[12px] leading-relaxed text-ink-subtle">
        {t("Raise this if an addon usually shows nothing until you hit refresh a few times.")}
      </span>
    </Section>
  );
}
