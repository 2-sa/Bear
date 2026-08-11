import type { TrackInfo } from "@/lib/player/bridge";
import {
  releaseAffinity,
  subtitleConfidenceRank,
  type SubtitleMatchConfidence,
} from "@/lib/subtitles/release-match";
import { streamTagsOf, type StreamHints } from "@/lib/subtitles/search";

export type MatchVerdict = {
  track: TrackInfo;
  score: number;
  reasons: string[];
  sourceRank: 1 | 2 | 3;
  confidence: SubtitleMatchConfidence;
};

const EMBEDDED_BONUS = 60;

function textOf(t: TrackInfo): string {
  return `${t.release ?? ""} ${t.title ?? ""} ${t.label ?? ""} ${t.externalFilename ?? ""}`;
}

export function rankByRelease(tracks: TrackInfo[], hints: StreamHints | null): MatchVerdict[] {
  if (!hints) return [];
  const tags = streamTagsOf(hints);
  return tracks
    .map((track): MatchVerdict => {
      if (!track.external) {
        return {
          track,
          score: EMBEDDED_BONUS,
          reasons: ["muxed into this file"],
          sourceRank: 3,
          confidence: "high",
        };
      }
      const { score, reasons, sourceRank, confidence } = releaseAffinity(tags, textOf(track));
      return {
        track,
        score: track.matchScore ?? score,
        reasons,
        sourceRank,
        confidence: track.matchConfidence ?? confidence,
      };
    })
    .sort(
      (a, b) =>
        subtitleConfidenceRank(b.confidence) - subtitleConfidenceRank(a.confidence) ||
        b.sourceRank - a.sourceRank ||
        b.score - a.score,
    );
}

export function pickBestMatch(pool: TrackInfo[], hints: StreamHints | null): MatchVerdict | null {
  const ranked = rankByRelease(pool, hints);
  const top = ranked[0];
  return top && subtitleConfidenceRank(top.confidence) >= 3 && top.score > 0 ? top : null;
}
