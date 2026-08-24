import { aniZipByKitsu } from "@/lib/providers/anizip";
import { externalToKitsu, imdbToKitsu, tmdbTvToKitsu } from "@/lib/providers/anime-mapping";
import type { PlayEpisode } from "@/lib/view";
import {
  animeAbsoluteFromScopedId,
  animeCoordPairs,
  findAnimeEntryNumber,
  type AnimeEpisodeCoords,
} from "./anime-identity-core";
import { buildStreamIds } from "./stream-ids";

const ANIME_META_RX = /^(kitsu|mal|anilist|anidb):(\d+)/;

export type AnimeStreamIdentity = { streamId: string; kitsuId: number; number: number };

async function baseKitsuId(metaId: string): Promise<number | null> {
  const match = ANIME_META_RX.exec(metaId);
  if (match) {
    if (match[1] === "kitsu") return Number(match[2]);
    if (match[1] === "mal") return externalToKitsu("myanimelist", Number(match[2])).catch(() => null);
    return externalToKitsu(match[1], Number(match[2])).catch(() => null);
  }
  if (/^tt\d+/.test(metaId)) return imdbToKitsu(metaId).catch(() => null);
  const tmdb = /^tmdb:tv:(\d+)/.exec(metaId);
  if (tmdb) return tmdbTvToKitsu(Number(tmdb[1])).catch(() => null);
  return null;
}

/**
 * True when a stream query for this meta/episode should attempt kitsu identity
 * resolution: non-anime-native ids opened with an episode that carries no
 * kitsu stream id of its own. Specials (season 0) stay on legacy paths.
 */
export function animeIdentityEligible(
  metaId: string,
  episode: PlayEpisode | null | undefined,
): boolean {
  if (!episode) return false;
  if (episode.kitsuStreamId != null) return false;
  if (ANIME_META_RX.test(metaId)) return false;
  if (!(metaId.startsWith("tt") || metaId.startsWith("tmdb:tv:"))) return false;
  const season = episode.imdbSeason ?? episode.season;
  return typeof season === "number" && season >= 1;
}

const identityCache = new Map<string, Promise<AnimeStreamIdentity | null>>();
const IDENTITY_CACHE_MAX = 400;

async function resolveTask(
  metaId: string,
  imdbId: string | null,
  coords: AnimeEpisodeCoords,
): Promise<AnimeStreamIdentity | null> {
  let kitsuId = await baseKitsuId(metaId);
  if (kitsuId == null && imdbId && /^tt\d+/.test(imdbId) && !metaId.startsWith("tt")) {
    kitsuId = await imdbToKitsu(imdbId).catch(() => null);
  }
  if (kitsuId == null) return null;
  const az = await aniZipByKitsu(kitsuId).catch(() => null);
  const number = findAnimeEntryNumber(az, animeCoordPairs(coords));
  if (number == null) return null;
  return { streamId: `kitsu:${kitsuId}:${number}`, kitsuId, number };
}

export function resolveAnimeIdentity(
  metaId: string,
  imdbId: string | null,
  episode: AnimeEpisodeCoords | null | undefined,
): Promise<AnimeStreamIdentity | null> {
  const pairs = animeCoordPairs(episode);
  if (pairs.length === 0) return Promise.resolve(null);
  const key = `${metaId}|${imdbId ?? ""}|${pairs.map((p) => p.join(":")).join("|")}`;
  const hit = identityCache.get(key);
  if (hit) return hit;
  const task = resolveTask(metaId, imdbId, episode ?? {});
  if (identityCache.size >= IDENTITY_CACHE_MAX) identityCache.clear();
  identityCache.set(key, task);
  return task;
}

/**
 * Legacy id list augmented with a resolved `kitsu:{entry}:{n}` query for
 * tt/tmdb-opened anime. The resolved id goes first; addons pick ids by their
 * own manifest prefixes, so tt-only addons still receive the legacy ids.
 */
export function animeAbsoluteFromStreamIds(ids: string[] | null | undefined): number | null {
  if (!ids) return null;
  for (const id of ids) {
    const n = animeAbsoluteFromScopedId(id);
    if (n != null) return n;
  }
  return null;
}

export async function buildStreamIdsWithIdentity(
  metaId: string,
  episode: PlayEpisode | undefined,
  imdbId: string | null,
  defaultVideoId?: string | null,
): Promise<string[]> {
  const base = buildStreamIds(metaId, episode, imdbId, defaultVideoId);
  if (!animeIdentityEligible(metaId, episode)) return base;
  const identity = await resolveAnimeIdentity(metaId, imdbId, episode);
  if (!identity || base.includes(identity.streamId)) return base;
  return [identity.streamId, ...base];
}
