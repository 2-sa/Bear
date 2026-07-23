// @ts-nocheck -- Node and Worker test types are intentionally outside the app tsconfig.
import assert from "node:assert/strict";
import test from "node:test";
import worker, { Room } from "../src-tauri/relay/worker.js";

const ctx = {
  waitUntil() {},
};

test("relay no longer exposes a generic forwarding endpoint", async () => {
  const response = await worker.fetch(
    new Request("https://relay.example.test/proxy?u=https://example.com"),
    { ENVIRONMENT: "production", ALLOWED_ORIGINS: "" },
    ctx,
  );
  assert.equal(response.status, 404);
});

test("relay rejects browser origins outside its allowlist", async () => {
  const response = await worker.fetch(
    new Request("https://relay.example.test/health", {
      headers: { Origin: "https://evil.example" },
    }),
    { ENVIRONMENT: "production", ALLOWED_ORIGINS: "https://app.example.test" },
    ctx,
  );
  assert.equal(response.status, 403);
});

test("relay health response does not disclose proxy hosts", async () => {
  const response = await worker.fetch(
    new Request("https://relay.example.test/health"),
    { ENVIRONMENT: "production", ALLOWED_ORIGINS: "" },
    ctx,
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal("hosts" in body, false);
});

function roomHarness() {
  let deleted = false;
  const state = {
    getWebSockets: () => [],
    acceptWebSocket() {},
    blockConcurrencyWhile(run) {
      void run();
    },
    storage: {
      async get() {
        return new Map();
      },
      put() {},
      delete() {},
      deleteAlarm() {},
      setAlarm() {},
      async deleteAll() {
        deleted = true;
      },
    },
  };
  return { room: new Room(state), wasDeleted: () => deleted };
}

test("relay rejects host takeover by a non-host participant", () => {
  const { room } = roomHarness();
  const hostSocket = { send() {} };
  const guestMessages = [];
  const guestSocket = { send: (value) => guestMessages.push(JSON.parse(value)) };
  room.peers.set(hostSocket, { clientId: "host", joinedAt: 1 });
  room.peers.set(guestSocket, { clientId: "guest", joinedAt: 2 });
  room.hostClientId = "host";
  room.handleClaimHost(guestSocket, { fresh: true });
  assert.equal(room.hostClientId, "host");
  assert.equal(guestMessages[0].code, "host_claim_rejected");
});

test("relay alarm deletes persisted state for an empty room", async () => {
  const { room, wasDeleted } = roomHarness();
  room.syncState = { mediaId: "private-title" };
  room.hostClientId = "old-host";
  room.started = true;
  await room.alarm();
  assert.equal(wasDeleted(), true);
  assert.equal(room.syncState, null);
  assert.equal(room.hostClientId, null);
  assert.equal(room.started, false);
});
