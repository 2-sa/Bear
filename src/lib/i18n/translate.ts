import en from "./locales/en";
import { getUiLanguage, useUiLanguage } from "./store";
import { isRtl, LANGUAGES, type UiLanguage } from "./languages";

type Vars = Record<string, string | number>;

// Only English is wired in here. Arabic, Portuguese and Russian are 1.97MB of
// the television's 2.95MB render-blocking chunk, 66.7% of it, and a stick
// showing English pays all of it and reads none of it. Worse than the parse:
// each locale barrel spreads about 27 sub-objects into one 8,000-property
// object, so 22,765 properties are materialised and copied again before React
// exists. Desktop keeps its exact old timing by importing i18n-eager before it
// mounts; television loads only the language actually selected.
const catalogs: Partial<Record<UiLanguage, Record<string, string>>> = { en };

let version = 0;
const listeners = new Set<() => void>();

export function registerUiCatalog(lang: UiLanguage, table: Record<string, string>): void {
  if (lang === "en" || catalogs[lang]) return;
  catalogs[lang] = table;
  reverseCache.delete(lang);
  version += 1;
  for (const fn of listeners) fn();
}

export function uiCatalogVersion(): number {
  return version;
}

export function subscribeUiCatalog(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function uiCatalogLoaded(lang: UiLanguage): boolean {
  return Boolean(catalogs[lang]);
}

export type PluralForm = "one" | "few" | "many";

const VARIANT_SEP = "#";
const VARIANT_SUFFIX = /#(?:one|few|many)$/;

const PLURAL_RULES: Partial<Record<UiLanguage, (n: number) => PluralForm>> = {
  ru: (n) => {
    if (!Number.isInteger(n)) return "many";
    const abs = Math.abs(n);
    const mod10 = abs % 10;
    const mod100 = abs % 100;
    if (mod10 === 1 && mod100 !== 11) return "one";
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "few";
    return "many";
  },
};

export function pluralForm(lang: UiLanguage, n: number): PluralForm | null {
  return PLURAL_RULES[lang]?.(n) ?? null;
}

function countFor(key: string, vars?: Vars): number | null {
  if (!vars) return null;
  for (const match of key.matchAll(/\{([A-Za-z0-9_]+)\}/g)) {
    const value = vars[match[1]];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

// Built per language on first use, never for every language at import time.
// Eagerly it walked all 22,765 non-English entries during boot to serve a
// function that most sessions never call.
const reverseCache = new Map<UiLanguage, Map<string, string>>();

function reverseFor(lang: UiLanguage): Map<string, string> {
  const hit = reverseCache.get(lang);
  if (hit) return hit;
  const reverse = new Map<string, string>();
  for (const [key, value] of Object.entries(catalogs[lang] ?? {})) {
    const base = key.replace(VARIANT_SUFFIX, "");
    if (!reverse.has(value)) reverse.set(value, base);
  }
  reverseCache.set(lang, reverse);
  return reverse;
}

function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  let out = template;
  for (const [name, value] of Object.entries(vars)) {
    out = out.split(`{${name}}`).join(String(value));
  }
  return out;
}

function applyDisplayBrand(text: string): string {
  return text.replace(/\bHarbor\b/g, "Bear").replace(/\bHARBOR\b/g, "BEAR");
}

function resolve(lang: UiLanguage, key: string, vars?: Vars): string {
  const catalog = catalogs[lang];
  if (catalog) {
    const rule = PLURAL_RULES[lang];
    if (rule) {
      const n = countFor(key, vars);
      if (n !== null) {
        const variant = catalog[`${key}${VARIANT_SEP}${rule(n)}`];
        if (variant !== undefined) return variant;
      }
    }
    const active = catalog[key];
    if (active !== undefined) return active;
  }
  const fallback = en[key];
  if (fallback !== undefined) return fallback;
  return key;
}

export function t(key: string, vars?: Vars): string {
  return applyDisplayBrand(interpolate(resolve(getUiLanguage(), key, vars), vars));
}

export function sourceTranslationKey(value: string): string {
  return reverseFor(getUiLanguage()).get(value) ?? value;
}

export function useT(): (key: string, vars?: Vars) => string {
  const lang = useUiLanguage();
  return (key: string, vars?: Vars) =>
    applyDisplayBrand(interpolate(resolve(lang, key, vars), vars));
}

export { useUiLanguage, isRtl, LANGUAGES };
