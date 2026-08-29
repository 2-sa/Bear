import { useEffect, useMemo, useState } from "react";
import type { HomeRow } from "@/views/home/home-types";
import { buildLetterboxdHomeRows } from "@/lib/stremboxd/home-rails";
import { useLetterboxd } from "@/lib/stremboxd/provider";
import { BP_TOP10_ROW_KEY, useBpCatalogPage, type BpCatalogPage } from "./use-bp-shows";

export function useBpMovies(): BpCatalogPage {
  const page = useBpCatalogPage("movies");
  const letterboxd = useBpLetterboxdRows();

  const rows = useMemo(() => {
    if (letterboxd.length === 0) return page.rows;
    const at = page.rows[0]?.key === BP_TOP10_ROW_KEY ? 1 : 0;
    return [...page.rows.slice(0, at), ...letterboxd, ...page.rows.slice(at)];
  }, [page.rows, letterboxd]);

  return { ...page, rows };
}

function useBpLetterboxdRows(): HomeRow[] {
  const letterboxd = useLetterboxd();
  const [rows, setRows] = useState<HomeRow[]>([]);
  const ready =
    letterboxd.isActive &&
    !(letterboxd.mode === "full" && !letterboxd.session) &&
    !(letterboxd.mode === "public" && !letterboxd.configSegment);

  useEffect(() => {
    if (!ready) {
      setRows([]);
      return;
    }
    let cancelled = false;
    buildLetterboxdHomeRows({
      configSegment: letterboxd.configSegment,
      selectedCatalogs: letterboxd.selectedCatalogs,
      hiddenCatalogs: letterboxd.hiddenCatalogs,
      catalogOrder: letterboxd.catalogOrder,
      session: letterboxd.session,
      listRefs: letterboxd.listRefs,
    })
      .then((rs) => {
        if (!cancelled) setRows(rs);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [
    ready,
    letterboxd.configSegment,
    letterboxd.selectedCatalogs,
    letterboxd.hiddenCatalogs,
    letterboxd.catalogOrder,
    letterboxd.session,
    letterboxd.listRefs,
  ]);

  return rows;
}
