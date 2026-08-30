import type { EBookChapterContent } from "./providers";

export type EBookFlipPages = { urls: string[]; paragraphStarts: number[] };
const WIDTH = 1200;
const HEIGHT = 1600;
const PAD_X = 118;
const PAD_Y = 124;

const canvasUrl = (canvas: HTMLCanvasElement) =>
  new Promise<string>((resolve) =>
    canvas.toBlob(
      (blob) => resolve(blob ? URL.createObjectURL(blob) : canvas.toDataURL("image/png")),
      "image/png",
    ),
  );

function wrap(text: string, measure: (value: string) => number, width: number) {
  const lines: string[] = [];
  let line = "";
  for (const word of text.trim().split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (!line || measure(next) <= width) line = next;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export async function createEBookFlipPages(options: {
  content: EBookChapterContent;
  title: string;
  direction: "ltr" | "rtl";
  page: string;
  ink: string;
  muted: string;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  cover?: string;
}): Promise<EBookFlipPages> {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) return { urls: options.cover ? [options.cover] : [], paragraphStarts: [0] };
  const bodySize = Math.round(options.fontSize * 1.72);
  const rowHeight = Math.round(bodySize * options.lineHeight);
  const rowsPerPage = Math.max(8, Math.floor((HEIGHT - PAD_Y * 2) / rowHeight));
  context.font = `${bodySize}px ${options.fontFamily}`;
  const paragraphs = (options.content.text ?? "")
    .replace(/\r/g, "")
    .split(/\n{2,}/)
    .map((value) => value.replace(/\n/g, " ").trim())
    .filter(Boolean);
  const rows = paragraphs.flatMap((paragraph, paragraphIndex) => [
    ...wrap(paragraph, (value) => context.measureText(value).width, WIDTH - PAD_X * 2).map(
      (text) => ({ text, paragraph: paragraphIndex }),
    ),
    { text: "", paragraph: paragraphIndex },
  ]);
  const urls = options.cover ? [options.cover] : [];
  const paragraphStarts = options.cover ? [0] : [];
  for (let offset = 0; offset < rows.length; offset += rowsPerPage) {
    const pageRows = rows.slice(offset, offset + rowsPerPage);
    context.fillStyle = options.page;
    context.fillRect(0, 0, WIDTH, HEIGHT);
    const gutter = context.createLinearGradient(0, 0, WIDTH, 0);
    gutter.addColorStop(options.direction === "rtl" ? 0.94 : 0.06, "rgba(0,0,0,.13)");
    gutter.addColorStop(options.direction === "rtl" ? 0.72 : 0.28, "rgba(0,0,0,0)");
    context.fillStyle = gutter;
    context.fillRect(0, 0, WIDTH, HEIGHT);
    context.direction = options.direction;
    context.textAlign = options.direction === "rtl" ? "right" : "left";
    context.textBaseline = "top";
    const x = options.direction === "rtl" ? WIDTH - PAD_X : PAD_X;
    context.fillStyle = options.ink;
    context.font = `${bodySize}px ${options.fontFamily}`;
    pageRows.forEach((row, index) => context.fillText(row.text, x, PAD_Y + index * rowHeight));
    context.fillStyle = options.muted;
    context.font = `22px ${options.fontFamily}`;
    context.textAlign = "center";
    context.fillText(`${options.title}  ·  ${urls.length + 1}`, WIDTH / 2, HEIGHT - 62);
    urls.push(await canvasUrl(canvas));
    paragraphStarts.push(pageRows[0]?.paragraph ?? 0);
    if (urls.length % 4 === 0)
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
  for (const image of options.content.images ?? []) {
    urls.push(image);
    paragraphStarts.push(Math.max(0, paragraphs.length - 1));
  }
  return { urls, paragraphStarts };
}
