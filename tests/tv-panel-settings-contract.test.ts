// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { readFileSync } from "node:fs";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";

import { readTvContract, type KotlinItem } from "./_tv-panel-kotlin.ts";
import { TV_GROUPS, type TvRow } from "../src/views/settings/tv-panel/model.ts";

const LABEL_WAIVERS: Record<string, [string, string]> = {
  service: ["Turn off what you do not have", "Services you have"],
  "uiLanguage/ar": ["\u0627\u0644\u0639\u0631\u0628\u064a\u0629", "Arabic"],
  "uiLanguage/pt": ["Portugu\u00eas", "Portuguese"],
  "uiLanguage/ru": ["\u0420\u0443\u0441\u0441\u043a\u0438\u0439", "Russian"],
};

const OFF_WIRE_TV_SETTINGS = ["playerConfirmLeave", "playerStats", "subSize"];

const KIND_OF_LETTER: Record<string, string> = { b: "toggle", s: "choice", m: "multi" };

const kt = readTvContract();
const declared = new Map<string, KotlinItem>(kt.items.map((i) => [i.key, i]));
const rows: TvRow[] = TV_GROUPS.flatMap((g) => g.rows);
const byKey = new Map<string, TvRow>(rows.map((r) => [r.key, r]));

function checkLabel(slot: string, tv: string, desk: string): void {
  if (tv === desk) {
    assert.equal(
      LABEL_WAIVERS[slot],
      undefined,
      `${slot} carries a stale label waiver: both sides now read "${tv}", so drop the waiver`,
    );
    return;
  }
  const waived = LABEL_WAIVERS[slot];
  assert.ok(
    waived,
    `${slot} label drifted: the TV says "${tv}", model.ts says "${desk}". ` +
      "Match the TV, or pin the pair in LABEL_WAIVERS with the reason in the review.",
  );
  assert.deepEqual(
    waived,
    [tv, desk],
    `${slot} has a waiver, but the pinned pair no longer matches the source`,
  );
}

test("the settings wire and the desktop TV panel carry the same keys", () => {
  assert.equal(byKey.size, rows.length, "model.ts declares the same key twice");
  const wire = [...kt.settingsWire.keys()].sort();
  const desk = [...byKey.keys()].sort();
  assert.deepEqual(
    desk.filter((k) => !kt.settingsWire.has(k)),
    [],
    "model.ts pushes keys the TV settings wire drops on the floor",
  );
  assert.deepEqual(
    wire.filter((k) => !byKey.has(k)),
    [],
    "the TV settings wire carries keys the desktop panel never offers",
  );
});

test("every desktop row lands in the settings doc", () => {
  for (const group of TV_GROUPS) {
    assert.equal(
      group.wire,
      "settings",
      `group ${group.id} writes to ${group.wire}, but index.tsx feeds it bundle.settings`,
    );
  }
});

test("every desktop key is a setting the TV declares", () => {
  for (const row of rows) {
    const item = declared.get(row.key);
    assert.ok(item, `${row.key} is not in SETTING_GROUPS, so setConfig skips it in silence`);
    assert.ok(
      item.kind === "Toggle" || item.kind === "Choice",
      `${row.key} is a ${item.kind} row on the TV and cannot take a pushed value`,
    );
  }
});

test("kinds agree across the wire, the TV and the desktop", () => {
  for (const row of rows) {
    const letter = kt.settingsWire.get(row.key) as string;
    const item = declared.get(row.key) as KotlinItem;
    assert.equal(
      row.kind,
      KIND_OF_LETTER[letter],
      `${row.key} is ${letter} on the wire but ${row.kind} in model.ts`,
    );
    const tvKind = item.kind === "Toggle" ? "toggle" : item.multi ? "multi" : "choice";
    assert.equal(row.kind, tvKind, `${row.key} is ${tvKind} on the TV but ${row.kind} in model.ts`);
  }
});

test("option values match the TV, in order", () => {
  for (const row of rows) {
    if (row.kind === "toggle" || row.kind === "step") continue;
    const item = declared.get(row.key) as KotlinItem;
    const tv = (item.options ?? []).map((o) => o.value);
    assert.deepEqual(
      row.options.map((o) => o.value),
      tv,
      `${row.key} option values drifted. The TV refuses anything outside its own list, ` +
        "so a desktop-only value is accepted by the panel and then thrown away.",
    );
  }
});

test("option labels match the TV unless the pair is pinned", () => {
  for (const row of rows) {
    if (row.kind === "toggle" || row.kind === "step") continue;
    const item = declared.get(row.key) as KotlinItem;
    const tv = item.options ?? [];
    for (let i = 0; i < row.options.length; i += 1) {
      checkLabel(`${row.key}/${row.options[i].value}`, tv[i].label, row.options[i].label);
    }
  }
});

test("row labels match the TV unless the pair is pinned", () => {
  for (const row of rows) {
    checkLabel(row.key, (declared.get(row.key) as KotlinItem).title, row.label);
  }
});

test("a TV subtitle on a wired row reaches the desktop", () => {
  for (const row of rows) {
    const item = declared.get(row.key) as KotlinItem;
    if (item.subtitle === null) continue;
    assert.equal(
      row.sub,
      item.subtitle,
      `${row.key} says "${row.sub}" on the desktop and "${item.subtitle}" on the TV`,
    );
  }
});

test("defaults match the TV", () => {
  for (const row of rows) {
    const item = declared.get(row.key) as KotlinItem;
    if (row.kind === "toggle") {
      assert.equal(row.def, item.toggleOn, `${row.key} default drifted`);
      continue;
    }
    if (row.kind === "choice") {
      assert.equal(row.def, item.selected, `${row.key} default drifted`);
      continue;
    }
    if (row.kind !== "multi") continue;
    assert.deepEqual(
      row.def,
      (item.options ?? []).filter((o) => o.on).map((o) => o.value),
      `${row.key} default selection drifted`,
    );
  }
});

test("every desktop default is one of its own options", () => {
  for (const row of rows) {
    if (row.kind === "choice") {
      const values = row.options.map((o) => o.value);
      assert.ok(
        values.includes(row.def),
        `${row.key} defaults to ${row.def}, which is not one of ${values.join(", ")}`,
      );
    }
    if (row.kind !== "multi") continue;
    const values = new Set(row.options.map((o) => o.value));
    for (const held of row.def) {
      assert.ok(values.has(held), `${row.key} defaults to ${held}, which it never offers`);
    }
  }
});

test("TV settings the wire cannot carry stay off the desktop panel", () => {
  const stranded = kt.items
    .filter((i) => i.kind === "Toggle" || i.kind === "Choice")
    .map((i) => i.key)
    .filter((k) => !kt.settingsWire.has(k) && !kt.layoutWire.has(k))
    .sort();
  assert.deepEqual(
    stranded,
    OFF_WIRE_TV_SETTINGS,
    "the set of TV settings that no wire carries changed. Put the new one on a wire and in " +
      "model.ts, or record it here so the gap stays visible.",
  );
  for (const key of stranded) {
    assert.equal(byKey.get(key), undefined, `${key} is offered on the desktop but reaches nothing`);
  }
});

test("navigation rows never reach a wire", () => {
  for (const item of kt.items) {
    if (item.kind === "Toggle" || item.kind === "Choice") continue;
    assert.ok(
      !kt.settingsWire.has(item.key) && !kt.layoutWire.has(item.key),
      `${item.key} is a ${item.kind} row and must not be syncable`,
    );
  }
});

test("model.ts stays ASCII", () => {
  const raw = readFileSync(
    new URL("../src/views/settings/tv-panel/model.ts", import.meta.url),
  ) as Uint8Array;
  const bad = [...raw].findIndex((b) => b > 126);
  assert.equal(bad, -1, `model.ts has a non-ASCII byte at ${bad}`);
});
