import { NETWORK_CONFIG, validateRelayUrl } from "@/lib/network-config";
import { normalizeRoomCode } from "./protocol";

const RELAY_PARAM = "harbor-relay";
const ROOM_PARAM = "harbor-room";

export type ParsedInvite = {
  relayUrl: string;
  roomCode: string;
};

export function buildInviteUrl(relayUrl: string, roomCode: string): string {
  const relay = validateRelayUrl(relayUrl);
  if (!relay) return "";
  const appOrigin = NETWORK_CONFIG.publicAppOrigin;
  if (!appOrigin) return "";
  const params = new URLSearchParams();
  params.set(RELAY_PARAM, relay);
  params.set(ROOM_PARAM, roomCode.toUpperCase());
  return `${appOrigin}/?${params.toString()}`;
}

export function parseInviteFromLocation(): ParsedInvite | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const relay = validateRelayUrl(params.get(RELAY_PARAM)?.trim() ?? "");
  const roomRaw = params.get(ROOM_PARAM)?.trim();
  if (!relay || !roomRaw) return null;
  const room = normalizeRoomCode(roomRaw);
  if (!room) return null;
  return { relayUrl: relay, roomCode: room };
}

export function clearInviteParams(): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.delete(RELAY_PARAM);
  url.searchParams.delete(ROOM_PARAM);
  window.history.replaceState(null, "", url.toString());
}
