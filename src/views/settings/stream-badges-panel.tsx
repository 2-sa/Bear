import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Download, Link2, Plus, Search, Trash2, Upload, X } from "lucide-react";
import {
  badgeLabel,
  defaultBadgeSrc,
  FormatBadge,
  RuleBadgeChip,
  streamBadges,
  type BadgeKind,
} from "@/components/format-badge";
import { parseStream } from "@/lib/streams/parser/parser-stream";
import { emitListToast } from "@/components/lists/list-toast";
import { safeFetch } from "@/lib/safe-fetch";
import {
  applyArtPack,
  BADGE_STUDIOS,
  COMMUNITY_PACKS,
  exportBadgesJson,
  importBadgesJson,
  matchRules,
  parsePackText,
  resetAllBadges,
  setBadgeOverride,
  setBadgeRules,
  useBadgeState,
  type BadgeImportResult,
  type CommunityPack,
  type CustomBadgeRule,
} from "@/lib/stream-badges";
import { openUrl } from "@/lib/window";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { removeStreamBadgePack, useStreamBadgePacks } from "@/lib/community-badge-packs";
import { Section, ToggleRow, useSettingsActiveContext } from "./shared";
import { requestThemeLibrary } from "@/views/settings/theme-panel/library-open-store";
import { MarketCta } from "@/views/settings/theme-panel/custom-themes-section/community-store/market/market-cta";
import type { IconThumb } from "@/views/settings/theme-panel/custom-themes-section/community-store/market/icon-fan";

const GROUPS: Array<{ label: string; kinds: BadgeKind[] }> = [
  {
    label: "Resolution",
    kinds: ["8k", "4k-uhd", "uhd", "2k-qhd", "1080p", "1080i", "720p", "576p", "480p", "360p", "hd", "sd"],
  },
  {
    label: "Source",
    kinds: ["remux", "bluray", "webdl", "webrip", "hdtv", "dvb", "dvd", "3d", "imax", "cam", "hdcam", "telesync", "hdts", "telecine", "scr", "wp"],
  },
  { label: "HDR", kinds: ["dv", "hdr10-plus", "hdr10", "hdr", "hlg", "sdr"] },
  { label: "Codec", kinds: ["hevc", "av1"] },
  {
    label: "Audio",
    kinds: ["atmos", "atmos-912", "truehd", "dts-hd-ma", "dts-hd", "dts-x", "dts", "ddp", "dd", "eac3", "ac3", "aac", "flac", "mp3", "opus", "pcm", "lpcm", "stereo", "mono", "5.1", "7.1"],
  },
  { label: "Flags", kinds: ["extended", "remastered", "repack", "no-label", "unknown"] },
];

const MAX_UPLOAD_BYTES = 260_000;

const BADGE_DOORWAY_PREVIEW: IconThumb[] = (
  ["4k-uhd", "dv", "atmos", "remux", "hevc"] as BadgeKind[]
).map((kind) => ({ src: defaultBadgeSrc(kind), alt: badgeLabel(kind) }));

function importToast(t: ReturnType<typeof useT>, r: BadgeImportResult): void {
  if (r.remapped === 0 && r.rules === 0) {
    emitListToast(t("Nothing usable in that file"));
    return;
  }
  emitListToast(t("{a} badges remapped, {b} rules added", { a: r.remapped, b: r.rules }));
}

function ConfirmButton({
  label,
  confirmLabel,
  onConfirm,
  className,
}: {
  label: string;
  confirmLabel: string;
  onConfirm: () => void;
  className?: string;
}) {
  const [armed, setArmed] = useState(false);
  return (
    <button
      onClick={() => {
        if (!armed) {
          setArmed(true);
          window.setTimeout(() => setArmed(false), 3000);
          return;
        }
        setArmed(false);
        onConfirm();
      }}
      className={`h-10 rounded-xl px-4 text-[13px] font-medium transition-colors ${
        armed ? "bg-danger/15 text-danger" : "text-ink-subtle hover:bg-elevated hover:text-ink"
      } ${className ?? ""}`}
    >
      {armed ? confirmLabel : label}
    </button>
  );
}

function KindEditorModal({ kind, onClose }: { kind: BadgeKind; onClose: () => void }) {
  const t = useT();
  const state = useBadgeState();
  const override = state.overrides[kind];
  const [url, setUrl] = useState(override?.image ?? "");
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = (f: File | undefined) => {
    if (!f) return;
    if (f.size > MAX_UPLOAD_BYTES) {
      emitListToast(t("Image too large. Keep badge files under 250 KB."));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const data = String(reader.result || "");
      if (data.startsWith("data:image/")) {
        setBadgeOverride(kind, { image: data });
        setUrl("");
        emitListToast(t("Badge updated"));
      }
    };
    reader.readAsDataURL(f);
  };

  return createPortal(
    <div className="fixed inset-0 z-[380] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" onMouseDown={onClose} />
      <div className="relative w-[min(600px,94vw)] animate-popover-in rounded-2xl border border-edge bg-elevated p-5 shadow-[0_24px_70px_-20px_rgba(0,0,0,0.8)]">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="grid min-h-[64px] min-w-[88px] place-items-center rounded-xl bg-canvas/50 px-3 py-2 ring-1 ring-edge-soft">
              <FormatBadge kind={kind} size="lg" />
            </span>
            <div className="flex flex-col">
              <span className="text-[16px] font-semibold text-ink">{badgeLabel(kind)}</span>
              <span className="text-[12.5px] text-ink-subtle">
                {override?.image ? t("Custom art") : override?.hidden ? t("Hidden") : t("Default art")}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label={t("Close")}
            className="flex h-9 w-9 items-center justify-center rounded-full text-ink-subtle transition-colors hover:bg-raised hover:text-ink"
          >
            <X size={17} strokeWidth={2.2} />
          </button>
        </div>
        <div className="mt-5 flex flex-col gap-2.5">
          <div className="flex items-center gap-2">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={t("Paste an image URL (png, webp, svg)")}
              className="h-11 min-w-0 flex-1 rounded-xl border border-edge-soft bg-surface/60 px-3.5 text-[13px] text-ink placeholder:text-ink-subtle focus:border-edge focus:outline-none"
            />
            <button
              onClick={() => {
                const v = url.trim();
                if (!/^https?:\/\//.test(v) && !v.startsWith("data:image/")) {
                  emitListToast(t("That doesn't look like an image URL"));
                  return;
                }
                setBadgeOverride(kind, { image: v });
                emitListToast(t("Badge updated"));
              }}
              className="h-11 rounded-xl bg-ink px-5 text-[13.5px] font-semibold text-canvas transition-transform hover:scale-[1.02] active:scale-[0.97]"
            >
              {t("Apply")}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => fileRef.current?.click()}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-edge-soft bg-surface/60 px-4 text-[13px] font-medium text-ink-muted transition-colors hover:border-edge hover:text-ink"
            >
              <Upload size={14} />
              {t("Upload image")}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => onFile(e.target.files?.[0])}
            />
            <button
              onClick={() => setBadgeOverride(kind, override?.hidden ? null : { hidden: true })}
              className="h-10 rounded-xl border border-edge-soft bg-surface/60 px-4 text-[13px] font-medium text-ink-muted transition-colors hover:border-edge hover:text-ink"
            >
              {override?.hidden ? t("Show badge") : t("Hide badge")}
            </button>
            {(override?.image || override?.hidden) && (
              <button
                onClick={() => {
                  setBadgeOverride(kind, null);
                  setUrl("");
                }}
                className="h-10 rounded-xl px-3.5 text-[13px] font-medium text-ink-subtle transition-colors hover:bg-elevated hover:text-ink"
              >
                {t("Reset to default")}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ruleSource(r: CustomBadgeRule): string | null {
  const id = r.id.startsWith("nuvio-") ? r.id.slice(6) : r.id;
  if (id.startsWith("minimal-")) return "Minimal";
  if (id.startsWith("abstract-")) return "Abstract";
  if (id.startsWith("harborlight-")) return "Bear Light";
  if (id.startsWith("harborcolor-")) return "Bear Color";
  return r.id.startsWith("nuvio-") ? "Nuvio" : null;
}

function RulesManager() {
  const t = useT();
  const { rules, overrides } = useBadgeState();
  const [editKind, setEditKind] = useState<BadgeKind | null>(null);
  const remaps = useMemo(
    () =>
      (Object.keys(overrides) as BadgeKind[]).filter(
        (k) => overrides[k]?.image || overrides[k]?.hidden,
      ),
    [overrides],
  );
  const [query, setQuery] = useState("");
  const [name, setName] = useState("");
  const [pattern, setPattern] = useState("");
  const [image, setImage] = useState("");
  const [sample, setSample] = useState("Movie.2026.2160p.WEB-DL.DV.Atmos.x265-GROUP");
  const matched = matchRules(sample);
  const previewKinds = useMemo(() => {
    try {
      return streamBadges(
        parseStream({ name: sample, title: sample, addonId: "preview", addonName: "preview" }),
      );
    } catch {
      return [] as BadgeKind[];
    }
  }, [sample]);

  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      q
        ? rules.filter(
            (r) => r.name.toLowerCase().includes(q) || r.pattern.toLowerCase().includes(q),
          )
        : rules,
    [rules, q],
  );
  const enabledCount = rules.filter((r) => r.enabled).length;

  const setAll = (enabled: boolean) => {
    const ids = new Set(filtered.map((r) => r.id));
    setBadgeRules(rules.map((r) => (ids.has(r.id) ? { ...r, enabled } : r)));
  };

  const add = () => {
    if (!name.trim() || !pattern.trim()) return;
    setBadgeRules([
      {
        id: `user-${Date.now()}`,
        name: name.trim(),
        pattern: pattern.trim(),
        enabled: true,
        image: image.trim() || undefined,
        tagColor: image.trim() ? undefined : "#2a2a2a",
        textColor: image.trim() ? undefined : "#ffffff",
        tagStyle: "filled",
      },
      ...rules,
    ]);
    setName("");
    setPattern("");
    setImage("");
  };

  return (
    <Section
      title={t("Custom rules")}
      subtitle={t("Your own badges, matched against the stream's name with a pattern. Great for release groups, providers, or anything the built-in badges don't cover. Imported packs land here too.")}
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search
            size={15}
            className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-ink-subtle"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("Search rules by name or pattern…")}
            className="h-10 w-full rounded-xl border border-edge-soft bg-surface/60 ps-10 pe-3.5 text-[13px] text-ink placeholder:text-ink-subtle focus:border-edge focus:outline-none"
          />
        </div>
        <span className="shrink-0 text-[12.5px] tabular-nums text-ink-subtle">
          {t("{n} rules · {m} on", { n: rules.length, m: enabledCount })}
        </span>
        {filtered.length > 0 && (
          <div className="flex shrink-0 items-center gap-1">
            <button
              onClick={() => setAll(true)}
              className="h-9 rounded-lg px-3 text-[12.5px] font-medium text-ink-subtle transition-colors hover:bg-elevated hover:text-ink"
            >
              {t("Enable all")}
            </button>
            <button
              onClick={() => setAll(false)}
              className="h-9 rounded-lg px-3 text-[12.5px] font-medium text-ink-subtle transition-colors hover:bg-elevated hover:text-ink"
            >
              {t("Disable all")}
            </button>
          </div>
        )}
        {rules.length > 0 && (
          <ConfirmButton
            label={t("Clear all")}
            confirmLabel={t("Tap again to delete {n} rules", { n: rules.length })}
            onConfirm={() => {
              setBadgeRules([]);
              emitListToast(t("All custom rules removed"));
            }}
          />
        )}
      </div>

      {remaps.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-subtle">
              {t("Badge remaps")} · {remaps.length}
            </span>
            <ConfirmButton
              label={t("Reset all")}
              confirmLabel={t("Tap again to reset {n}", { n: remaps.length })}
              onConfirm={() => {
                for (const k of remaps) setBadgeOverride(k, null);
                emitListToast(t("Badge art back to default"));
              }}
            />
          </div>
          <div className="max-h-[320px] overflow-y-auto rounded-xl border border-edge-soft bg-surface/40">
            {remaps.map((k) => (
              <RemapRow
                key={k}
                kind={k}
                hidden={!!overrides[k]?.hidden}
                onEdit={() => setEditKind(k)}
                onRemove={() => setBadgeOverride(k, null)}
              />
            ))}
          </div>
        </div>
      )}

      {editKind && <KindEditorModal kind={editKind} onClose={() => setEditKind(null)} />}

      {rules.length === 0 ? (
        <p className="rounded-xl border border-edge-soft bg-surface/40 px-4 py-6 text-center text-[13px] text-ink-subtle">
          {t("No custom rules yet. Add one below, or install a pack to bring some in.")}
        </p>
      ) : filtered.length === 0 ? (
        <p className="rounded-xl border border-edge-soft bg-surface/40 px-4 py-6 text-center text-[13px] text-ink-subtle">
          {t("No rules match your search.")}
        </p>
      ) : (
        <div className="max-h-[420px] overflow-y-auto rounded-xl border border-edge-soft bg-surface/40">
          {filtered.map((r) => (
            <RuleRow key={r.id} rule={r} all={rules} />
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2 rounded-xl border border-edge-soft bg-surface/40 p-4">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-subtle">
          {t("New rule")}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("Name (e.g. REMUX)")}
            className="h-10 w-40 rounded-xl border border-edge-soft bg-surface/60 px-3.5 text-[13px] text-ink placeholder:text-ink-subtle focus:border-edge focus:outline-none"
          />
          <input
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            placeholder={t("Pattern (e.g. \\bremux\\b)")}
            className="h-10 min-w-0 flex-1 rounded-xl border border-edge-soft bg-surface/60 px-3.5 font-mono text-[12.5px] text-ink placeholder:font-sans placeholder:text-ink-subtle focus:border-edge focus:outline-none"
          />
          <input
            value={image}
            onChange={(e) => setImage(e.target.value)}
            placeholder={t("Image URL (optional)")}
            className="h-10 w-48 rounded-xl border border-edge-soft bg-surface/60 px-3.5 text-[13px] text-ink placeholder:text-ink-subtle focus:border-edge focus:outline-none"
          />
          <button
            onClick={add}
            disabled={!name.trim() || !pattern.trim()}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-ink px-4 text-[13px] font-semibold text-canvas transition-transform hover:scale-[1.02] active:scale-[0.97] disabled:opacity-40"
          >
            <Plus size={14} strokeWidth={2.4} />
            {t("Add rule")}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded-xl border border-edge-soft bg-surface/40 p-4">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-subtle">
          {t("Try it")}
        </span>
        <input
          value={sample}
          onChange={(e) => setSample(e.target.value)}
          className="h-10 w-full rounded-xl border border-edge-soft bg-surface/60 px-3.5 font-mono text-[12.5px] text-ink focus:border-edge focus:outline-none"
        />
        <div className="flex min-h-[28px] flex-wrap items-center gap-1.5">
          {previewKinds.length === 0 && matched.length === 0 ? (
            <span className="text-[12.5px] text-ink-subtle">{t("No badges match this title.")}</span>
          ) : (
            <>
              {previewKinds.map((k) => (
                <FormatBadge key={k} kind={k} size="md" />
              ))}
              {matched.map((r) => (
                <RuleBadgeChip key={r.id} rule={r} size="md" />
              ))}
            </>
          )}
        </div>
      </div>
    </Section>
  );
}

function RuleRow({ rule, all }: { rule: CustomBadgeRule; all: CustomBadgeRule[] }) {
  const t = useT();
  const source = ruleSource(rule);
  return (
    <div className="flex items-center gap-3 border-b border-edge-soft/50 px-3.5 py-2.5 last:border-b-0">
      <span className="w-28 shrink-0 overflow-hidden">
        <RuleBadgeChip rule={rule} size="md" />
      </span>
      <span className="w-32 shrink-0 truncate text-[13px] font-medium text-ink" title={rule.name}>
        {rule.name}
      </span>
      <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-ink-subtle" title={rule.pattern}>
        {rule.pattern}
      </span>
      {source && (
        <span className="shrink-0 rounded-md bg-elevated px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-subtle ring-1 ring-edge-soft">
          {source}
        </span>
      )}
      <button
        onClick={() =>
          setBadgeRules(all.map((r) => (r.id === rule.id ? { ...r, enabled: !r.enabled } : r)))
        }
        aria-label={rule.enabled ? t("Disable rule") : t("Enable rule")}
        title={rule.enabled ? t("On") : t("Off")}
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors ${
          rule.enabled ? "bg-accent/15 text-accent" : "text-ink-subtle hover:bg-elevated hover:text-ink"
        }`}
      >
        <Check size={14} strokeWidth={2.6} />
      </button>
      <button
        onClick={() => setBadgeRules(all.filter((r) => r.id !== rule.id))}
        aria-label={t("Delete rule")}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-ink-subtle transition-colors hover:bg-danger/10 hover:text-danger"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

function RemapRow({
  kind,
  hidden,
  onEdit,
  onRemove,
}: {
  kind: BadgeKind;
  hidden: boolean;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const t = useT();
  return (
    <div className="flex items-center gap-3 border-b border-edge-soft/50 last:border-b-0">
      <button
        onClick={onEdit}
        className="flex min-w-0 flex-1 items-center gap-3 px-3.5 py-2.5 text-start transition-colors hover:bg-elevated/40"
      >
        <span className="flex w-24 shrink-0 items-center overflow-hidden">
          {hidden ? (
            <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">
              {t("Hidden")}
            </span>
          ) : (
            <FormatBadge kind={kind} size="md" />
          )}
        </span>
        <span className="w-32 shrink-0 truncate text-[13px] font-medium text-ink" title={badgeLabel(kind)}>
          {badgeLabel(kind)}
        </span>
        <span className="min-w-0 flex-1 truncate text-[11.5px] text-ink-subtle">
          {hidden ? t("Hidden") : t("Custom art")}
        </span>
        <span className="shrink-0 rounded-md bg-elevated px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-subtle ring-1 ring-edge-soft">
          {t("Remap")}
        </span>
      </button>
      <button
        onClick={onRemove}
        aria-label={t("Remove remap")}
        className="me-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-ink-subtle transition-colors hover:bg-danger/10 hover:text-danger"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

function PackCard({
  pack,
  busy,
  installed,
  onInstall,
}: {
  pack: CommunityPack;
  busy: boolean;
  installed: boolean;
  onInstall: () => void;
}) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-edge-soft bg-surface/40 p-4 transition-colors hover:border-edge">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <span className="text-[14.5px] font-semibold text-ink">{pack.name}</span>
          <span className="text-[12px] text-ink-subtle">
            {t("by {name}", { name: pack.author })} · {pack.count}
          </span>
        </div>
        <span className="shrink-0 rounded-md bg-elevated px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-subtle ring-1 ring-edge-soft">
          {pack.kind === "art" ? t("Art remap") : t("Ruleset")}
        </span>
      </div>
      {pack.previews.length > 0 && (
        <div className="flex h-9 items-center gap-3 overflow-hidden rounded-lg bg-canvas/40 px-3 ring-1 ring-edge-soft/50">
          {pack.previews.map((src) => (
            <img
              key={src}
              src={src}
              alt=""
              loading="lazy"
              className="h-6 w-auto max-w-[72px] shrink-0 object-contain"
              draggable={false}
            />
          ))}
        </div>
      )}
      <p className="min-h-[34px] text-[12.5px] leading-snug text-ink-muted">{pack.description}</p>
      <div className="flex items-center gap-2">
        <button
          onClick={onInstall}
          disabled={busy}
          className={`inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl px-4 text-[13px] font-semibold transition-transform hover:scale-[1.01] active:scale-[0.98] disabled:opacity-50 ${
            installed ? "border border-edge-soft bg-surface/60 text-ink-muted" : "bg-ink text-canvas"
          }`}
        >
          {installed ? <Check size={14} strokeWidth={2.6} /> : <Download size={14} />}
          {busy ? t("Installing…") : installed ? t("Reinstall") : t("Install")}
        </button>
        {pack.kind === "nuvio" && pack.author === "Bear" && (
          <button
            type="button"
            title={pack.url}
            onClick={() => {
              void navigator.clipboard?.writeText(pack.url);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1600);
            }}
            className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-[12.5px] font-medium transition-colors ${
              copied
                ? "border-accent/40 bg-accent/10 text-accent"
                : "border-edge-soft text-ink-muted hover:border-edge hover:text-ink"
            }`}
          >
            {copied ? <Check size={13} strokeWidth={2.6} /> : <Link2 size={13} />}
            {copied ? t("Copied") : t("Use in Nuvio")}
          </button>
        )}
      </div>
    </div>
  );
}

function PacksSection() {
  const t = useT();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [installed, setInstalled] = useState<Record<string, boolean>>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const installFromUrl = async (packUrl: string, id: string) => {
    setBusy(id);
    try {
      const res = await safeFetch(packUrl);
      if (!res.ok) {
        emitListToast(t("Couldn't reach that pack (HTTP {n})", { n: res.status }));
        return;
      }
      const text = await res.text();
      let json: unknown;
      try {
        json = parsePackText(text);
      } catch {
        emitListToast(t("That pack's file isn't valid JSON"));
        return;
      }
      importToast(t, importBadgesJson(json));
      setInstalled((m) => ({ ...m, [id]: true }));
    } catch {
      emitListToast(t("Couldn't reach that pack"));
    } finally {
      setBusy(null);
    }
  };

  const installPack = (p: CommunityPack) => {
    if (p.kind === "art") {
      const n = applyArtPack(p.art);
      emitListToast(t("{a} badges remapped, {b} rules added", { a: n, b: 0 }));
      setInstalled((m) => ({ ...m, [p.id]: true }));
      return;
    }
    void installFromUrl(p.url, p.id);
  };

  const onFile = (f: File | undefined) => {
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        importToast(t, importBadgesJson(parsePackText(String(reader.result || ""))));
      } catch {
        emitListToast(t("That file isn't valid JSON"));
      }
    };
    reader.readAsText(f);
  };

  return (
    <div ref={rootRef} className="scroll-mt-24">
    <Section
      title={t("Packs & import")}
      subtitle={t("One-click community packs. Rulesets bring full badge sets with their own matching; art remaps only swap the pictures on Bear's built-in badges. Anything shared as a badges.json link on the Nuvio Discord or Reddit imports here too.")}
    >
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {COMMUNITY_PACKS.map((p) => (
          <PackCard
            key={p.id}
            pack={p}
            busy={busy === p.id}
            installed={!!installed[p.id]}
            onInstall={() => installPack(p)}
          />
        ))}
      </div>
      <div className="flex flex-col gap-1.5 rounded-xl border border-edge-soft bg-surface/40 p-4">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-subtle">
          {t("Make your own")}
        </span>
        <div className="flex flex-wrap gap-x-5 gap-y-1.5">
          {BADGE_STUDIOS.map((s) => (
            <button
              key={s.url}
              onClick={() => openUrl(s.url)}
              title={s.blurb}
              className="text-[13px] font-medium text-accent transition-colors hover:text-accent/80"
            >
              {s.name} ↗
            </button>
          ))}
        </div>
        <p className="text-[12px] leading-snug text-ink-subtle">
          {t("Build a pack in any of these, export the JSON, host it as a gist, and paste the raw link below.")}
        </p>
      </div>
      <div className="flex flex-col gap-3 rounded-2xl border border-edge bg-canvas/30 p-4">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-elevated text-ink-muted ring-1 ring-edge-soft">
            <Link2 size={17} strokeWidth={2} />
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="text-[14px] font-semibold text-ink">{t("Import any pack")}</span>
            <span className="text-[12px] text-ink-subtle">
              {t("Any badges.json link works: a raw gist, Pastebin, or repo file. Broken JSON gets auto-repaired.")}
            </span>
          </div>
        </div>
        <div className="flex items-stretch">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && url.trim()) void installFromUrl(url.trim(), "url");
            }}
            placeholder="https://gist.githubusercontent.com/…/badges.json"
            spellCheck={false}
            className="h-12 min-w-0 flex-1 rounded-s-xl border border-e-0 border-edge-soft bg-surface/70 px-4 font-mono text-[12.5px] text-ink placeholder:font-sans placeholder:text-ink-subtle focus:border-edge focus:outline-none"
          />
          <button
            onClick={() => url.trim() && void installFromUrl(url.trim(), "url")}
            disabled={!url.trim() || busy === "url"}
            className="inline-flex h-12 items-center gap-2 rounded-e-xl bg-ink px-6 text-[13.5px] font-semibold text-canvas transition-colors hover:bg-ink/90 disabled:opacity-40"
          >
            <Download size={15} />
            {busy === "url" ? t("Fetching…") : t("Import")}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <button
            onClick={() => fileRef.current?.click()}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[12.5px] font-medium text-ink-subtle transition-colors hover:bg-elevated hover:text-ink"
          >
            <Upload size={13} />
            {t("Import a file instead")}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => onFile(e.target.files?.[0])}
          />
          <span aria-hidden className="h-4 w-px bg-edge-soft" />
          <button
            onClick={() => {
              void navigator.clipboard?.writeText(exportBadgesJson());
              emitListToast(t("Setup copied to clipboard as JSON"));
            }}
            className="h-9 rounded-lg px-3 text-[12.5px] font-medium text-ink-subtle transition-colors hover:bg-elevated hover:text-ink"
          >
            {t("Export my setup")}
          </button>
          <span aria-hidden className="h-4 w-px bg-edge-soft" />
          <ConfirmButton
            label={t("Reset everything")}
            confirmLabel={t("Tap again to reset everything")}
            onConfirm={() => {
              resetAllBadges();
              emitListToast(t("All badges back to default"));
            }}
          />
        </div>
      </div>
    </Section>
    </div>
  );
}

function CommunityInstalledSection() {
  const t = useT();
  const packs = useStreamBadgePacks();
  if (packs.length === 0) return null;
  return (
    <Section
      title={t("Downloaded from community")}
      subtitle={t("Badge art packs you installed from the community store. Remove one to put its badges back to default.")}
    >
      <div className="overflow-hidden rounded-xl border border-edge-soft bg-surface/40">
        {packs.map((p) => (
          <div
            key={p.id}
            className="flex items-center gap-3 border-b border-edge-soft/50 px-3.5 py-2.5 last:border-b-0"
          >
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink" title={p.name}>
              {p.name}
              {p.author ? <span className="text-ink-subtle"> {t("by {name}", { name: p.author })}</span> : null}
            </span>
            <span className="shrink-0 text-[12px] tabular-nums text-ink-subtle">
              {t("{n} badges", { n: p.kinds.length })}
            </span>
            <button
              onClick={() => {
                removeStreamBadgePack(p.id);
                emitListToast(t("Pack removed, badges back to default"));
              }}
              aria-label={t("Remove pack")}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-ink-subtle transition-colors hover:bg-danger/10 hover:text-danger"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    </Section>
  );
}

export function StreamBadgesPanel() {
  const t = useT();
  const state = useBadgeState();
  const { settings, update } = useSettings();
  const [selected, setSelected] = useState<BadgeKind | null>(null);
  const [browseOpen, setBrowseOpen] = useState(false);
  const overrideCount = Object.keys(state.overrides).length;
  const { setActive } = useSettingsActiveContext();
  const onMarketplace = () => {
    setActive("theme");
    requestThemeLibrary({ tab: "community", storeTab: "badges" });
  };

  return (
    <>
      <Section
        title={t("Stream format chips")}
        subtitle={t("The little 4K, HDR, codec, and audio chips that ride along each stream in the play picker.")}
        newId="badges:stream-format-chips"
      >
        <ToggleRow
          label={t("Show format chips on stream rows")}
          sub={t("The picker tags each stream with resolution, HDR flavor, codec, and audio format. Off hides them all.")}
          value={settings.showQualityBadge}
          onChange={(v) => update({ showQualityBadge: v })}
        />
      </Section>

      <Section
        title={t("Badge art")}
        subtitle={t("Every format badge Bear can show on streams. Click one to swap its art, hide it, or reset it. Changes apply everywhere badges appear.")}
      >
        {overrideCount > 0 && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-edge-soft bg-surface/40 px-4 py-2">
            <span className="text-[12.5px] text-ink-subtle">
              {t("{n} badges customized", { n: overrideCount })}
            </span>
            <ConfirmButton
              label={t("Reset all art")}
              confirmLabel={t("Tap again to reset {n} badges", { n: overrideCount })}
              onConfirm={() => {
                for (const k of Object.keys(state.overrides) as BadgeKind[]) {
                  setBadgeOverride(k, null);
                }
                emitListToast(t("Badge art back to default"));
              }}
            />
          </div>
        )}
        <div className="flex flex-col gap-5">
          {GROUPS.map((g) => (
            <div key={g.label} className="flex flex-col gap-2">
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-subtle">
                {t(g.label)}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {g.kinds.map((k) => {
                  const o = state.overrides[k];
                  const isSel = selected === k;
                  return (
                    <button
                      key={k}
                      onClick={() => setSelected(k)}
                      title={badgeLabel(k)}
                      className={`relative flex h-16 min-w-[74px] items-center justify-center rounded-xl border px-3 transition-colors ${
                        isSel
                          ? "border-accent bg-accent/10"
                          : "border-edge-soft bg-surface/40 hover:border-edge hover:bg-elevated/50"
                      } ${o?.hidden ? "opacity-40" : ""}`}
                    >
                      {o?.hidden ? (
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">
                          {badgeLabel(k)}
                        </span>
                      ) : (
                        <FormatBadge kind={k} size="sm" />
                      )}
                      {(o?.image || o?.hidden) && (
                        <span className="absolute -end-1 -top-1 h-2.5 w-2.5 rounded-full bg-accent ring-2 ring-canvas" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        {selected && <KindEditorModal kind={selected} onClose={() => setSelected(null)} />}
      </Section>

      <RulesManager />

      <MarketCta
        variant="browse"
        label={t("View community badge packs")}
        sublabel={t("User-made badge packs from the community store")}
        preview={BADGE_DOORWAY_PREVIEW}
        onClick={onMarketplace}
      />

      <button
        type="button"
        onClick={() => setBrowseOpen((v) => !v)}
        className="-mt-3 self-start text-[13px] font-semibold text-accent transition-colors hover:text-accent/80"
      >
        {browseOpen ? t("Hide curated packs") : t("Or browse curated packs and import a link")}
      </button>

      <CommunityInstalledSection />

      {browseOpen && <PacksSection />}
    </>
  );
}
