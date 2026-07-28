import { useRef, useState } from "react";
import { useSettings } from "@/lib/settings";
import { useT } from "@/lib/i18n";
import { KeyField, Section, ToggleRow } from "./shared";

export function AutoSyncPanel() {
  const t = useT();
  const { settings, update } = useSettings();
  const master = settings.subtitleAutoSync;

  const [urlDraft, setUrlDraft] = useState(settings.communitySyncUrl);
  const [urlSaved, setUrlSaved] = useState(false);
  const savedTimer = useRef<number | null>(null);
  const flashSaved = () => {
    setUrlSaved(true);
    if (savedTimer.current) window.clearTimeout(savedTimer.current);
    savedTimer.current = window.setTimeout(() => setUrlSaved(false), 1800);
  };

  return (
    <>
      <Section
        title={t("Subtitle auto-sync")}
        subtitle={t(
          "Bear times out-of-sync subtitles to the audio for you, on any external subtitle. It works on the mpv player and leaves embedded tracks alone, since those are already in sync.",
        )}
      >
        <ToggleRow
          label={t("Auto-sync subtitles")}
          sub={t(
            "When a subtitle runs early or late, Bear measures the speech and corrects the timing on its own. Off by default.",
          )}
          value={master}
          onChange={(v) => update({ subtitleAutoSync: v })}
        />

        {master && (
          <div className="flex flex-col gap-2.5">
            <ToggleRow
              label={t("Let structural tiers auto-apply")}
              sub={t(
                "Identity matches from content hashing and the community database always apply on their own. Timing worked out from the audio only offers a fix until it has earned trust. Turn this on to let those audio-derived fixes apply automatically too.",
              )}
              value={settings.autoSyncApplyStructural}
              onChange={(v) => update({ autoSyncApplyStructural: v })}
            />
            <ToggleRow
              label={t("Drift monitor")}
              sub={t(
                "Keeps watching through playback and gently re-nudges the timing if the subtitle slips out of sync partway through.",
              )}
              value={settings.autoSyncDrift}
              onChange={(v) => update({ autoSyncDrift: v })}
            />
            <ToggleRow
              label={t("Smart resync with speech recognition")}
              sub={t(
                "For the hardest files and the Try again button, Bear transcribes a little speech on your device and lines the subtitle up to the actual words. Needs a build with the asr-whisper feature and downloads a small model the first time you use it.",
              )}
              value={settings.subtitleAutoSyncAsr}
              onChange={(v) => update({ subtitleAutoSyncAsr: v })}
            />
          </div>
        )}
      </Section>

      <Section
        title={t("Community sync")}
        subtitle={t(
          "A good correction only has to be found once. Bear can share verified fixes so the next person with the same file and subtitle gets an instant result. Records are keyed by salted fingerprints, never your files or anything personal.",
        )}
      >
        <ToggleRow
          label={t("Use community corrections")}
          sub={t(
            "Check the shared database first. When this exact subtitle has already been synced by someone else, yours snaps into place with no analysis.",
          )}
          value={settings.subtitleAutoSyncCrowd}
          onChange={(v) => update({ subtitleAutoSyncCrowd: v })}
        />
        <KeyField
          label={t("Community sync server")}
          placeholder={t("https://sync.harbor.site")}
          value={urlDraft}
          onChange={setUrlDraft}
          onSave={() => {
            update({ communitySyncUrl: urlDraft.trim() });
            flashSaved();
          }}
          saved={urlSaved}
          help={t(
            "Leave blank to use Bear's own community server. Enter a URL to point at your own server instead. Private mode below stops all contact either way.",
          )}
        />
        <ToggleRow
          label={t("Private mode")}
          sub={t(
            "Never contact the community server in either direction. Nothing is looked up and nothing is contributed from this device.",
          )}
          value={settings.communitySyncOptOut}
          onChange={(v) => update({ communitySyncOptOut: v })}
        />
      </Section>
    </>
  );
}
