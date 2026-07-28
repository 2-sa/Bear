import { ArrowLeft, ExternalLink, TriangleAlert } from "lucide-react";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { closeLinkOut, useLinkOut } from "@/lib/social/link-out";
import { openUrl } from "@/lib/window";

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function LinkOutInterstitial() {
  const url = useLinkOut();

  useEffect(() => {
    if (!url) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeLinkOut();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [url]);

  if (!url) return null;

  const host = hostOf(url);
  const proceed = () => {
    openUrl(url);
    closeLinkOut();
  };

  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-center justify-center overflow-y-auto bg-canvas/95 px-6 py-10 backdrop-blur-xl animate-in fade-in duration-200">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-elevated ring-1 ring-edge-soft">
          <ExternalLink size={26} className="text-ink-muted" strokeWidth={1.9} />
        </div>
        <h1 className="mt-6 font-display text-[26px] font-medium tracking-tight text-ink">
          You're leaving Bear
        </h1>
        <p className="mt-2 text-[14px] leading-relaxed text-ink-muted">
          This link goes to an external site that Bear does not control or vouch for. Triple-check
          the address before you continue, and never enter your Bear password anywhere but Bear.
        </p>
        <div className="mt-6 flex flex-col gap-1 rounded-[14px] border border-edge-soft bg-surface p-4 text-start">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">
            Destination
          </span>
          <span className="truncate text-[17px] font-semibold text-ink">{host}</span>
          <span className="mt-1 break-all font-mono text-[12px] leading-snug text-ink-subtle">{url}</span>
        </div>
        <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-danger/12 px-3 py-1.5 text-[12px] font-medium text-danger">
          <TriangleAlert size={14} strokeWidth={2.2} /> Only continue if you fully trust this link
        </div>
        <div className="mt-7 flex items-center justify-center gap-3">
          <button
            onClick={closeLinkOut}
            className="inline-flex min-h-11 items-center gap-2 rounded-[12px] bg-surface px-5 text-[14px] font-medium text-ink ring-1 ring-edge transition-colors hover:bg-raised"
          >
            <ArrowLeft size={18} /> Go back
          </button>
          <button
            onClick={proceed}
            className="inline-flex min-h-11 items-center gap-2 rounded-[12px] bg-ink px-5 text-[14px] font-semibold text-canvas transition-opacity hover:opacity-90"
          >
            Continue to site <ExternalLink size={16} />
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
