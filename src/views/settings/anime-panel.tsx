import { useSettings } from "@/lib/settings";
import { useT } from "@/lib/i18n";
import { Section, ToggleRow } from "./shared";
import { isTauri } from "./player-panel/internals";
import { SvpSection } from "./anime-panel/svp-section";

export function AnimePanel() {
  const { settings, update } = useSettings();
  const t = useT();

  if (!isTauri) {
    return (
      <Section
        title={t("Desktop only")}
        subtitle={t("Smooth motion runs on the bundled mpv engine in the Bear desktop app. It has no effect in the browser.")}
      >
        <span className="text-[13px] text-ink-subtle">{t("Download the desktop app to use anime enhancements.")}</span>
      </Section>
    );
  }

  return (
    <>
      <Section
        title={t("Smooth motion")}
        subtitle={t("Anime is drawn on twos and threes, so fast pans can judder. Smoothing fills in the gaps so motion glides.")}
      >
        <ToggleRow
          label={t("Motion smoothing")}
          sub={t("Bear's built-in frame interpolation. Smooths panning, best on anime. Needs a display refresh rate above the video's frame rate, and can stutter on weak GPUs. Lighter than SVP.")}
          value={settings.playerMotionInterp}
          onChange={(v) => update({ playerMotionInterp: v })}
          lockReason={
            settings.playerSvp && !!settings.svpVpyPath
              ? t("SVP is already handling frame interpolation. Turn off SVP below to use this instead. Running both delays the audio.")
              : undefined
          }
        />
      </Section>

      <SvpSection />
    </>
  );
}
