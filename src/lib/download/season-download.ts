import type { Addon } from "@/lib/addons";
import { resolveBestDownload } from "@/lib/auto-download/resolve";
import type { Meta } from "@/lib/cinemeta";
import type { PlayEpisode } from "@/lib/view";
import { gatherContext } from "@/lib/auto-download/context";
import { resolveBestDownload } from "@/lib/auto-download/resolve";
import { activeDownloadFor, enqueueDownload } from "@/lib/download/downloads-store";

function limiter(max: number) {
  let active = 0;
  const queue: Array<() => void> = [];
  const release = () => {
    active -= 1;
    queue.shift()?.();
  };
  return async <T>(fn: () => Promise<T>): Promise<T> => {
    if (active >= max) await new Promise<void>((r) => queue.push(r));
    active += 1;
    try {
      return await fn();
    } finally {
      release();
    }
  };
}

export function pendingSeasonEpisodes(metaId: string, episodes: PlayEpisode[]): PlayEpisode[] {
  return episodes.filter((ep) => {
    const dl = activeDownloadFor(metaId, ep.season ?? null, ep.episode ?? null);
    return !dl || dl.status === "error";
  });
}

export async function downloadSeason(meta: Meta, episodes: PlayEpisode[]): Promise<number> {
  const targets = pendingSeasonEpisodes(meta.id, episodes);
  if (targets.length === 0) return 0;
  const ctx = await gatherContext();
  const controller = new AbortController();
  const limit = limiter(1);
  let queued = 0;
  await Promise.all(
    targets.map((ep) =>
      limit(async () => {
        const hit = await resolveBestDownload(meta, ep, {
          allowP2p: true,
          maxHeight: null,
          debrids: ctx.debrids,
          addons: ctx.addons,
          signal: controller.signal,
        }).catch(() => null);
        if (!hit) return;
        await enqueueDownload({
          meta,
          episode: ep,
          streamLabel: hit.label,
          url: hit.url,
          headers: hit.headers ?? null,
        }).catch(() => {});
        queued += 1;
      }),
    ),
  );
  return queued;
}

export async function downloadSeasonPerEpisode({
  meta,
  episodes,
  addons,
  debrids,
  allowP2p,
  signal,
  onProgress,
}: {
  meta: Meta;
  episodes: PlayEpisode[];
  addons: Addon[];
  debrids: DebridStore[];
  allowP2p: boolean;
  signal: AbortSignal;
  onProgress?: (done: number, total: number) => void;
}): Promise<SeasonDownloadResult> {
  const targets = pendingSeasonEpisodes(meta.id, episodes);
  const result: SeasonDownloadResult = { total: targets.length, queued: 0, failed: 0 };
  if (targets.length === 0 || signal.aborted) return result;

  let settled = 0;
  const limit = limiter(MAX_CONCURRENT);
  await Promise.all(
    targets.map((ep) =>
      limit(async () => {
        if (signal.aborted) return;
        const hit = await resolveBestDownload(meta, ep, {
          allowP2p,
          maxHeight: null,
          imdbId: null,
          debrids,
          addons,
          signal,
        }).catch(() => null);
        if (signal.aborted) return;
        if (!hit) {
          result.failed += 1;
        } else {
          try {
            await enqueueDownload({
              meta,
              episode: ep,
              streamLabel: hit.label,
              url: hit.url,
              headers: hit.headers ?? null,
            });
            result.queued += 1;
          } catch {
            result.failed += 1;
          }
        }
        settled += 1;
        onProgress?.(settled, targets.length);
      }),
    ),
  );
  return result;
}
