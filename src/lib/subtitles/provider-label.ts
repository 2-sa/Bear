import type { SubResult } from "./types";
import type { SubSearchQuery } from "./types";
import { subtitleReleaseLabel } from "./release-label.ts";

function meaningfulRelease(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.length <= 3 || !/[a-z0-9]{2}/i.test(trimmed)) return undefined;
  return trimmed;
}

export function providerLabel(r: Pick<SubResult, "source" | "title">): string {
  switch (r.source) {
    case "opensubtitles":
      return "OpenSubtitles";
    case "wyzie":
      return "Wyzie";
    case "subdl":
      return "SubDL";
    case "subsource":
      return "SubSource";
    case "podnapisi":
      return "Podnapisi";
    case "gestdown":
      return "Gestdown";
    case "jimaku":
      return "Jimaku";
    case "addon":
      return r.title || "Addon";
    default:
      return r.source;
  }
}

export function releaseOf(r: Pick<SubResult, "source" | "title" | "release">): string | undefined {
  const rel = meaningfulRelease(r.release);
  if (rel) return rel;
  if (r.source === "addon") return undefined;
  const title = meaningfulRelease(r.title);
  return title || undefined;
}

function filenameFromUrl(url: string): string | undefined {
  try {
    const name = decodeURIComponent(url.split(/[?#]/)[0].split("/").pop() ?? "")
      .replace(/\.(srt|vtt|ass|ssa|sub|zip)$/i, "")
      .replace(/[._]+/g, " ")
      .trim();
    if (
      name.length > 3 &&
      /[a-z]{2}/i.test(name) &&
      !/^(subtitle|subtitles|download)$/i.test(name)
    ) {
      return name;
    }
  } catch {}
  return undefined;
}

export function subtitleTitleOf(
  r: Pick<SubResult, "source" | "title" | "displayTitle" | "release" | "url">,
): string {
  return releaseOf(r) ?? filenameFromUrl(r.url) ?? r.displayTitle ?? providerLabel(r);
}

export function subtitleContextTitle(
  q: Pick<SubSearchQuery, "title" | "season" | "episode" | "filename">,
): string | undefined {
  const title = meaningfulRelease(q.title);
  const episode =
    q.season != null && q.episode != null
      ? `S${String(q.season).padStart(2, "0")}E${String(q.episode).padStart(2, "0")}`
      : undefined;
  const release = subtitleReleaseLabel(q.filename);
  const parts = [title, episode, release].filter(
    (part, index, all): part is string => Boolean(part) && all.indexOf(part) === index,
  );
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

export function subtitleStreamDescriptor(
  stream:
    | {
        title?: string | null;
        parsedTitle?: string | null;
        source?: string | null;
        resolution?: string | null;
        quality?: string | null;
        releaseGroup?: string | null;
      }
    | null
    | undefined,
): string | undefined {
  if (!stream) return undefined;
  const parts = [
    stream.title,
    stream.parsedTitle,
    stream.source === "Other" ? null : stream.source,
    stream.resolution,
    stream.quality,
    stream.releaseGroup,
  ]
    .map((part) => part?.trim())
    .filter((part, index, all): part is string => Boolean(part) && all.indexOf(part) === index);
  return parts.length > 0 ? parts.join(" ") : undefined;
}
