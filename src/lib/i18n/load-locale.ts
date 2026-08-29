import { registerUiCatalog, uiCatalogLoaded } from "./translate";
import type { UiLanguage } from "./languages";

const inflight = new Map<UiLanguage, Promise<void>>();

/**
 * Fetch one non-English catalog on demand.
 *
 * English is compiled in and is the fallback for every missing key, so a
 * surface that renders before this resolves shows English rather than raw
 * keys. Television awaits it before mounting when the selected language is not
 * English, which costs one local chunk read and keeps the other two locales
 * off the boot path entirely.
 */
export function ensureUiLocale(lang: UiLanguage): Promise<void> {
  if (lang === "en" || uiCatalogLoaded(lang)) return Promise.resolve();
  const running = inflight.get(lang);
  if (running) return running;
  const load = (async () => {
    try {
      if (lang === "ar") registerUiCatalog("ar", (await import("./locales/ar")).default);
      else if (lang === "pt") registerUiCatalog("pt", (await import("./locales/pt")).default);
      else if (lang === "ru") registerUiCatalog("ru", (await import("./locales/ru")).default);
    } catch {
      /* English is already the fallback, so a failed locale degrades, never breaks */
    }
  })();
  inflight.set(lang, load);
  return load;
}
