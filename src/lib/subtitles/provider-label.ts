import type { SubResult } from "./types";

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
  r: Pick<SubResult, "source" | "title" | "release" | "url">,
): string {
  return releaseOf(r) ?? filenameFromUrl(r.url) ?? providerLabel(r);
}
