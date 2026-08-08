import { downloadText } from "@/lib/download-text";
import { markLimitReached } from "./limit-signal";

export async function saveSubtitleToDisk(
  url: string,
  opts: { title?: string; lang?: string; format?: string; label: string },
): Promise<"ok" | "failed" | "limited"> {
  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 429) {
      markLimitReached(url);
      return "limited";
    }
    return "failed";
  }
  const text = await res.text();
  const ext = (opts.format || "srt").toLowerCase().replace(/[^a-z0-9]/g, "") || "srt";
  const base = (opts.title || opts.lang || "subtitle").replace(/[\\/:*?"<>|]/g, "_").slice(0, 80);
  const ok = await downloadText(`${base}.${ext}`, text, [ext], opts.label);
  return ok ? "ok" : "failed";
}
