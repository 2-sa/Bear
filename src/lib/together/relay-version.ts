export const REQUIRED_RELAY_VERSION = 10;
export const HARBOR_PUBLIC_RELAY = "wss://harbor-together-relay.xyz7.workers.dev";
const LEGACY_PUBLIC_RELAY = "pub.harbor.site";

export function relayOutdated(version: number | null | undefined): boolean {
  return version == null || version < REQUIRED_RELAY_VERSION;
}

export function isPublicRelay(url: string): boolean {
  const host = url
    .trim()
    .toLowerCase()
    .replace(/^(wss?|https?):\/\//, "")
    .replace(/\/.*$/, "");
  return host === "harbor-together-relay.xyz7.workers.dev";
}

export function migrateRelayDefault(url: string | null | undefined): string {
  const value = url?.trim() ?? "";
  if (!value) return HARBOR_PUBLIC_RELAY;

  const host = value
    .toLowerCase()
    .replace(/^(wss?|https?):\/\//, "")
    .replace(/\/.*$/, "");
  return host === LEGACY_PUBLIC_RELAY ? HARBOR_PUBLIC_RELAY : value;
}
