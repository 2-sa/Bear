import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { usePosterChain } from "@/components/poster";
import type { AnimeHit } from "@/lib/search";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { useView } from "@/lib/view";
import type { Meta } from "@/lib/cinemeta";
import { kitsuToAnilist } from "@/lib/providers/anime-mapping";
import { animeRelations, type AnimeRelation } from "@/lib/anilist/relations";

async function resolveAnilistId(hit: AnimeHit): Promise<number | null> {
  if (hit.anilistId) return hit.anilistId;
  if (hit.kitsuId) return kitsuToAnilist(hit.kitsuId).catch(() => null);
  return null;
}

export function AnimeRelations({ anime, onClose }: { anime: AnimeHit; onClose: () => void }) {
  const t = useT();
  const { openMeta } = useView();
  const { settings } = useSettings();
  const [entries, setEntries] = useState<AnimeRelation[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setEntries(null);
    void resolveAnilistId(anime)
      .then((id) => (id == null ? null : animeRelations(id)))
      .catch(() => null)
      .then((list) => {
        if (!cancelled) setEntries(list);
      });
    return () => {
      cancelled = true;
    };
  }, [anime]);

  if (!entries || entries.length === 0) return null;

  const open = (entry: AnimeRelation) => {
    const meta: Meta = {
      id: `anilist:${entry.id}`,
      type: "anime",
      name: entry.name,
      poster: entry.poster,
      background: entry.poster,
      releaseInfo: entry.year != null ? String(entry.year) : undefined,
    };
    onClose();
    openMeta(meta, { exact: true });
  };

  return (
    <section>
      <h3 className="mb-3 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.2em] text-ink-subtle">
        <Sparkles size={11} strokeWidth={2.2} />
        {t("Sequels & Prequels")}
      </h3>
      <div className="grid min-w-0 gap-1">
        {entries.map((entry) => (
          <RelationRow key={entry.id} entry={entry} rpdbKey={settings.rpdbKey} onOpen={open} />
        ))}
      </div>
    </section>
  );
}

function RelationRow({
  entry,
  rpdbKey,
  onOpen,
}: {
  entry: AnimeRelation;
  rpdbKey: string;
  onOpen: (entry: AnimeRelation) => void;
}) {
  const t = useT();
  const poster = usePosterChain(rpdbKey, `anilist:${entry.id}`, entry.poster, "series");
  return (
    <button
      onClick={() => onOpen(entry)}
      className="group flex min-w-0 items-center gap-4 rounded-2xl border border-transparent px-3 py-2.5 text-start transition-colors hover:border-edge-soft hover:bg-elevated/50 active:scale-[0.997]"
    >
      <span className="flex h-[96px] w-[64px] shrink-0 items-center justify-center overflow-hidden rounded-xl bg-canvas shadow-[0_6px_16px_-8px_rgba(0,0,0,0.55)] ring-1 ring-edge-soft">
        {poster.src ? (
          <img
            src={poster.src}
            alt=""
            loading="lazy"
            draggable={false}
            onError={poster.onError}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="text-[10px] text-ink-subtle">{t("No art")}</span>
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate text-[16px] font-semibold text-ink">{entry.name}</span>
        <span className="flex items-center gap-2 text-[12.5px] text-ink-muted">
          <span className="rounded-md bg-canvas/70 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-ink-muted">
            {t(entry.kind === "prequel" ? "Prequel" : "Sequel")}
          </span>
          {entry.year && <span>{entry.year}</span>}
        </span>
      </span>
    </button>
  );
}
