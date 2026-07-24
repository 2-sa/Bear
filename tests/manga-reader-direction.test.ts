// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { describe, it } from "node:test";

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
    assert.equal(pageStepForTap(0.1, false), "prev");
    assert.equal(pageStepForTap(0.9, false), "next");
    assert.equal(pageStepForTap(0.5, false), null);
  });

  it("swaps tap zones under RTL", () => {
    assert.equal(pageStepForTap(0.1, true), "next");
    assert.equal(pageStepForTap(0.9, true), "prev");
  });

  it("chooses arrow keys for horizontal RTL", () => {
    assert.equal(nextPageKey(true, true), "ArrowLeft");
    assert.equal(prevPageKey(true, true), "ArrowRight");
    assert.equal(nextPageKey(false, true), "ArrowRight");
    assert.equal(prevPageKey(false, true), "ArrowLeft");
  });

  it("scrolls horizontal strips toward next in reading direction", () => {
    assert.equal(horizontalScrollSign(false), 1);
    assert.equal(horizontalScrollSign(true), -1);
  });
});

describe("manga reader prefs", () => {
  it("defaults to RTL long-strip", () => {
    assert.equal(DEFAULT_PREFS.rtl, true);
    assert.equal(DEFAULT_PREFS.mode, "long");
  });

  it("clamps invalid stored prefs", () => {
    const store = new Map<string, string>();
    const g = globalThis as { localStorage?: Storage };
    const previousLocalStorage = g.localStorage;

    g.localStorage = {
      getItem: (key) => store.get(key) ?? null,

      setItem: (key, value) => {
        store.set(key, value);
      },

      removeItem: (key) => {
        store.delete(key);
      },

      clear: () => {
        store.clear();
      },

      key: (index) => [...store.keys()][index] ?? null,

      get length() {
        return store.size;
      },
    };

    try {
      store.set(
        PREFS_KEY,
        JSON.stringify({
          mode: "nope",
          zoom: 99,
          rtl: 1,
          fit: "wide",
        }),
      );

      const prefs = loadPrefs();

      assert.equal(prefs.mode, DEFAULT_PREFS.mode);
      assert.equal(prefs.fit, DEFAULT_PREFS.fit);
      assert.equal(prefs.zoom, 3);
      assert.equal(prefs.rtl, true);
    } finally {
      g.localStorage = previousLocalStorage;
    }
  });
});
