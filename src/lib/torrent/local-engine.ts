import { invoke } from "@tauri-apps/api/core";
import { stopFullDownload } from "./full-download";

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export type EngineStatus = {
  ready: boolean;
  port: number | null;
  active_torrents: number;
  last_error: string | null;
  dht_tier?: number;
  dht_nodes?: number;
};

export type EngineFile = {
  idx: number;
  name: string;
  length: number;
};

export type AddResult = {
  info_hash: string;
  files: EngineFile[];
  stream_base: string;
  already_managed?: boolean;
};

export type LocalEngineStreamRef = {
  infoHash: string;
  fileIdx: number;
};

export type TorrentEngineStats = {
  peers: number;
  unchoked: number;
  downloaded: number;
  downloadSpeed: number;
  streamProgress: number;
  streamLen: number;
  peerSearchRunning: boolean;
  finished: boolean;
  state: string;
};

export type TorrentListItem = {
  infoHash: string;
  name: string;
  downloaded: number;
  total: number;
  downloadSpeed: number;
  finished: boolean;
  paused: boolean;
  state: string;
};

export type SelfTestStep = {
  label: string;
  ok: boolean;
  warn?: boolean;
  detail: string;
};

export type SelfTestResult = {
  pass: boolean;
  steps: SelfTestStep[];
};

export async function torrentEngineStatus(): Promise<EngineStatus | null> {
  if (!isTauri) return null;
  try {
    return await invoke<EngineStatus>("torrent_engine_status");
  } catch {
    return null;
  }
}

let lastAddError: string | null = null;

export function lastEngineAddError(): string | null {
  return lastAddError;
}

export async function torrentEngineAdd(
  magnet: string,
  trackers: string[],
  fileIdx?: number,
): Promise<AddResult | null> {
  if (!isTauri) return null;
  try {
    lastAddError = null;
    return await invoke<AddResult>("torrent_engine_add", {
      magnet,
      trackers,
      fileIdx: typeof fileIdx === "number" && fileIdx >= 0 ? fileIdx : null,
    });
  } catch (e) {
    lastAddError = String(e);
    console.warn("[engine] add failed", e);
    return null;
  }
}

export async function torrentEngineSelect(infoHash: string, fileIdx: number): Promise<void> {
  if (!isTauri) return;
  await invoke("torrent_engine_select", { infoHash, fileIdx }).catch((e) =>
    console.warn("[engine] select failed", e),
  );
}

export async function torrentEngineStats(
  infoHash: string,
  fileIdx: number | null,
): Promise<TorrentEngineStats | null> {
  if (!isTauri) return null;
  try {
    return await invoke<TorrentEngineStats>("torrent_engine_stats", { infoHash, fileIdx });
  } catch {
    return null;
  }
}

export async function torrentEngineList(): Promise<TorrentListItem[]> {
  if (!isTauri) return [];
  try {
    return await invoke<TorrentListItem[]>("torrent_engine_list");
  } catch {
    return [];
  }
}

export async function torrentEnginePause(infoHash: string): Promise<void> {
  if (!isTauri) return;
  await invoke("torrent_engine_pause", { infoHash }).catch((e) =>
    console.warn("[engine] pause failed", e),
  );
}

export async function torrentEngineResume(infoHash: string): Promise<void> {
  if (!isTauri) return;
  await invoke("torrent_engine_resume", { infoHash }).catch((e) =>
    console.warn("[engine] resume failed", e),
  );
}

export async function torrentEngineRemove(infoHash: string, deleteFiles: boolean): Promise<void> {
  const key = normalizeInfoHash(infoHash);
  cancelTorrentRemoval(key);
  torrentUsage.delete(key);
  stopFullDownload(key);
  if (!isTauri) return;
  await invoke("torrent_engine_remove", { infoHash: key, deleteFiles }).catch((e) =>
    console.warn("[engine] remove failed", e),
  );
}

const pendingRemovals = new Map<string, number>();
const torrentUsage = new Map<
  string,
  { owners: Set<string>; pausedOwners: Set<string>; deleteFilesRequested: boolean }
>();

function normalizeInfoHash(infoHash: string): string {
  return infoHash.trim().toLowerCase();
}

export function localEngineStreamRef(url: string | null | undefined): LocalEngineStreamRef | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    if (parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost") return null;
    const match = parsed.pathname.match(/^\/stream\/([a-f0-9]{40})\/(\d+)(?:\/|$)/i);
    if (!match) return null;
    const fileIdx = Number.parseInt(match[2], 10);
    if (!Number.isSafeInteger(fileIdx) || fileIdx < 0) return null;
    return { infoHash: normalizeInfoHash(match[1]), fileIdx };
  } catch {
    return null;
  }
}

export function retainTorrentUsage(infoHash: string, ownerId: string): void {
  const key = normalizeInfoHash(infoHash);
  cancelTorrentRemoval(key);
  const usage = torrentUsage.get(key) ?? {
    owners: new Set<string>(),
    pausedOwners: new Set<string>(),
    deleteFilesRequested: false,
  };
  usage.owners.add(ownerId);
  usage.pausedOwners.delete(ownerId);
  torrentUsage.set(key, usage);
}

export function releaseTorrentUsage(
  infoHash: string,
  ownerId: string,
  options: { deleteFiles?: boolean; removeWhenUnused?: boolean; delayMs?: number } = {},
): void {
  const key = normalizeInfoHash(infoHash);
  const usage = torrentUsage.get(key);
  if (!usage) {
    if (options.removeWhenUnused !== false) {
      scheduleTorrentRemoval(key, options.deleteFiles === true, options.delayMs);
    }
    return;
  }
  usage.owners.delete(ownerId);
  usage.pausedOwners.delete(ownerId);
  usage.deleteFilesRequested ||= options.deleteFiles === true;
  if (usage.owners.size > 0) {
    if (usage.pausedOwners.size === usage.owners.size) void torrentEnginePause(key);
    return;
  }
  if (options.removeWhenUnused === false && !usage.deleteFilesRequested) {
    torrentUsage.delete(key);
    return;
  }
  scheduleTorrentRemoval(key, usage.deleteFilesRequested, options.delayMs);
}

export function pauseTorrentUsage(infoHash: string, ownerId: string): void {
  const usage = torrentUsage.get(normalizeInfoHash(infoHash));
  if (!usage || !usage.owners.has(ownerId)) return;
  usage.pausedOwners.add(ownerId);
  if (usage.pausedOwners.size === usage.owners.size) void torrentEnginePause(infoHash);
}

export function scheduleTorrentRemoval(
  infoHash: string,
  deleteFiles = false,
  delayMs = 1200,
): void {
  if (!isTauri) return;
  const key = normalizeInfoHash(infoHash);
  const usage = torrentUsage.get(key);
  if (usage && usage.owners.size > 0) {
    usage.deleteFilesRequested ||= deleteFiles;
    return;
  }
  if (usage) usage.deleteFilesRequested ||= deleteFiles;
  const shouldDeleteFiles = usage?.deleteFilesRequested ?? deleteFiles;
  cancelTorrentRemoval(key);
  const id = window.setTimeout(() => {
    pendingRemovals.delete(key);
    void torrentEngineRemove(key, shouldDeleteFiles);
  }, delayMs);
  pendingRemovals.set(key, id);
}

export function cancelTorrentRemoval(infoHash: string): void {
  const key = normalizeInfoHash(infoHash);
  const id = pendingRemovals.get(key);
  if (id != null) {
    window.clearTimeout(id);
    pendingRemovals.delete(key);
  }
}

export async function torrentEngineSelfTest(): Promise<SelfTestResult | null> {
  if (!isTauri) return null;
  try {
    return await invoke<SelfTestResult>("torrent_engine_selftest");
  } catch (e) {
    console.warn("[engine] selftest failed", e);
    return null;
  }
}

export async function torrentEngineRestart(): Promise<EngineStatus | null> {
  if (!isTauri) return null;
  try {
    return await invoke<EngineStatus>("torrent_engine_restart");
  } catch (e) {
    console.warn("[engine] restart failed", e);
    return null;
  }
}

export async function torrentEngineHardReset(): Promise<EngineStatus | null> {
  if (!isTauri) return null;
  try {
    return await invoke<EngineStatus>("torrent_engine_hard_reset");
  } catch (e) {
    console.warn("[engine] hard reset failed", e);
    return null;
  }
}

export async function torrentEngineSetOptions(
  dir: string | null,
  retentionHours: number,
  maxGb: number,
  restart: boolean,
): Promise<void> {
  if (!isTauri) return;
  await invoke("torrent_engine_set_options", { dir, retentionHours, maxGb, restart }).catch((e) =>
    console.warn("[engine] set options failed", e),
  );
}
