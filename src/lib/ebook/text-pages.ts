import type { MangaPage } from "@/views/manga/manga-reader/reader-types";
import type { EBookChapterContent } from "./providers";

const WIDTH = 900;
const HEIGHT = 1200;
const PAD = 78;
const FONT = 29;
const LINE = 48;
const MAX_LINES = Math.floor((HEIGHT - PAD * 2) / LINE);

function wrap(text: string, measure: (value: string) => number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (measure(next) <= WIDTH - PAD * 2) {
      line = next;
      continue;
    }
    if (line) lines.push(line);
    line = word;
  }
  if (line) lines.push(line);
  return lines;
}

export function createEBookPages(
  content: EBookChapterContent,
  direction: "ltr" | "rtl",
): MangaPage[] {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return (content.images ?? []).map((url) => ({ url }));
  context.font = `${FONT}px Georgia, serif`;
  const lines = (content.text ?? "")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replaceAll("\n", " ").trim())
    .map((paragraph) => wrap(paragraph, (value) => context.measureText(value).width))
    .filter((paragraph) => paragraph.length)
    .flatMap((paragraph) => [...paragraph, ""]);
  const pages: MangaPage[] = [];
  for (let offset = 0; offset < lines.length; offset += MAX_LINES) {
    const page = lines.slice(offset, offset + MAX_LINES);
    context.fillStyle = "#f6f1e7";
    context.fillRect(0, 0, WIDTH, HEIGHT);
    context.fillStyle = "#211f1b";
    context.font = `${FONT}px Georgia, serif`;
    context.direction = direction;
    context.textAlign = direction === "rtl" ? "right" : "left";
    context.textBaseline = "top";
    const x = direction === "rtl" ? WIDTH - PAD : PAD;
    page.forEach((line, index) => context.fillText(line, x, PAD + index * LINE));
    pages.push({ url: canvas.toDataURL("image/png") });
  }
  pages.push(...(content.images ?? []).map((url) => ({ url })));
  return pages;
}

