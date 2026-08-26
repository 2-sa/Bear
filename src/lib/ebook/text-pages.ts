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

function canvasUrl(canvas: HTMLCanvasElement): Promise<string> {
  return new Promise((resolve) =>
    canvas.toBlob(
      (blob) => resolve(blob ? URL.createObjectURL(blob) : canvas.toDataURL("image/png")),
      "image/png",
    ),
  );
}

export async function createEBookPages(
  content: EBookChapterContent,
  direction: "ltr" | "rtl",
): Promise<MangaPage[]> {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
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
    pages.push({ url: await canvasUrl(canvas) });
    if (pages.length % 4 === 0)
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
  pages.push(...(content.images ?? []).map((url) => ({ url })));
  return pages;
}
