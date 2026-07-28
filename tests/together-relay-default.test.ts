import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  HARBOR_PUBLIC_RELAY,
  isPublicRelay,
  migrateRelayDefault,
} from "../src/lib/together/relay-version.ts";

const EXPECTED_RELAY = "wss://harbor-together-relay.xyz7.workers.dev";

test("Bear's hosted relay is the application default", () => {
  assert.equal(HARBOR_PUBLIC_RELAY, EXPECTED_RELAY);
  assert.equal(isPublicRelay(EXPECTED_RELAY), true);
  assert.equal(isPublicRelay("wss://pub.harbor.site"), false);
  assert.equal(migrateRelayDefault(""), EXPECTED_RELAY);
  assert.equal(migrateRelayDefault("wss://pub.harbor.site"), EXPECTED_RELAY);
  assert.equal(migrateRelayDefault("wss://my-relay.example"), "wss://my-relay.example");

  const defaults = readFileSync(new URL("../src/lib/settings/defaults.ts", import.meta.url), "utf8");
  assert.match(defaults, /togetherRelayUrl:\s*"wss:\/\/harbor-together-relay\.xyz7\.workers\.dev"/);
});
