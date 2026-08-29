import { HardDrive } from "lucide-react";
import type { Meta } from "@/lib/cinemeta";
import { useBpT } from "../bp-i18n";
import { BP_METRIC_CHIP } from "./bp-detail-chrome";

const MARK = `${BP_METRIC_CHIP} text-[0.86em]`;

// The provenance of a title is invisible on this page today: something served
// by the user's own addon looks identical to a Cinemeta record. The addon ships
// its own logo, so the mark is the asset rather than another grey rectangle.
export function BpHeroMarks({ meta, inLibrary }: { meta: Meta; inLibrary: boolean }) {
  const t = useBpT();
  const origin = meta.addonOrigin;

  return (
    <>
      {inLibrary && (
        <span className={MARK}>
          <HardDrive size={14} strokeWidth={2.2} className="shrink-0" />
          {t("Local library")}
        </span>
      )}
      {origin?.name && (
        <span className={MARK}>
          {origin.logo && (
            <img
              src={origin.logo}
              alt=""
              loading="lazy"
              decoding="async"
              className="h-[1.35em] w-[1.35em] shrink-0 rounded-[5px] object-contain"
            />
          )}
          {origin.name}
        </span>
      )}
    </>
  );
}

export function BpTmdbKeyNote() {
  const t = useBpT();
  return (
    <p className="mt-[clamp(14px,1.7vh,26px)] max-w-[min(46vw,820px)] text-[clamp(12px,1.62vh,19px)] font-medium leading-[1.55] text-ink-subtle">
      {t("Add a TMDB key in Settings to see the cast, crew, and details.")}
    </p>
  );
}
