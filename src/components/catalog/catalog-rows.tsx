import { ChevronRight } from "lucide-react";
import { useMemo } from "react";
import { LazyMount } from "@/components/lazy-mount";
import { PickCard } from "@/components/pick-card";
import { TopRankCard } from "@/components/top-rank-card";
import { Row, usePosterRow } from "@/components/row";
import { RowControls } from "@/views/home/row-controls";
import { useHideAnimeRows } from "@/lib/anime-hide";
import type { Meta } from "@/lib/cinemeta";
import { useT } from "@/lib/i18n";
import {
  applyPageRows,
  movePageRow,
  orderedRowKeys,
  renamePageRow,
  togglePageRowHidden,
  type PageRowCustomization,
} from "@/lib/page-rows";
import { useView } from "@/lib/view";

export type CatalogRow = {
  key: string;
  title: string;
  metas: Meta[];
  fetcher?: (page: number) => Promise<Meta[]>;
  hasMore?: boolean;
  variant?: "rank";
};

function RowTitle({ row, kids = false }: { row: CatalogRow; kids?: boolean }) {
  const t = useT();
  const { openGrid } = useView();
  if (!row.fetcher) return <>{t(row.title)}</>;
  return (
    <button
      onClick={() => openGrid({ title: t(row.title), fetcher: row.fetcher!, initial: row.metas })}
      className={`group/see inline-flex items-center gap-1.5 transition-colors ${
        kids ? "text-[#0e3a43] hover:text-[#1f8f88]" : "text-ink hover:text-ink-muted"
      }`}
    >
      {t(row.title)}
      <span className="inline-flex items-center gap-0.5 text-[12px] font-medium text-ink-subtle opacity-0 transition-opacity duration-200 group-hover/see:opacity-100">
        {t("See all")}
        <ChevronRight size={14} strokeWidth={2.4} className="dir-icon" />
      </span>
    </button>
  );
}

export function CatalogRows({
  rows,
  editMode,
  custom,
  onPersist,
  scrollPrefix,
  onLoadMore,
  flagRerunKeys,
  kids = false,
  injectAfter = -1,
  injectNode,
}: {
  rows: CatalogRow[];
  editMode: boolean;
  custom: PageRowCustomization;
  onPersist: (next: PageRowCustomization) => void;
  scrollPrefix: string;
  onLoadMore: (key: string) => void;
  flagRerunKeys?: string[];
  kids?: boolean;
  injectAfter?: number;
  injectNode?: React.ReactNode;
}) {
  const t = useT();
  const { openGrid } = useView();
  const shown = useHideAnimeRows(rows);
  const posterRow = usePosterRow(148, kids);
  const allKeys = useMemo(() => shown.map((r) => r.key), [shown]);
  const display = useMemo(() => applyPageRows(shown, custom, editMode), [shown, custom, editMode]);
  const orderKeys = useMemo(() => orderedRowKeys(allKeys, custom), [allKeys, custom]);
  return (
    <>
      {display.map((row, i) => {
        const hidden = custom.hidden.includes(row.key);
        if (hidden && !editMode) return null;
        const idx = orderKeys.indexOf(row.key);
        const eager = i < 2;
        const viewAll = row.fetcher
          ? () => openGrid({ title: t(row.title), fetcher: row.fetcher!, initial: row.metas })
          : undefined;
        const rowEl = row.variant === "rank" ? (
          <Row
            title={<RowTitle row={row} kids={kids} />}
            titleClassName={kids ? "text-[#0e3a43]" : "text-ink"}
            titleScale={kids ? 1.28 : 1}
            min={216}
            shape="rank"
            scrollKey={`${scrollPrefix}:${row.key}`}
            onViewAll={viewAll}
            viewAllClassName={kids ? "text-[#0e3a43]/70 hover:text-[#1f8f88]" : undefined}
          >
            {row.metas.slice(0, 10).map((m, ri) => (
              <TopRankCard key={m.id} meta={m} rank={ri + 1} />
            ))}
          </Row>
        ) : (
          <Row
            title={<RowTitle row={row} kids={kids} />}
            titleClassName={kids ? "text-[#0e3a43]" : "text-ink"}
            titleScale={kids ? 1.28 : 1}
            {...posterRow}
            scrollKey={`${scrollPrefix}:${row.key}`}
            onEndReached={row.hasMore ? () => onLoadMore(row.key) : undefined}
            onViewAll={viewAll}
            viewAllClassName={kids ? "text-[#0e3a43]/70 hover:text-[#1f8f88]" : undefined}
          >
            {row.metas.map((m) => (
              <PickCard key={m.id} meta={m} flagRerun={flagRerunKeys?.includes(row.key)} kids={kids} />
            ))}
          </Row>
        );
        const node = (
          <div key={row.key} data-scroll-anchor={`row:${row.key}`}>
            {editMode && (
              <RowControls
                name={row.title}
                hidden={hidden}
                canMoveUp={idx > 0}
                canMoveDown={idx >= 0 && idx < orderKeys.length - 1}
                onMoveUp={() => onPersist(movePageRow(custom, allKeys, row.key, -1))}
                onMoveDown={() => onPersist(movePageRow(custom, allKeys, row.key, 1))}
                onToggleHidden={() => onPersist(togglePageRowHidden(custom, row.key))}
                onRename={(label) => onPersist(renamePageRow(custom, row.key, label))}
                onResetName={() => onPersist(renamePageRow(custom, row.key, ""))}
                isRenamed={row.key in custom.renamed}
                kids={kids}
              />
            )}
            {!hidden && (eager ? rowEl : <LazyMount minHeight={340}>{rowEl}</LazyMount>)}
          </div>
        );
        if (i === injectAfter && injectNode) {
          return [node, <div key={`${row.key}::inject`}>{injectNode}</div>];
        }
        return node;
      })}
    </>
  );
}
