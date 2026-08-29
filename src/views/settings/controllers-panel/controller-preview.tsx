import { useState } from "react";
import { useT } from "@/lib/i18n";
import { useLiveGamepad } from "@/lib/gamepad/live";
import { useGamepads } from "@/lib/gamepad/store";
import { ControllerSvg, type Layout } from "./controller-svg";

export function ControllerPreview({ enabled }: { enabled: boolean }) {
  const t = useT();
  const [layout, setLayout] = useState<Layout>("xbox");
  const live = useLiveGamepad();
  const gamepads = useGamepads();
  const connected = gamepads.length > 0;
  const active = enabled && connected;

  const hint = !enabled
    ? t("Turn on controller support to light up your inputs here.")
    : !connected
      ? t("Connect a controller: every press and stick move shows up here, live.")
      : t("Press buttons and move the sticks. This mirrors your controller in real time.");

  return (
    <div className="rounded-md border border-edge-soft bg-canvas/40 p-5">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">
          {t("Live preview")}
          {active && (
            <span className="flex items-center gap-1.5 text-[10.5px] font-medium normal-case tracking-normal text-accent">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" /> {t("Live")}
            </span>
          )}
        </div>
        <div className="flex rounded-full bg-elevated p-0.5 ring-1 ring-edge-soft">
          {(["xbox", "ps"] as Layout[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setLayout(m)}
              className={`rounded-full px-3.5 py-1 text-[12px] font-semibold transition-colors ${
                layout === m ? "bg-ink text-canvas" : "text-ink-muted hover:text-ink"
              }`}
            >
              {m === "xbox" ? t("Xbox") : t("PlayStation")}
            </button>
          ))}
        </div>
      </div>
      <div className={`mx-auto max-w-[460px] transition-opacity duration-300 ${active ? "" : "opacity-55"}`}>
        <ControllerSvg layout={layout} live={live} />
      </div>
      <p className="mt-1 text-center text-[12.5px] text-ink-subtle">{hint}</p>
    </div>
  );
}
