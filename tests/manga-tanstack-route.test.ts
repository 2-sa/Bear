// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";

const paths = readFileSync(new URL("../src/router/paths.ts", import.meta.url), "utf8");
const router = readFileSync(new URL("../src/router/router.tsx", import.meta.url), "utf8");
const view = readFileSync(new URL("../src/lib/view.tsx", import.meta.url), "utf8");
const nav = readFileSync(new URL("../src/chrome/nav-items.tsx", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

describe("manga tab on TanStack foundation", () => {
  it("maps manga view to /manga path", () => {
    expect(paths).toMatch(/manga:\s*"\/manga"/);
  });

  it("registers a /manga tab route", () => {
    expect(router).toMatch(/tabRoute\("\/manga"\)/);
  });

  it("exposes manga frame + openManga in View API", () => {
    expect(view).toMatch(/"manga"/);
    expect(view).toMatch(/kind: "manga"/);
    expect(view).toMatch(/openManga:/);
  });

  it("includes manga in nav items", () => {
    expect(nav).toMatch(/id: "manga"/);
    expect(nav).toMatch(/view: "manga"/);
  });

  it("lazy-loads MangaView in App shell", () => {
    expect(app).toMatch(/MangaView/);
    expect(app).toMatch(/MangaFavoritesProvider/);
    expect(app).toMatch(/MangaTrackingRunner/);
  });
});
