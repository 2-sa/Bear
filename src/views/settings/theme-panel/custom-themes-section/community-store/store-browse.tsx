import { useMemo, useState } from "react";
import { X } from "lucide-react";
import type { StoreTheme } from "@/lib/theme-store";
import { MOOD_RAILS, themeMoods, type Mood } from "./color-rank";
import { MarketCard } from "./market/market-card";

const SORTS = [
  { id: "top", label: "Top rated" },
  { id: "downloads", label: "Most downloaded" },
  { id: "new", label: "Newest" },
] as const;

type SortId = (typeof SORTS)[number]["id"];

function sortThemes(list: StoreTheme[], sort: SortId): StoreTheme[] {
  const copy = [...list];
  if (sort === "downloads") return copy.sort((a, b) => b.downloads - a.downloads);
  if (sort === "new") return copy.sort((a, b) => (b.createdAt > a.createdAt ? 1 : b.createdAt < a.createdAt ? -1 : 0));
  return copy.sort((a, b) => b.ratingAvg - a.ratingAvg || b.ratingCount - a.ratingCount || b.downloads - a.downloads);
}

export function StoreBrowse({
  themes,
  query,
  mood,
  onOpen,
  onClearMood,
}: {
  themes: StoreTheme[];
  query: string;
  mood?: Mood | null;
  onOpen: (t: StoreTheme) => void;
  onClearMood?: () => void;
}) {
  const [sort, setSort] = useState<SortId>("top");
  const q = query.trim().toLowerCase();

  const shown = useMemo(() => {
    const byMood = mood ? themes.filter((t) => themeMoods(t).has(mood)) : themes;
    const filtered = q
      ? byMood.filter((t) => `${t.name} ${t.author} ${t.blurb}`.toLowerCase().includes(q))
      : byMood;
    return sortThemes(filtered, sort);
  }, [themes, q, sort, mood]);

  return (
    <section className="flex flex-col gap-5 ps-[9px]">
      <div className="flex flex-wrap items-center gap-2">
        {SORTS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSort(s.id)}
            className={`h-8 rounded-full px-3.5 text-[12.5px] font-semibold transition-colors ${
              sort === s.id
                ? "bg-ink text-canvas"
                : "bg-surface text-ink-muted ring-1 ring-edge-soft hover:text-ink hover:ring-edge"
            }`}
          >
            {s.label}
          </button>
        ))}
        {mood && (
          <button
            type="button"
            onClick={onClearMood}
            className="inline-flex h-8 items-center gap-1.5 rounded-full bg-accent-soft px-3 text-[12.5px] font-semibold text-accent transition-opacity hover:opacity-85"
          >
            {MOOD_RAILS.find((r) => r.mood === mood)?.title ?? mood}
            <X size={12} strokeWidth={2.6} />
          </button>
        )}
        <span className="ms-auto tabular-nums text-[12.5px] text-ink-subtle">
          {shown.length} {shown.length === 1 ? "theme" : "themes"}
        </span>
      </div>

      {shown.length === 0 ? (
        <p className="rounded-md bg-surface px-4 py-14 text-center text-[13px] text-ink-subtle ring-1 ring-edge-soft">
          {q ? "No themes match your search." : "No community themes yet. Be the first to share one."}
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {shown.map((t) => (
            <MarketCard key={t.id} item={t} kind="theme" onOpen={(item) => onOpen(item as StoreTheme)} />
          ))}
        </div>
      )}
    </section>
  );
}
