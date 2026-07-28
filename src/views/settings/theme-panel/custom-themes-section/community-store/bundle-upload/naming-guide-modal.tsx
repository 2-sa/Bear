import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { BookOpen, Check, FileType2, Film, FolderArchive, Sparkles, Tag, Wand2, X } from "lucide-react";
import { iconGroupsFor, type BundleKind } from "./icon-keys";

type Step = { icon: typeof Tag; title: string; body: string };

function stepsFor(kind: BundleKind): Step[] {
  const example = kind === "badge" ? "4k.png, hdr.png, atmos.png" : "oscar.png, emmy.png, cannes.png";
  return [
    {
      icon: Tag,
      title: "Name each file after its slot",
      body: `That is the whole trick. A file called ${example} drops straight into the matching slot. The name before .png is all that matters, capitals and spaces are ignored.`,
    },
    {
      icon: Wand2,
      title: "Any size works, we optimize it",
      body: "Drop in art at any resolution. Bear resizes and compresses anything oversized for you, so nothing gets skipped for being too big. Square PNGs with a transparent background look best.",
    },
    {
      icon: Film,
      title: "Animated GIFs are welcome",
      body: "Want a badge that moves? Drop in a GIF up to 8 MB. Bear shrinks it down and converts it to a lightweight animated format so it stays crisp and loads fast. Keep it small and looping.",
    },
    {
      icon: FolderArchive,
      title: "Three ways to add art",
      body: "Click any single slot to pick one file, select many PNGs at once, or drop a whole .zip of them. Named files land in their slots automatically, the rest you can place by hand.",
    },
    ...(kind === "award"
      ? [
          {
            icon: Sparkles,
            title: "Invent your own award types",
            body: "Awards are not a fixed list. Add a custom award type, name it anything, and give it its own art. It shows up alongside the built-in trophies.",
          },
        ]
      : []),
  ];
}

export function NamingGuideModal({ kind, open, onClose }: { kind: BundleKind; open: boolean; onClose: () => void }) {
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  useEffect(() => {
    if (!open) setCopied(null);
  }, [open]);

  if (!open) return null;

  const groups = iconGroupsFor(kind);
  const steps = stepsFor(kind);

  const copyName = (file: string) => {
    navigator.clipboard?.writeText(file).then(
      () => {
        setCopied(file);
        window.setTimeout(() => setCopied((c) => (c === file ? null : c)), 1200);
      },
      () => {},
    );
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[250] flex items-center justify-center bg-canvas/70 p-6 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="flex max-h-[86vh] w-full max-w-[560px] flex-col overflow-hidden rounded-3xl border border-edge bg-elevated shadow-[0_40px_120px_-30px_rgba(0,0,0,0.8)] animate-popover-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-edge-soft px-6 py-5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
              <BookOpen size={18} strokeWidth={2.2} />
            </span>
            <div className="flex flex-col">
              <h2 className="font-display text-[20px] font-medium tracking-tight text-ink">
                How {kind === "badge" ? "badge" : "award"} packs work
              </h2>
              <p className="text-[12.5px] text-ink-muted">Name your files, drop them in, done.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-subtle transition-colors hover:bg-raised hover:text-ink"
          >
            <X size={18} strokeWidth={2.2} />
          </button>
        </div>

        <div className="flex flex-col gap-5 overflow-y-auto px-6 py-6">
          <div className="flex flex-col gap-4">
            {steps.map((step, i) => (
              <div key={step.title} className="flex gap-3.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-raised text-ink-muted">
                  <step.icon size={16} strokeWidth={2} />
                </span>
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="text-[14px] font-medium text-ink">
                    <span className="text-ink-subtle">{i + 1}.</span> {step.title}
                  </span>
                  <p className="text-[12.5px] leading-relaxed text-ink-muted">{step.body}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-2.5 rounded-2xl border border-edge-soft bg-surface/40 p-4">
            <span className="flex items-center gap-2 text-[12.5px] font-semibold text-ink">
              <FileType2 size={14} strokeWidth={2.2} className="text-accent" /> Every slot name
              <span className="text-[11.5px] font-normal text-ink-subtle">tap a name to copy</span>
            </span>
            <div className="flex flex-col gap-3.5">
              {groups.map((g) => (
                <div key={g.title} className="flex flex-col gap-1.5">
                  <span className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-ink-subtle">
                    {g.title}
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {g.items.map((it) => {
                      const file = `${it.key}.png`;
                      const isCopied = copied === file;
                      return (
                        <button
                          key={it.key}
                          type="button"
                          onClick={() => copyName(file)}
                          title={it.label}
                          className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11.5px] transition-colors ${
                            isCopied
                              ? "border-accent/40 bg-accent/10 text-accent"
                              : "border-edge-soft bg-elevated/40 text-ink-muted hover:border-edge hover:text-ink"
                          }`}
                        >
                          {isCopied && <Check size={11} strokeWidth={2.8} />}
                          <span className="font-mono">{file}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              {kind === "award" && (
                <p className="text-[12px] leading-relaxed text-ink-subtle">
                  Not here? Add a custom award type on the previous screen and name its file anything you like.
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-edge-soft px-6 py-4">
          <button
            onClick={onClose}
            className="flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-[13.5px] font-semibold text-canvas transition-opacity hover:opacity-90"
          >
            Got it
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
