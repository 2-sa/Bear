// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { readFileSync } from "node:fs";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";

const read = (path: string) => {
  try {
    return readFileSync(new URL(path, import.meta.url), "utf8");
  } catch {
    return "";
  }
};

test("manga bookmarks are reachable from the desktop chrome", () => {
  const popover = read("../src/components/bookmarks-popover.tsx");
  const topbar = read("../src/chrome/topbar.tsx");

  assert.match(popover, /useMangaBookmarks/);
  assert.match(popover, /setMangaReadIntent/);
  assert.match(popover, /removeMangaBookmark/);
  assert.match(topbar, /import \{ BookmarksButton \}/);
  assert.match(topbar, /<BookmarksButton \/>/);
});

test("anime hero exposes manga collection and award links from beta", () => {
  const hero = read("../src/components/anime-hero.tsx");
  const badges = read("../src/components/anime-hero/hero-slide-badges.tsx");

  assert.match(hero, /<HeroSlideBadges meta=\{current\} \/>/);
  assert.match(badges, /<CollectionBadges title=\{meta\.name\}/);
  assert.match(badges, /groupWinsBySource/);
});

test("per-profile Continue Watching is enforced in every desktop and mobile surface", () => {
  const paths = [
    "../src/lib/continue-watching.ts",
    "../src/views/home.tsx",
    "../src/views/anime.tsx",
    "../src/views/shows.tsx",
    "../src/views/settings/library-panel.tsx",
    "../src/views/mobile/mobile-cw-row.tsx",
  ];

  for (const path of paths) {
    assert.match(read(path), /cwPerProfile/, `${path} must enforce or expose cwPerProfile`);
  }

  const localStore = read("../src/lib/local-cw.ts");
  assert.match(localStore, /harbor\.localcw\.v1\./);
  assert.match(localStore, /harbor:active-profile-changed/);
});

test("AI provider selection stays consistent across settings, desktop search, and mobile search", () => {
  const overlay = read("../src/components/search/search-overlay.tsx");
  const settings = read("../src/views/settings/ai-search-section.tsx");
  const mobile = read("../src/views/mobile/mobile-search.tsx");

  assert.match(overlay, /aiSearchProvider:\s*providerTabFor\(id\)/);
  assert.match(settings, /settings\.aiSearchProvider/);
  assert.match(settings, /update\(\{\s*aiSearchProvider:/);
  assert.match(mobile, /aiSearchProvider/);
});

test("remote service browser has complete settings and provider definitions", () => {
  const types = read("../src/lib/settings/types.ts");
  const defaults = read("../src/lib/settings/defaults.ts");
  const providers = read("../src/lib/providers/streaming.ts");
  const mobileServices = read("../src/views/mobile/mobile-services.tsx");

  for (const service of ["amcplus", "starz", "shudder"]) {
    assert.match(types, new RegExp(`"${service}"`));
    assert.match(defaults, new RegExp(`${service}: true`));
    assert.match(providers, new RegExp(`${service}: \\{`));
  }
  assert.match(mobileServices, /Object\.keys\(SERVICES\)/);
});
