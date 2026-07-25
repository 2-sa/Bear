// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import * as queue from "../src/lib/queue.ts";

const stillWatching = (await import("../src/lib/still-watching.ts").catch(() => ({}))) as Record<
  string,
  unknown
>;

const firstMeta = { id: "tt-first", type: "series", name: "First" } as const;
const secondMeta = { id: "tt-second", type: "movie", name: "Second" } as const;
const thirdMeta = { id: "tt-third", type: "series", name: "Third" } as const;
const firstEpisode = { season: 1, episode: 1 };
const thirdEpisode = { season: 2, episode: 4 };

test("queue positional helpers use media and episode identity without removing entries", () => {
  assert.equal(typeof (queue as Record<string, unknown>).queueIndexOf, "function");
  assert.equal(typeof (queue as Record<string, unknown>).queueItemAfter, "function");
  assert.equal(typeof (queue as Record<string, unknown>).queueItemBefore, "function");

  queue.queueClear();
  queue.queueAdd(firstMeta, firstEpisode);
  queue.queueAdd(secondMeta);
  queue.queueAdd(thirdMeta, thirdEpisode);

  assert.equal(queue.queueIndexOf(firstMeta, { ...firstEpisode }), 0);
  assert.equal(queue.queueIndexOf(firstMeta, { season: 1, episode: 2 }), -1);
  assert.equal(queue.queueIndexOf({ ...secondMeta }), 1);
  assert.equal(queue.queueIndexOf({ ...thirdMeta }, { ...thirdEpisode }), 2);
  assert.equal(queue.queueIndexOf({ id: "missing", type: "movie", name: "Missing" }), -1);

  assert.equal(queue.queueItemBefore(firstMeta, firstEpisode), null);
  assert.equal(queue.queueItemAfter(firstMeta, firstEpisode)?.meta.id, secondMeta.id);
  assert.equal(queue.queueItemBefore(thirdMeta, thirdEpisode)?.meta.id, secondMeta.id);
  assert.equal(queue.queueItemAfter(thirdMeta, thirdEpisode), null);
  assert.equal(queue.queueItemAfter({ id: "missing", type: "movie", name: "Missing" }), null);

  assert.equal(queue.queueIndexOf(firstMeta, firstEpisode), 0);
  assert.equal(queue.queueIndexOf(secondMeta), 1);
  assert.equal(queue.queueIndexOf(thirdMeta, thirdEpisode), 2);
  queue.queueClear();
});

test("Still Watching clamps its threshold to the supported range", () => {
  const clamp = stillWatching.clampStillWatchingThreshold;
  assert.equal(typeof clamp, "function");
  const clampThreshold = clamp as (value: unknown) => number;
  assert.equal(clampThreshold(-3), 1);
  assert.equal(clampThreshold(4.6), 5);
  assert.equal(clampThreshold(99), 10);
  assert.equal(clampThreshold(Number.NaN), 3);
});

test("Still Watching holds the pending episode when an uninterrupted run reaches the threshold", () => {
  const initial = stillWatching.initialStillWatchingState;
  const request = stillWatching.requestStillWatchingAdvance;
  assert.equal(typeof initial, "function");
  assert.equal(typeof request, "function");

  const initialState = (initial as () => unknown)();
  const requestAdvance = request as (
    state: unknown,
    pending: { season: number; episode: number },
    enabled: boolean,
    threshold: number,
  ) => { state: { runCount: number; pending: unknown }; held: boolean };

  const first = requestAdvance(initialState, { season: 1, episode: 2 }, true, 3);
  const second = requestAdvance(first.state, { season: 1, episode: 3 }, true, 3);
  const third = requestAdvance(second.state, { season: 1, episode: 4 }, true, 3);

  assert.deepEqual([first.held, second.held, third.held], [false, false, true]);
  assert.equal(third.state.runCount, 2);
  assert.deepEqual(third.state.pending, { season: 1, episode: 4 });
});

test("Still Watching interaction and decisions reset the automatic run", () => {
  const request = stillWatching.requestStillWatchingAdvance;
  const resetRun = stillWatching.resetStillWatchingRun;
  const resolve = stillWatching.resolveStillWatchingPrompt;
  assert.equal(typeof request, "function");
  assert.equal(typeof resetRun, "function");
  assert.equal(typeof resolve, "function");

  const requestAdvance = request as (
    state: unknown,
    pending: { season: number; episode: number },
    enabled: boolean,
    threshold: number,
  ) => { state: { runCount: number; pending: unknown }; held: boolean };
  const reset = resetRun as (state: unknown) => { runCount: number; pending: unknown };
  const resolvePrompt = resolve as (state: unknown) => {
    state: { runCount: number; pending: unknown };
    pending: unknown;
  };

  const started = requestAdvance(
    { runCount: 0, pending: null },
    { season: 1, episode: 2 },
    true,
    2,
  );
  const interacted = reset(started.state);
  assert.deepEqual(interacted, { runCount: 0, pending: null });

  const held = requestAdvance(interacted, { season: 1, episode: 3 }, true, 1);
  const resolved = resolvePrompt(held.state);
  assert.deepEqual(resolved.pending, { season: 1, episode: 3 });
  assert.deepEqual(resolved.state, { runCount: 0, pending: null });

  const disabled = requestAdvance(
    { runCount: 8, pending: null },
    { season: 1, episode: 4 },
    false,
    2,
  );
  assert.equal(disabled.held, false);
  assert.deepEqual(disabled.state, { runCount: 0, pending: null });
});
