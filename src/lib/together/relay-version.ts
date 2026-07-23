import { NETWORK_CONFIG, validateRelayUrl } from "@/lib/network-config";

export const REQUIRED_RELAY_VERSION = 10;
export const HARBOR_PUBLIC_RELAY = NETWORK_CONFIG.publicRelayUrl ?? "";

export function relayOutdated(version: number | null | undefined): boolean {
  return version == null || version < REQUIRED_RELAY_VERSION;
}

export function isPublicRelay(url: string): boolean {
  const relay = validateRelayUrl(url);
  return !!relay && relay === NETWORK_CONFIG.publicRelayUrl;
}
