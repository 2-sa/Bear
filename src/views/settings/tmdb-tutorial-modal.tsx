import { Check, ExternalLink, X } from "lucide-react";
import { useModalExit } from "@/components/modal-shell";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { openUrl } from "@/lib/window";

const STEPS: { title: string; body: string; callout?: boolean }[] = [
  {
    title: "Make a free TMDB account",
    body: "Open themoviedb.org and sign up. It is completely free and takes a few seconds.",
  },
  {
    title: "Open the API settings",
    body: "Profile picture, then Settings, then API in the left sidebar. Press Create and pick Developer.",
  },
  {
    title: "Fill the form (the part everyone gets stuck on)",
    body: "It asks for an Application URL plus a few details. None of it is ever checked. Put anything in the URL field and keep going.",
    callout: true,
  },
  {
    title: "Copy your API Key (v3 auth)",
    body: "After you submit, copy the value labelled API Key (v3 auth). It is the short one, not the long Read Access Token.",
  },
  {
    title: "Paste it into Harbor",
    body: "Drop it in the TMDB field right here. Harbor saves it on its own and the whole app lights up.",
  },
];

export function TmdbGuideModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { closing, close } = useModalExit(onClose, open);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);
  if (!open) return null;
  return createPortal(
    <div
      className={`${closing ? "animate-scrim-out" : "animate-scrim-in"} fixed inset-0 z-[250] flex items-center justify-center p-6`}
      onClick={close}
    >
      <div
        className={`${closing ? "animate-dialog-out" : "animate-dialog-in"} flex max-h-[86vh] w-[min(640px,100%)] flex-col overflow-hidden rounded-md bg-surface harbor-float`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 px-6 pb-5 pt-5">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-ink-subtle">
              TMDB
            </span>
            <h2 className="text-[17px] font-semibold text-ink">Get your free TMDB key</h2>
            <p className="text-[12.5px] text-ink-subtle">About 30 seconds. No payment, ever.</p>
          </div>
          <button
            onClick={close}
            aria-label="Close"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-ink-subtle transition-colors hover:bg-elevated hover:text-ink"
          >
            <X size={16} strokeWidth={2.2} />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6">
          {STEPS.map((step, i) => (
            <div key={step.title} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-canvas text-[12.5px] font-semibold text-ink-muted">
                {i + 1}
              </span>
              <div className="flex min-w-0 flex-col gap-1.5">
                <span className="text-[13.5px] font-semibold text-ink">{step.title}</span>
                <p className="text-[13px] leading-relaxed text-ink-muted">{step.body}</p>
                {step.callout && (
                  <div className="mt-1 flex items-start gap-2 rounded-md bg-canvas px-3.5 py-3">
                    <Check size={16} strokeWidth={2.6} className="mt-0.5 shrink-0 text-accent" />
                    <p className="text-[12.5px] leading-relaxed text-ink">
                      For Application URL, type any address at all, like https://harbor.app or
                      http://localhost. TMDB never visits it. The only thing you actually need is the
                      API key.
                    </p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-end gap-2 px-6 pb-5 pt-5">
          <button
            onClick={close}
            className="h-9 rounded-md bg-elevated px-4 text-[12.5px] font-semibold text-ink-muted transition-colors hover:text-ink"
          >
            Close
          </button>
          <button
            onClick={() => openUrl("https://www.themoviedb.org/settings/api")}
            className="flex h-9 items-center gap-2 rounded-md bg-ink px-4 text-[12.5px] font-semibold text-canvas transition-opacity hover:opacity-90"
          >
            Open TMDB
            <ExternalLink size={14} strokeWidth={2.2} />
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
