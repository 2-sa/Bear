import { Check, Copy, ExternalLink } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useSettings } from "@/lib/settings";
import { useT } from "@/lib/i18n";
import { openUrl } from "@/lib/window";
import { Section, ToggleRow } from "./shared";
import { SettingRow } from "./kit";
import { isTauri } from "./player-panel/internals";

const WEB_PORT = 11471;

function AddressField({ label, url, openable }: { label: string; url: string; openable?: boolean }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    });
  };
  return (
    <SettingRow
      label={label}
      desc={
        <span className="block truncate rounded-md bg-canvas px-2.5 py-1 font-mono text-[12.5px] text-ink">
          {url}
        </span>
      }
    >
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={copy}
          className={`flex h-8 items-center gap-1.5 rounded-md px-3 text-[12.5px] font-medium transition-colors ${
            copied
              ? "bg-success/15 text-success"
              : "bg-canvas text-ink-muted hover:bg-raised hover:text-ink"
          }`}
        >
          {copied ? <Check size={14} strokeWidth={2.4} /> : <Copy size={14} strokeWidth={1.9} />}
          {copied ? t("Copied") : t("Copy")}
        </button>
        {openable && (
          <button
            type="button"
            onClick={() => openUrl(url)}
            className="flex h-8 items-center gap-1.5 rounded-md bg-canvas px-3 text-[12.5px] font-medium text-ink-muted transition-colors hover:bg-raised hover:text-ink"
          >
            <ExternalLink size={14} strokeWidth={1.9} />
            {t("Open")}
          </button>
        )}
      </div>
    </SettingRow>
  );
}

export function RemotesPanel() {
  const t = useT();
  const { settings, update } = useSettings();
  const [lanIp, setLanIp] = useState<string | null>(null);
  const [webError, setWebError] = useState(false);
  const aliveRef = useRef(true);

  const enabled = settings.serveWebUi || settings.remoteControlEnabled;

  useEffect(() => {
    if (!isTauri) return;
    aliveRef.current = true;
    void invoke<string | null>("lan_ip")
      .then((ip) => {
        if (aliveRef.current) setLanIp(ip);
      })
      .catch(() => {});
    return () => {
      aliveRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!isTauri || !enabled) {
      setWebError(false);
      return;
    }
    const timer = window.setTimeout(() => {
      void invoke<boolean>("web_serve_status")
        .then((ok) => {
          if (aliveRef.current) setWebError(!ok);
        })
        .catch(() => {});
    }, 800);
    return () => window.clearTimeout(timer);
  }, [enabled]);

  if (!isTauri) {
    return (
      <div className="flex flex-col gap-5">
        <p className="text-[13.5px] leading-relaxed text-ink-muted">
          {t("Remotes are served by the desktop app. Open these settings on your computer's Harbor to get the links.")}
        </p>
      </div>
    );
  }

  return (
    <>
      <Section
        title={t("Harbor on other devices")}
        subtitle={t("Serves this exact install of Harbor as a web app on your network. Open it on a phone, laptop, or TV browser, sign in there, and it streams through this computer.")}
      >
        <ToggleRow
          label={t("Serve Harbor on your network")}
          sub={t("One switch powers everything on this page: the web app, the phone remote, and the manga reader remote.")}
          value={enabled}
          onChange={(v) => update({ serveWebUi: v, remoteControlEnabled: v })}
        />
        {enabled && (
          <>
            <AddressField label={t("Harbor in your browser (this computer)")} url={`http://127.0.0.1:${WEB_PORT}`} openable />
            {lanIp && <AddressField label={t("Harbor in your browser (Wi-Fi)")} url={`http://${lanIp}:${WEB_PORT}`} />}
            {webError && (
              <span className="rounded-md bg-danger/15 px-4 py-3 text-[12.5px] leading-relaxed text-danger">
                {t("Couldn't start on port {WEB_PORT}. Another app may be using it; toggle off and on to retry.", { WEB_PORT: String(WEB_PORT) })}
              </span>
            )}
          </>
        )}
      </Section>

      {enabled && (
        <>
          <Section
            title={t("Phone remote")}
            subtitle={t("Turns your phone into a remote for this computer: play, pause, seek, volume, and casting, all from the couch. Open the Wi-Fi address on your phone's browser.")}
          >
            <AddressField label={t("Phone remote (this computer)")} url={`http://127.0.0.1:${WEB_PORT}/remote`} openable />
            {lanIp && <AddressField label={t("Phone remote (Wi-Fi)")} url={`http://${lanIp}:${WEB_PORT}/remote`} />}
          </Section>

          <Section
            title={t("Manga reader remote")}
            subtitle={t("Control the manga flipbook from your phone while reading on the big screen: turn pages, zoom, and switch modes. The reader also shows this link while you read.")}
          >
            <AddressField label={t("Manga remote (this computer)")} url={`http://127.0.0.1:${WEB_PORT}/reader`} openable />
            {lanIp && <AddressField label={t("Manga remote (Wi-Fi)")} url={`http://${lanIp}:${WEB_PORT}/reader`} />}
          </Section>
        </>
      )}

      {!enabled && (
        <p className="px-1 text-[12.5px] leading-relaxed text-ink-subtle">
          {t("Flip the switch above and the phone remote and manga reader remote addresses appear here.")}
        </p>
      )}
    </>
  );
}
