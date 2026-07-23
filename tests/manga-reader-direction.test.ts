import { describe, expect, it } from "vitest";
import {
  horizontalScrollSign,
  nextPageKey,
  pageStepForTap,
  prevPageKey,
} from "../src/views/manga/manga-reader/reader-direction.ts";
import {
  DEFAULT_PREFS,
  loadPrefs,
  PREFS_KEY,
} from "../src/views/manga/manga-reader/reader-prefs.ts";

describe("manga reader direction", () => {
  it("maps LTR tap zones to prev/next", () => {
    expect(pageStepForTap(0.1, false)).toBe("prev");
    expect(pageStepForTap(0.9, false)).toBe("next");
    expect(pageStepForTap(0.5, false)).toBe(null);
  });

  it("swaps tap zones under RTL", () => {
    expect(pageStepForTap(0.1, true)).toBe("next");
    expect(pageStepForTap(0.9, true)).toBe("prev");
  });

  it("chooses arrow keys for horizontal RTL", () => {
    expect(nextPageKey(true, true)).toBe("ArrowLeft");
    expect(prevPageKey(true, true)).toBe("ArrowRight");
    expect(nextPageKey(false, true)).toBe("ArrowRight");
    expect(prevPageKey(false, true)).toBe("ArrowLeft");
  });

  it("scrolls horizontal strips toward next in reading direction", () => {
    expect(horizontalScrollSign(false)).toBe(1);
    expect(horizontalScrollSign(true)).toBe(-1);
  });
});

describe("manga reader prefs", () => {
  it("defaults to RTL long-strip", () => {
    expect(DEFAULT_PREFS.rtl).toBe(true);
    expect(DEFAULT_PREFS.mode).toBe("long");
  });

  it("clamps invalid stored prefs", () => {
    const store = new Map<string, string>();
    const g = globalThis as { localStorage?: Storage };
    const prev = g.localStorage;
    g.localStorage = {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => {
        store.set(k, v);
      },
      removeItem: (k) => {
        store.delete(k);
      },
      clear: () => store.clear(),
      key: () => null,
      length: 0,
    };
    try {
      store.set(PREFS_KEY, JSON.stringify({ mode: "nope", zoom: 99, rtl: 1, fit: "wide" }));
      const prefs = loadPrefs();
      expect(prefs.mode).toBe(DEFAULT_PREFS.mode);
      expect(prefs.fit).toBe(DEFAULT_PREFS.fit);
      expect(prefs.zoom).toBe(3);
      expect(prefs.rtl).toBe(true);
    } finally {
      g.localStorage = prev;
    }
  });
});
