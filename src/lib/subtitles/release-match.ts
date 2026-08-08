export type SourceClass = "remux" | "bluray" | "webdl" | "webrip" | "hdtv" | "dvd" | "cam";

export type ReleaseTags = {
  group: string | null;
  source: SourceClass | null;
  resolution: string | null;
  hdr: string[];
  edition: string[];
  proper: boolean;
  repack: boolean;
};

const KNOWN_GROUPS = [
  "EVO", "RARBG", "YTS", "YIFY", "FGT", "PSA", "TBS", "GALAXYRG", "GALAXYTV", "MEGUSTA",
  "ION10", "EZTV", "NTB", "FLUX", "TEPES", "KOGI", "SMURF", "RZEROX", "D3G", "TGX",
  "SPARKS", "AMIABLE", "GECKOS", "DRONES", "CMRG", "PAHE", "QXR", "TIGOLE", "JOY",
  "FRAMESTOR", "HDMANIACS", "WIKI", "DON", "EBP", "BLURANIUM", "3L", "BMF", "TRUFFLE",
  "SICFOI", "PMTP", "KINGS", "CAKES", "SUCCESSFULCRAB", "ELITE", "TOMMY", "MZABI",
  "PLAYWEB", "XEBEC", "SEV", "NOSIVID", "TVSMASH", "MINX", "EDITH", "TEAMHD",
];

const SOURCE_PATTERNS: Array<[SourceClass, RegExp]> = [
  ["remux", /\bremux\b/i],
  ["bluray", /\b(blu-?ray|bd-?rip|br-?rip|bd(?:25|50)|bdmv)\b/i],
  ["webrip", /\bweb-?rip\b/i],
  ["webdl", /\b(web-?dl|webdl|web|amzn|dsnp|hmax|atvp|nflx|pcok|itunes)\b/i],
  ["hdtv", /\b(hdtv|pdtv|dsr)\b/i],
  ["dvd", /\b(dvd-?rip|dvd-?r|dvd5|dvd9)\b/i],
  ["cam", /\b(hd-?cam|hd-?ts|telesync|telecine|screener|\bcamrip\b)/i],
];

const EDITIONS: Array<[string, RegExp]> = [
  ["extended", /\bextended\b/i],
  ["directors", /\b(director'?s?[. _-]?cut|dc)\b/i],
  ["uncut", /\buncut\b/i],
  ["unrated", /\bunrated\b/i],
  ["theatrical", /\btheatrical\b/i],
  ["imax", /\bimax\b/i],
  ["criterion", /\bcriterion\b/i],
  ["remastered", /\bremaster(?:ed)?\b/i],
  ["finalcut", /\bfinal[. _-]?cut\b/i],
];

const HDR_TAGS: Array<[string, RegExp]> = [
  ["dv", /\b(dv|dovi|dolby[. _-]?vision)\b/i],
  ["hdr10plus", /\b(hdr10\+|hdr10plus)\b/i],
  ["hdr", /\bhdr(?!10\+)\b/i],
  ["hlg", /\bhlg\b/i],
  ["sdr", /\bsdr\b/i],
];

const COMPAT: Partial<Record<SourceClass, Partial<Record<SourceClass, number>>>> = {
  remux: { bluray: 0.85, webdl: 0.25 },
  bluray: { remux: 0.85, webdl: 0.25 },
  webdl: { webrip: 0.75, bluray: 0.25, remux: 0.25 },
  webrip: { webdl: 0.75 },
  hdtv: {},
  dvd: {},
  cam: {},
};

export function detectGroup(text: string | null | undefined): string | null {
  if (!text) return null;
  const upper = text.toUpperCase();
  for (const group of KNOWN_GROUPS) {
    if (new RegExp("(^|[^A-Z0-9])" + group + "([^A-Z0-9]|$)").test(upper)) return group;
  }
  const trailing = text.match(/[-.]([A-Za-z0-9]{3,20})(?:\.[a-z0-9]{2,4})?\s*$/);
  if (trailing) {
    const candidate = trailing[1].toUpperCase();
    if (
      !/^(MKV|MP4|AVI|SRT|ASS|SSA|VTT|1080P|720P|2160P|X264|X265|H264|H265|HEVC|AAC|DTS|DDP5|WEB)$/.test(
        candidate,
      )
    ) {
      return candidate;
    }
  }
  return null;
}

export function detectSource(text: string | null | undefined): SourceClass | null {
  if (!text) return null;
  for (const [source, pattern] of SOURCE_PATTERNS) if (pattern.test(text)) return source;
  return null;
}

export function parseRelease(text: string | null | undefined): ReleaseTags {
  const value = text ?? "";
  const resolution = value.match(/\b(2160p|1080p|720p|576p|480p)\b/i);
  const fourK = /\b(4k|uhd)\b/i.test(value) && !resolution;
  return {
    group: detectGroup(value),
    source: detectSource(value),
    resolution: resolution ? resolution[1].toLowerCase() : fourK ? "2160p" : null,
    hdr: HDR_TAGS.filter(([, pattern]) => pattern.test(value)).map(([tag]) => tag),
    edition: EDITIONS.filter(([, pattern]) => pattern.test(value)).map(([edition]) => edition),
    proper: /\bproper\b/i.test(value),
    repack: /\brepack\b/i.test(value),
  };
}

export function sourceAffinity(wanted: SourceClass | null, actual: SourceClass | null): number {
  if (!wanted || !actual) return 0;
  if (wanted === actual) return 1;
  return COMPAT[wanted]?.[actual] ?? 0;
}

export type AffinityResult = { score: number; reasons: string[] };

export function releaseAffinity(stream: ReleaseTags, subtitleText: string): AffinityResult {
  const subtitle = parseRelease(subtitleText);
  const reasons: string[] = [];
  let score = 0;

  if (stream.group && subtitle.group && stream.group === subtitle.group) {
    score += 120;
    reasons.push("same release group " + subtitle.group);
  }

  if (stream.source && subtitle.source) {
    const affinity = sourceAffinity(stream.source, subtitle.source);
    if (affinity >= 1) {
      score += 45;
      reasons.push(subtitle.source + " matches the stream");
    } else if (affinity > 0) {
      score += Math.round(45 * affinity);
      reasons.push(subtitle.source + " is close to " + stream.source);
    } else {
      score -= 30;
      reasons.push(subtitle.source + " timing differs from " + stream.source);
    }
  } else if (stream.source && !subtitle.source) {
    score += 2;
  }

  if (stream.resolution && subtitle.resolution) {
    if (stream.resolution === subtitle.resolution) {
      score += 8;
      reasons.push(subtitle.resolution);
    } else {
      score -= 4;
    }
  }

  if (stream.hdr.length && subtitle.hdr.length) {
    const shared = subtitle.hdr.filter((tag) => stream.hdr.includes(tag));
    if (shared.length) {
      score += 10;
      reasons.push(shared.join(" "));
    }
  }

  const streamEditions = stream.edition.filter((edition) => edition !== "remastered");
  const subtitleEditions = subtitle.edition.filter((edition) => edition !== "remastered");
  if (streamEditions.length && subtitleEditions.length) {
    const shared = subtitleEditions.filter((edition) => streamEditions.includes(edition));
    if (shared.length) {
      score += 25;
      reasons.push(shared[0] + " edition");
    } else {
      score -= 25;
      reasons.push("different edition (" + subtitleEditions[0] + ")");
    }
  } else if (streamEditions.length && !subtitleEditions.length) {
    score -= 10;
  } else if (!streamEditions.length && subtitleEditions.length) {
    score -= 15;
    reasons.push(subtitleEditions[0] + " cut, stream is not");
  }

  if (stream.proper === subtitle.proper && stream.proper) {
    score += 6;
  } else if (subtitle.proper !== stream.proper) {
    score -= 3;
  }
  if (stream.repack === subtitle.repack && stream.repack) score += 4;

  return { score, reasons };
}
