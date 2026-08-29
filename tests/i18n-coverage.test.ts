// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { readdirSync, readFileSync } from "node:fs";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import ptCoverage from "../src/lib/i18n/locales/pt/coverage.ts";
import arCoverage from "../src/lib/i18n/locales/ar/coverage.ts";
import ruCoverage from "../src/lib/i18n/locales/ru/coverage.ts";

const ROOT = new URL("../", import.meta.url);
const LANGS = ["pt", "ar", "ru"] as const;
const CALL = /\b(?:t|tr)\(\s*(["'])((?:\\.|(?!\1)[^\\])*?)\1/g;
const KEY = /^\s*"((?:\\.|[^"\\])*)"\s*:/gm;
const COVERAGE = { pt: ptCoverage, ar: arCoverage, ru: ruCoverage };

function walk(dir: URL, out: URL[] = []): URL[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = new URL(e.isDirectory() ? `${e.name}/` : e.name, dir);
    if (e.isDirectory()) {
      if (p.pathname.includes("/i18n/")) continue;
      walk(p, out);
    } else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

function uiStrings(): Set<string> {
  const out = new Set<string>();
  for (const f of walk(new URL("src/", ROOT))) {
    const src = readFileSync(f, "utf8");
    let m: RegExpExecArray | null;
    CALL.lastIndex = 0;
    while ((m = CALL.exec(src))) {
      const k = m[2].replace(/\\"/g, '"').replace(/\\'/g, "'");
      if (k && k.length <= 300) out.add(k);
    }
  }
  return out;
}

function localeKeys(lang: string): Set<string> {
  const out = new Set<string>();
  const files = [new URL(`src/lib/i18n/locales/${lang}.ts`, ROOT)];
  const dir = new URL(`src/lib/i18n/locales/${lang}/`, ROOT);
  for (const e of readdirSync(dir)) if (e.endsWith(".ts")) files.push(new URL(e, dir));
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    let m: RegExpExecArray | null;
    KEY.lastIndex = 0;
    while ((m = KEY.exec(src))) out.add(m[1].replace(/\\"/g, '"'));
  }
  return out;
}

const strings = uiStrings();

test("every translated language covers every UI string", () => {
  assert.ok(strings.size > 4000, `only found ${strings.size} UI strings, the scanner is broken`);
  for (const lang of LANGS) {
    const have = localeKeys(lang);
    const missing = [...strings].filter((k) => !have.has(k));
    assert.equal(
      missing.length,
      0,
      `${lang} is missing ${missing.length}: ${missing
        .slice(0, 6)
        .map((s) => JSON.stringify(s))
        .join(", ")}`,
    );
  }
});

test("genre names reach the catalogs even though nothing passes them as a literal", () => {
  const tags = readFileSync(new URL("src/lib/feed/tags.ts", ROOT), "utf8");
  const block = (name: string) => {
    const a = tags.indexOf(`export const ${name}`);
    return tags.slice(a, tags.indexOf("};", a));
  };
  const ENTRY = /^\s*(?:"([^"]+)"|([A-Za-z][A-Za-z0-9_]*))\s*:\s*\d+\s*,/gm;
  const names = new Set<string>();
  for (const b of [block("MOVIE_GENRES"), block("TV_GENRES")]) {
    for (const m of b.matchAll(ENTRY)) names.add(m[1] ?? m[2]);
  }
  assert.ok(names.size > 15, `only found ${names.size} genres, the scanner is broken`);
  for (const lang of LANGS) {
    const have = localeKeys(lang);
    const missing = [...names].filter((g) => !have.has(g));
    assert.deepEqual(missing, [], `${lang} is missing ${missing.length} genre names`);
  }
});

test("a translation never drops or invents a placeholder", () => {
  const ph = (s: string) => (s.match(/\{[a-zA-Z_][a-zA-Z0-9_]*\}/g) ?? []).sort().join(",");
  for (const lang of LANGS) {
    let checked = 0;
    for (const [k, v] of Object.entries(COVERAGE[lang])) {
      assert.equal(ph(v), ph(k), `${lang}: placeholders differ for ${JSON.stringify(k)}`);
      assert.ok(v.trim().length > 0, `${lang}: empty translation for ${JSON.stringify(k)}`);
      checked++;
    }
    assert.ok(checked > 400, `${lang}/coverage.ts only parsed ${checked} entries`);
  }
});

test("the fill file is spread before the hand-written catalogs so they win", () => {
  for (const lang of LANGS) {
    const src = readFileSync(new URL(`src/lib/i18n/locales/${lang}.ts`, ROOT), "utf8");
    const spread = src.indexOf("...coverage,");
    assert.ok(spread > 0, `${lang}.ts does not spread coverage`);
    const rest = src.slice(spread).match(/\.\.\.[a-zA-Z]+,/g) ?? [];
    assert.ok(rest.length > 5, `${lang}.ts spreads coverage too late to be overridable`);
  }
});
