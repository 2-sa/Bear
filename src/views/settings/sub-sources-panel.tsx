import { useEffect, useState } from "react";
import wyzieLogo from "@/assets/wyzie.png";
import { useAuth } from "@/lib/auth";
import type { Addon } from "@/lib/addons";
import { gatherSubtitleAddons } from "@/lib/subtitles/addon-source";
import { useSettings } from "@/lib/settings";
import { openUrl } from "@/lib/window";
import { useT } from "@/lib/i18n";
import { Section, ToggleRow, useSettingsActiveContext } from "./shared";
import { OpenSubsMark, SubdlMark, SubsourceMark } from "./sub-source-marks";

type ProvKey = "opensubtitles" | "wyzie" | "addons" | "subdl" | "subsource";

function Favicon({ src }: { src: string }) {
  return (
    <img
      src={src}
      alt=""
      draggable={false}
      className="h-9 w-9 shrink-0 rounded-[10px] object-cover ring-1 ring-edge-soft/60"
    />
  );
}

function AddonAvatar({ addon, z }: { addon: Addon; z: number }) {
  const [broken, setBroken] = useState(false);
  const logo = addon.manifest.logo;
  const letter = (addon.manifest.name?.trim()[0] ?? "?").toUpperCase();
  return (
    <span
      className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-canvas ring-2 ring-elevated"
      style={{ zIndex: z }}
    >
      {logo && !broken ? (
        <img
          src={logo}
          alt=""
          draggable={false}
          onError={() => setBroken(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="text-[12px] font-bold text-ink-subtle">{letter}</span>
      )}
    </span>
  );
}

function AddonStack({ addons }: { addons: Addon[] }) {
  const shown = addons.slice(0, 3);
  return (
    <span className="flex h-9 shrink-0 items-center">
      <span className="flex -space-x-2.5">
        {shown.map((a, i) => (
          <AddonAvatar key={a.transportUrl} addon={a} z={shown.length - i} />
        ))}
      </span>
    </span>
  );
}

function EmptyAddonIcon() {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-canvas text-ink-subtle ring-1 ring-edge-soft">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
        <rect x="3" y="5" width="18" height="14" rx="2.5" />
        <path d="M6.5 14h4M13 14h4.5M6.5 10.5h3M12 10.5h5.5" />
      </svg>
    </span>
  );
}

function KeyedSourceRow({
  label,
  sub,
  leading,
  on,
  onToggle,
  keyValue,
  onKey,
  placeholder,
  help,
}: {
  label: string;
  sub: string;
  leading: React.ReactNode;
  on: boolean;
  onToggle: (v: boolean) => void;
  keyValue: string;
  onKey: (v: string) => void;
  placeholder: string;
  help: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <ToggleRow label={label} sub={sub} value={on} onChange={onToggle} leading={leading} />
      {on && (
        <div className="ms-1 flex flex-col gap-1.5 rounded-xl border border-edge-soft bg-canvas/40 p-3">
          <input
            type="password"
            value={keyValue}
            onChange={(e) => onKey(e.target.value)}
            placeholder={placeholder}
            spellCheck={false}
            autoComplete="off"
            className="h-10 w-full rounded-lg border border-edge-soft bg-elevated/40 px-3.5 text-[13px] text-ink placeholder:text-ink-subtle focus:border-edge focus:outline-none"
          />
          <span className="text-[11.5px] leading-snug text-ink-subtle">{help}</span>
        </div>
      )}
    </div>
  );
}

export function SubSourcesPanel() {
  const t = useT();
  const { settings, update } = useSettings();
  const { authKey } = useAuth();
  const { setActive } = useSettingsActiveContext();
  const [addons, setAddons] = useState<Addon[] | null>(null);

  const enabled = settings.subProvidersEnabled ?? {};
  const osOn = enabled.opensubtitles ?? true;
  const wyzieOn = enabled.wyzie ?? false;
  const addonsOn = enabled.addons ?? true;
  const subdlOn = enabled.subdl === true;
  const subsourceOn = enabled.subsource === true;

  useEffect(() => {
    let cancelled = false;
    gatherSubtitleAddons(authKey)
      .then((a) => {
        if (!cancelled) setAddons(a);
      })
      .catch(() => {
        if (!cancelled) setAddons([]);
      });
    return () => {
      cancelled = true;
    };
  }, [authKey]);

  const setProv = (key: ProvKey, v: boolean) =>
    update({ subProvidersEnabled: { ...enabled, [key]: v } });

  const addonCount = addons?.length ?? null;
  const addonSub =
    addonCount === null
      ? t("Any Stremio subtitle addons you have installed are searched here too.")
      : addonCount > 0
        ? t("{count} installed. Add or remove them under Streaming sources.", { count: addonCount })
        : t("None installed yet. Add Stremio subtitle addons under Streaming sources.");

  return (
    <>
      <Section
        title={t("Subtitle sources")}
        subtitle={t("Harbor searches every source you enable at the same time, then merges and de-duplicates the results into one clean list. Turn a source off to stop pulling from it.")}
      >
        <div className="flex flex-col gap-2.5">
          <ToggleRow
            label={t("OpenSubtitles")}
            sub={t("Harbor's built-in OpenSubtitles search, on by default. If you install an OpenSubtitles addon, this steps aside automatically so your results are never duplicated.")}
            value={osOn}
            onChange={(v) => setProv("opensubtitles", v)}
            leading={<OpenSubsMark />}
          />
          <ToggleRow
            label={t("Wyzie")}
            sub={t("A fast community subtitle index. Off by default; turn it on for extra coverage on newer or niche releases.")}
            value={wyzieOn}
            onChange={(v) => setProv("wyzie", v)}
            leading={<Favicon src={wyzieLogo} />}
          />
          <ToggleRow
            label={t("Subtitle addons")}
            sub={addonSub}
            value={addonsOn}
            onChange={(v) => setProv("addons", v)}
            leading={addons && addons.length > 0 ? <AddonStack addons={addons} /> : <EmptyAddonIcon />}
          />
          <KeyedSourceRow
            label={t("SUBDL")}
            sub={t("A large multi-language subtitle database. Off until you add your free SUBDL API key.")}
            leading={<SubdlMark />}
            on={subdlOn}
            onToggle={(v) => setProv("subdl", v)}
            keyValue={settings.subdlApiKey ?? ""}
            onKey={(v) => update({ subdlApiKey: v })}
            placeholder={t("Paste your SUBDL API key")}
            help={
              <button
                type="button"
                onClick={() => openUrl("https://subdl.com/panel/api")}
                className="text-accent underline-offset-2 transition-colors hover:underline"
              >
                {t("Get a free key at subdl.com")}
              </button>
            }
          />
          <KeyedSourceRow
            label={t("Subsource")}
            sub={t("A community subtitle source. Off until you add your Subsource API key.")}
            leading={<SubsourceMark />}
            on={subsourceOn}
            onToggle={(v) => setProv("subsource", v)}
            keyValue={settings.subsourceApiKey ?? ""}
            onKey={(v) => update({ subsourceApiKey: v })}
            placeholder={t("Paste your Subsource API key")}
            help={
              <button
                type="button"
                onClick={() => openUrl("https://subsource.net")}
                className="text-accent underline-offset-2 transition-colors hover:underline"
              >
                {t("Get your key at subsource.net")}
              </button>
            }
          />
        </div>
        <button
          type="button"
          onClick={() => setActive("streaming")}
          className="w-fit text-[12.5px] font-medium text-ink-subtle underline-offset-2 transition-colors hover:text-ink hover:underline"
        >
          {t("Manage subtitle addons in Streaming sources")}
        </button>
      </Section>

      <Section
        title={t("Preferred languages")}
        subtitle={t("The languages above all obey your preferred subtitle language order, which lives in the Languages page.")}
      >
        <button
          type="button"
          onClick={() => setActive("language")}
          className="flex h-11 w-fit items-center gap-2 rounded-xl bg-elevated px-5 text-[13.5px] font-semibold text-ink ring-1 ring-edge transition-colors hover:bg-raised"
        >
          {t("Open Languages")}
        </button>
      </Section>
    </>
  );
}
