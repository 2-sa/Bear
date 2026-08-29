import { getUiLanguage } from "@/lib/i18n";
import { safeFetchStream } from "@/lib/safe-fetch";
import { setItemWithRecovery } from "@/lib/storage-recovery";
import translationInstructions from "./translation-instructions.md?raw";

const STORAGE_KEY = "harbor.ebook.translation.v1";
const CACHE_PREFIX = "harbor.ebook.translation.cache.v1.";
const ENDPOINT = "https://api.deepseek.com/chat/completions";

export type EBookTranslationSettings = {
  enabled: boolean;
  apiKey: string;
  model: string;
  targetLanguage: "en" | "ar" | "pt" | "ru";
};

const languageName = { en: "English", ar: "Arabic", pt: "Portuguese", ru: "Russian" };
export type EBookTranslation = { title: string; text: string };
const pending = new Map<string, Promise<EBookTranslation>>();

export type EBookTranslationProgress = {
  percent: number;
  etaMs: number | null;
};

function hash(value: string): string {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return `${value.length}:${result >>> 0}`;
}

export function loadEBookTranslationSettings(): EBookTranslationSettings {
  const defaults: EBookTranslationSettings = {
    enabled: false,
    apiKey: "",
    model: "deepseek-v4-flash",
    targetLanguage: getUiLanguage(),
  };
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") };
  } catch {
    return defaults;
  }
}

export function saveEBookTranslationSettings(settings: EBookTranslationSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export async function translateEBookChapter(
  source: string,
  title = "",
  manual = false,
  onProgress?: (progress: EBookTranslationProgress) => void,
): Promise<EBookTranslation> {
  const settings = loadEBookTranslationSettings();
  const original = { title, text: source };
  if (!source.trim()) return original;
  const cacheKey = `${settings.model}:${settings.targetLanguage}:${hash(translationInstructions)}:${hash(title)}:${hash(source)}`;
  try {
    const saved = JSON.parse(localStorage.getItem(`${CACHE_PREFIX}${hash(cacheKey)}`) ?? "null") as EBookTranslation | null;
    if (saved?.text) {
      onProgress?.({ percent: 100, etaMs: 0 });
      return saved;
    }
  } catch {}
  if (!settings.enabled && !manual) return original;
  if (!settings.apiKey.trim()) {
    if (manual) throw new Error("Add a DeepSeek API key in eBook Sources first");
    return original;
  }
  let request = pending.get(cacheKey);
  if (!request) {
    request = requestTranslation(source, title, settings, onProgress);
    pending.set(cacheKey, request);
    request.catch(() => pending.delete(cacheKey));
  }
  const result = await request;
  setItemWithRecovery(`${CACHE_PREFIX}${hash(cacheKey)}`, JSON.stringify(result));
  onProgress?.({ percent: 100, etaMs: 0 });
  return result;
}

async function requestTranslation(
  source: string,
  title: string,
  settings: EBookTranslationSettings,
  onProgress?: (progress: EBookTranslationProgress) => void,
): Promise<EBookTranslation> {
  onProgress?.({ percent: 0, etaMs: null });
  const response = await safeFetchStream(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${settings.apiKey.trim()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: settings.model.trim() || "deepseek-v4-flash",
      thinking: { type: "disabled" },
      temperature: 0,
      stream: true,
      stream_options: { include_usage: true },
      messages: [
        {
          role: "system",
          content: translationInstructions,
        },
        {
          role: "user",
          content: `target_language: ${languageName[settings.targetLanguage]}\nsource_language: detect\nquality_mode: standard\ntranslation_style: faithful\noutput_formats: plain text\ncustom_instructions: Translate both the chapter title and chapter body. Preserve the two XML tags exactly and return nothing outside them.\n\n<source_document>\n<chapter_title>${title}</chapter_title>\n<chapter_body>${source}</chapter_body>\n</source_document>`,
        },
      ],
    }),
  });
  if (!response.ok) throw new Error(`DeepSeek HTTP ${response.status}`);
  if (!response.body) throw new Error("DeepSeek returned no response stream");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let firstChunk = 0;
  let lastReport = 0;
  let buffer = "";
  let output = "";
  let finishReason = "";
  const consume = (line: string) => {
    if (!line.startsWith("data:")) return;
    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") return;
    const chunk = JSON.parse(data) as {
      error?: { message?: string };
      choices?: Array<{ finish_reason?: string | null; delta?: { content?: string | null } }>;
    };
    if (chunk.error?.message) throw new Error(chunk.error.message);
    const choice = chunk.choices?.[0];
    if (choice?.finish_reason) finishReason = choice.finish_reason;
    if (!choice?.delta?.content) return;
    output += choice.delta.content;
    const now = performance.now();
    if (!firstChunk) firstChunk = now;
    if (now - lastReport < 250) return;
    lastReport = now;
    const generatedMs = Math.max(1, now - firstChunk);
    const rate = output.length / generatedMs;
    const remaining = Math.max(0, source.length - output.length);
    onProgress?.({
      percent: Math.min(95, Math.max(1, Math.round((output.length / source.length) * 100))),
      etaMs: rate > 0 ? remaining / rate : null,
    });
  };
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split(/\r?\n/);
    buffer = done ? "" : (lines.pop() ?? "");
    for (const line of lines) consume(line);
    if (done) {
      if (buffer) consume(buffer);
      break;
    }
  }
  if (finishReason === "length") throw new Error("DeepSeek translation was truncated");
  if (finishReason && finishReason !== "stop")
    throw new Error(`DeepSeek stopped translation: ${finishReason.replaceAll("_", " ")}`);
  const translated = output.replace(/^```(?:text|xml)?\s*|\s*```$/gi, "").trim();
  if (!translated) throw new Error("DeepSeek returned no translation");
  const translatedTitle = translated.match(/<chapter_title>([\s\S]*?)<\/chapter_title>/i)?.[1].trim();
  const translatedText = translated.match(/<chapter_body>([\s\S]*?)<\/chapter_body>/i)?.[1].trim();
  if (!translatedText) throw new Error("DeepSeek returned an incomplete chapter translation");
  return { title: translatedTitle || title, text: translatedText };
}
