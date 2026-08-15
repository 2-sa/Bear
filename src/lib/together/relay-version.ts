export const REQUIRED_RELAY_VERSION = 10;
export const HARBOR_PUBLIC_RELAY = "wss://relay.7mood.net";
const LEGACY_PUBLIC_RELAYS = new Set([
  "pub.harbor.site",
  "harbor-together-relay.xyz7.workers.dev",
]);

export function relayOutdated(version: number | null | undefined): boolean {
  return version == null || version < REQUIRED_RELAY_VERSION;
}

export function isPublicRelay(url: string): boolean {
  const host = url
    .trim()
    .toLowerCase()
    .replace(/^(wss?|https?):\/\//, "")
    .replace(/\/.*$/, "");
  return host === "relay.7mood.net";
}

export function migrateRelayDefault(url: string | null | undefined): string {
  const value = url?.trim() ?? "";
  if (!value) return HARBOR_PUBLIC_RELAY;

  const host = value
    .toLowerCase()
    .replace(/^(wss?|https?):\/\//, "")
    .replace(/\/.*$/, "");
  return LEGACY_PUBLIC_RELAYS.has(host) ? HARBOR_PUBLIC_RELAY : value;
}
