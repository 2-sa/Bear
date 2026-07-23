import { workerRoutes } from "@/lib/network-config";
import { safeFetch } from "@/lib/safe-fetch";
import { kitsuToTvdb } from "./anime-mapping";

export type TvdbImageMap = Record<string, string>;

export type TvdbArtwork = { backgrounds: string[]; clearLogos: string[]; posters: string[] };

export async function fetchTvdbArtwork(opts: {
  imdb?: string | null;
  kitsuId?: number | null;
}): Promise<TvdbArtwork> {
  const empty: TvdbArtwork = { backgrounds: [], clearLogos: [], posters: [] };
  let series: number | null = null;
  if (opts.kitsuId != null) series = await kitsuToTvdb(opts.kitsuId).catch(() => null);
  const q = new URLSearchParams();
  if (series) q.set("series", String(series));
  else if (opts.imdb && opts.imdb.startsWith("tt")) q.set("imdb", opts.imdb);
  else return empty;
  const endpoint = workerRoutes.tvdbArtwork();
  if (!endpoint) return empty;
  try {
    const res = await safeFetch(`${endpoint}?${q.toString()}`);
    if (!res.ok) return empty;
    const j = (await res.json()) as Partial<TvdbArtwork>;
    return {
      backgrounds: j?.backgrounds ?? [],
      clearLogos: j?.clearLogos ?? [],
      posters: j?.posters ?? [],
    };
  } catch {
    return empty;
  }
}

export async function fetchTvdbProxyImages(opts: {
  imdb?: string | null;
  kitsuId?: number | null;
  series?: number | null;
  type?: string;
}): Promise<TvdbImageMap> {
  let series: number | null = opts.series ?? null;
  if (series == null && opts.kitsuId != null) series = await kitsuToTvdb(opts.kitsuId).catch(() => null);
  const q = new URLSearchParams();
  if (series) q.set("series", String(series));
  else if (opts.imdb && opts.imdb.startsWith("tt")) q.set("imdb", opts.imdb);
  else return {};
  q.set("type", opts.type && opts.type !== "aired" ? opts.type : "default");
  const endpoint = workerRoutes.tvdbImages();
  if (!endpoint) return {};
  try {
    const res = await safeFetch(`${endpoint}?${q.toString()}`);
    if (!res.ok) return {};
    const j = (await res.json()) as { images?: TvdbImageMap };
    return j?.images ?? {};
  } catch {
    return {};
  }
}

export function pickTvdbImage(
  map: TvdbImageMap,
  ep: {
    seasonNumber?: number;
    number: number;
    absoluteNumber?: number;
    imdbSeason?: number;
    imdbEpisode?: number;
  },
): string | null {
  const abs = ep.absoluteNumber ?? ep.number;
  return (
    map[`abs${abs}`] ??
    (ep.imdbSeason != null && ep.imdbEpisode != null
      ? map[`s${ep.imdbSeason}e${ep.imdbEpisode}`]
      : undefined) ??
    (ep.seasonNumber != null ? map[`s${ep.seasonNumber}e${ep.number}`] : undefined) ??
    null
  );
}
