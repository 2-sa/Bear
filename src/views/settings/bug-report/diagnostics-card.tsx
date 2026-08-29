import { ShieldCheck } from "lucide-react";
import { useState } from "react";
import type { Diagnostics } from "@/lib/bug-report";
import { ModalButton, SettingRow, SettingsModal } from "../kit";

export function DiagnosticsCard({ diag }: { diag: Diagnostics | null }) {
  const [open, setOpen] = useState(false);
  if (!diag) {
    return (
      <SettingRow
        icon={<ShieldCheck size={14} strokeWidth={1.9} />}
        label="What gets sent"
        desc="Loading environment details…"
      />
    );
  }
  const compact = `Bear ${diag.appVersion} · ${diag.os}${diag.osVersion ? ` ${diag.osVersion}` : ""} · ${diag.viewport} · ${diag.locale}`;
  return (
    <>
      <SettingRow
        icon={<ShieldCheck size={14} strokeWidth={1.9} />}
        label="What gets sent"
        desc={compact}
      >
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="shrink-0 rounded-md bg-raised px-3 py-1.5 text-[12.5px] font-semibold text-ink-muted transition-colors hover:text-ink"
        >
          Review
        </button>
      </SettingRow>
      <SettingsModal
        open={open}
        onClose={() => setOpen(false)}
        title="What gets sent"
        sub="Auto-included. No keys, no library, no URLs. Just structural flags so reproductions go faster."
        actions={<ModalButton ghost onClick={() => setOpen(false)}>Close</ModalButton>}
      >
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-md bg-elevated px-4 py-3.5 font-mono text-[11.5px] text-ink-muted">
          <Pair k="App" v={diag.appVersion} />
          <Pair k="OS" v={`${diag.os} ${diag.osVersion}`} />
          <Pair k="Viewport" v={diag.viewport} />
          <Pair k="Locale" v={diag.locale} />
          <Pair k="Player" v={diag.flags.playerEngine} />
          <Pair k="Region" v={diag.flags.region} />
          <Pair k="TMDB key" v={diag.flags.hasTmdb ? "yes" : "no"} />
          <Pair k="RPDB key" v={diag.flags.hasRpdb ? "yes" : "no"} />
          <Pair k="Trakt" v={diag.flags.hasTrakt ? "yes" : "no"} />
          <Pair k="Stremio" v={diag.flags.hasStremio ? "signed in" : "guest"} />
          <Pair k="Debrid keys" v={String(diag.flags.debridCount)} />
          <Pair k="Addons" v={String(diag.flags.addonCount)} />
          <Pair k="IPTV lists" v={String(diag.flags.iptvCount)} />
          <Pair k="Recent errors" v={String(diag.recentErrors.length)} />
        </div>
      </SettingsModal>
    </>
  );
}

function Pair({ k, v }: { k: string; v: string }) {
  return (
    <>
      <span className="text-ink-subtle">{k}</span>
      <span className="truncate text-ink">{v || "n/a"}</span>
    </>
  );
}
