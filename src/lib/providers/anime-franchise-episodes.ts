import { aniZipByKitsu } from "@/lib/providers/anizip";
import { buildKitsuEpisodes, mergeAniZipEpisodes, mergeTvdbEpisodes, mergeTmdbEpisodes } from "@/lib/providers/anime-episode-build";
import { animeKitsuMeta } from "@/lib/providers/anime-kitsu-addon";
import { kitsuEpisodes, type KitsuEpisode } from "@/lib/providers/kitsu";
import { kitsuToTvdb } from "@/lib/providers/anime-mapping";
import { tvdbEpisodesByType, tvdbEpisodesAbsolute, tvdbLangFromIso1 } from "@/lib/providers/tvdb";
import { tmdbSeasonEpisodes } from "@/lib/providers/tmdb/tmdb-details";
import type { Episode as TmdbEpisode } from "@/lib/providers/tmdb/tmdb-details";
import type { Settings } from "@/lib/settings";

const cache = new Map<string, Promise<KitsuEpisode[]>>();

function isPlayable(ep: KitsuEpisode): boolean {
  if (ep.streamId) return true;
  return !!(ep.imdbId?.startsWith("tt") && ep.imdbSeason != null && ep.imdbEpisode != null);
}

export function fetchEntryEpisodes(kitsuId: number, settings: Settings): Promise<KitsuEpisode[]> {
  const lang = tvdbLangFromIso1(settings.tmdbLanguage || settings.uiLanguage);
  const iso1 = settings.tmdbLanguage || settings.uiLanguage || "en";
  const localized = settings.localizeAnimeMetadata && iso1.split("-")[0]?.toLowerCase() !== "en";
  const cacheKey = `${kitsuId}:${lang}:${localized ? "loc" : "std"}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;
  const p = (async () => {
    const [addonMeta, raw, aniZip, tvdbEpsRaw] = await Promise.all([
      animeKitsuMeta(`kitsu:${kitsuId}`).catch(() => null),
      kitsuEpisodes(kitsuId, 100).catch(() => [] as KitsuEpisode[]),
      aniZipByKitsu(kitsuId).catch(() => null),
      kitsuToTvdb(kitsuId)
        .then((tid) => {
          if (!tid) return null;
          return Promise.all([
            tvdbEpisodesByType(settings.tvdbKey ?? "", tid, "default", lang),
            tvdbEpisodesAbsolute(settings.tvdbKey ?? "", tid, lang)
          ]).then(([def, abs]) => {
            const all = [...def, ...abs];
            const unique = new Map(all.map(e => [e.id, e]));
            return Array.from(unique.values());
          });
        })
        .catch(() => null),
    ]);
    let tmdbEpsRaw: TmdbEpisode[] | null = null;
    let tmdbId = 0;
    let tmdbSeason = 0;
    if (localized && settings.tmdbKey) {
      tmdbId = Number(aniZip?.mappings?.themoviedb_id);
      for (const az of Object.values(aniZip?.episodes ?? {})) {
        if (az.seasonNumber != null && az.seasonNumber > tmdbSeason) tmdbSeason = az.seasonNumber;
      }
      if (tmdbId > 0 && tmdbSeason > 0) {
        tmdbEpsRaw = await tmdbSeasonEpisodes(settings.tmdbKey, tmdbId, tmdbSeason, iso1).catch(() => null);
      }
    }
    const eps = buildKitsuEpisodes(addonMeta, raw);
    mergeAniZipEpisodes(eps, aniZip, { lang: localized ? iso1 : undefined });
    mergeTvdbEpisodes(eps, tvdbEpsRaw, { lang: localized ? iso1 : undefined });
    mergeTmdbEpisodes(eps, tmdbEpsRaw, { lang: localized ? iso1 : undefined });
    const sourceMetaId = `kitsu:${kitsuId}`;
    const out: KitsuEpisode[] = [];
    for (const ep of eps) {
      if (!isPlayable(ep)) continue;
      out.push({ ...ep, sourceMetaId });
    }
    return out;
  })();
  cache.set(cacheKey, p);
  return p;
}
