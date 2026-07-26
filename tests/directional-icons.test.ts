// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { readFileSync, readdirSync } from "node:fs";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

const PHYSICAL_ARROW_FILES = new Set([
  "components/player/transport/control-renderer-stremio.tsx",
  "components/player/transport/control-renderer.tsx",
  "views/manga/manga-reader/reader-footer.tsx",
  "views/manga/manga-reader/reader-states.tsx",
  "views/mobile/manga-read/reader-dock.tsx",
  "views/mobile/manga-remote/manga-page-surface.tsx",
  "views/mobile/manga-remote/manga-remote.tsx",
  "views/mobile/manga-remote/zoom-joystick.tsx",
  "views/remote-app.tsx",
  "views/service.tsx",
  "views/settings/player-layout-panel/floating-inspector.tsx",
]);

function tsxFiles(path: URL, prefix = ""): Array<{ path: URL; relative: string }> {
  return readdirSync(path, { withFileTypes: true }).flatMap(
    (entry: { name: string; isDirectory: () => boolean }) => {
      const relative = `${prefix}${entry.name}`;
      const url = new URL(entry.name + (entry.isDirectory() ? "/" : ""), path);
      if (entry.isDirectory()) return tsxFiles(url, `${relative}/`);
      return entry.name.endsWith(".tsx") ? [{ path: url, relative }] : [];
    },
  );
}

test("logical arrow icons rotate in RTL without replacing hover transforms", () => {
  const css = read("../src/index.css");
  const rtlRule = css.match(/\[dir="rtl"\] \.dir-icon\s*\{([^}]+)\}/)?.[1] ?? "";

  assert.match(rtlRule, /rotate:\s*180deg/);
  assert.doesNotMatch(rtlRule, /transform\s*:/);
  assert.doesNotMatch(rtlRule, /scaleX/);
});

test("semantic navigation arrows use the shared direction utility", () => {
  const files = [
    "../src/views/manga.tsx",
    "../src/views/manga/manga-detail.tsx",
    "../src/views/manga/manga-downloads.tsx",
    "../src/views/manga/manga-sources-panel.tsx",
    "../src/views/manga/manga-universes.tsx",
    "../src/views/grid.tsx",
    "../src/views/library/list-detail.tsx",
    "../src/views/mobile/mobile-service-page.tsx",
    "../src/views/mobile/mobile-genre-page.tsx",
    "../src/views/mobile/mobile-services.tsx",
  ];

  for (const file of files) {
    const source = read(file);
    const horizontalIcons = source.match(
      /<(?:ArrowLeft|ArrowRight|ChevronLeft|ChevronRight)\b(?:(?!>).)*>/gs,
    );
    assert.ok(horizontalIcons?.length, `${file} should contain a horizontal navigation icon`);
    for (const icon of horizontalIcons) {
      assert.match(icon, /className="[^"]*\bdir-icon\b/, `${file}: ${icon}`);
    }
  }
});

test("semantic arrows do not use one-off RTL scale transforms", () => {
  const files = [
    "../src/views/addons/hero-card.tsx",
    "../src/components/player/ad-report-modal/about-panel.tsx",
    "../src/components/profile-picker/editor-view.tsx",
  ];

  for (const file of files) {
    assert.doesNotMatch(read(file), /rtl:-?scale-x-100|rotate-180 rtl:rotate-0/);
  }
});

test("every unmirrored horizontal arrow belongs to an explicitly physical control", () => {
  const failures: string[] = [];
  for (const file of tsxFiles(new URL("../src/", import.meta.url))) {
    const icons = readFileSync(file.path, "utf8").match(
      /<(?:ArrowLeft|ArrowRight|ChevronLeft|ChevronRight|ChevronsLeft|ChevronsRight)\b(?:(?!>).)*>/gs,
    );
    for (const icon of icons ?? []) {
      if (!icon.includes("dir-icon") && !PHYSICAL_ARROW_FILES.has(file.relative)) {
        failures.push(`${file.relative}: ${icon.replace(/\s+/g, " ")}`);
      }
    }
  }
  assert.deepEqual(failures, []);
});

test("shared scroll rows advance in the document direction", () => {
  const source = read("../src/components/arrowed-scroll-row.tsx");
  assert.match(source, /const rtl = getComputedStyle\(el\)\.direction === "rtl";/);
  assert.match(source, /const delta = \(rtl \? -dir : dir\) \* el\.clientWidth \* 0\.85;/);
});
