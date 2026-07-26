// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { readFileSync } from "node:fs";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";

const refreshModule = await import("../src/lib/manga/refresh.ts").catch(() => ({}));

test("manga refresh clears every cache layer without discarding the visible TanStack pages", async () => {
  const refreshMangaData = Reflect.get(refreshModule, "refreshMangaData");
  assert.equal(typeof refreshMangaData, "function");

  const calls: string[] = [];
  const queryClient = {
    cancelQueries: async ({ queryKey }: { queryKey: readonly unknown[] }) => {
      assert.deepEqual(queryKey, ["harbor", "manga"]);
      calls.push("cancel");
    },
    invalidateQueries: async ({ queryKey }: { queryKey: readonly unknown[] }) => {
      assert.deepEqual(queryKey, ["harbor", "manga"]);
      calls.push("invalidate");
    },
  };

  await refreshMangaData(queryClient, () => calls.push("clear"));

  assert.deepEqual(calls, ["cancel", "clear", "invalidate"]);
});

test("manga data changes stay pending until the browse view consumes them", () => {
  const notifyMangaDataChanged = Reflect.get(refreshModule, "notifyMangaDataChanged");
  const consumeMangaDataChange = Reflect.get(refreshModule, "consumeMangaDataChange");
  const subscribeMangaDataChanges = Reflect.get(refreshModule, "subscribeMangaDataChanges");

  assert.equal(typeof notifyMangaDataChanged, "function");
  assert.equal(typeof consumeMangaDataChange, "function");
  assert.equal(typeof subscribeMangaDataChanges, "function");

  let notifications = 0;
  const unsubscribe = subscribeMangaDataChanges(() => {
    notifications += 1;
  });

  notifyMangaDataChanged();
  assert.equal(notifications, 1);
  assert.equal(consumeMangaDataChange(), true);
  assert.equal(consumeMangaDataChange(), false);

  unsubscribe();
  notifyMangaDataChanged();
  assert.equal(notifications, 1);
  assert.equal(consumeMangaDataChange(), true);
});

test("manga cache clearing includes Suwayomi transports, sources, and cursors", () => {
  const api = readFileSync("src/lib/manga/api.ts", "utf8");
  const transport = readFileSync("src/lib/manga/sources/suwayomi/transport.ts", "utf8");
  const model = readFileSync("src/lib/manga/sources/suwayomi/model.ts", "utf8");

  assert.match(transport, /export function clearSuwayomiTransportCache/);
  assert.match(model, /export function clearSuwayomiCursors/);
  assert.match(api, /clearSuwayomiTransportCache\(\)/);
  assert.match(api, /clearSuwayomiCursors\(\)/);
});

test("manga browse exposes refresh and source changes request it automatically", () => {
  const browse = readFileSync("src/views/manga/manga-browse.tsx", "utf8");
  const sources = readFileSync("src/lib/manga/sources.ts", "utf8");
  const extensionRow = readFileSync(
    "src/views/manga/manga-sources-panel/suwayomi/extension-row.tsx",
    "utf8",
  );

  assert.match(browse, /RefreshCw/);
  assert.match(browse, /refreshMangaData/);
  assert.match(browse, /subscribeMangaDataChanges/);
  assert.match(browse, /consumeMangaDataChange/);
  assert.match(sources, /notifyMangaDataChanged\(\)/);
  assert.match(extensionRow, /notifyMangaDataChanged\(\)/);
});
