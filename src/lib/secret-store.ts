import { invoke } from "@tauri-apps/api/core";

const SECRET_PREFIXES = [
  "harbor.simkl.session.v1",
  "harbor.trakt.session.v1",
  "harbor.mal.session.v1",
  "harbor.anilist.session.v1",
];

let store: Record<string, string> = {};
let rustAvailable = false;
let loaded = false;
let persistTimer: number | null = null;

export function isSecretKey(key: string): boolean {
  return SECRET_PREFIXES.some((p) => key === p || key.startsWith(`${p}.`));
}

/** Rewrites a session key so it targets a specific profile, used when restoring a backup. */
export function secretKeyForProfile(key: string, profileId: string): string {
  for (const prefix of SECRET_PREFIXES) {
    if (key === prefix || key.startsWith(`${prefix}.`)) return `${prefix}.${profileId}`;
  }
  return key;
}

/** Snapshot of the Rust-persisted secret store, for backup/export use. */
export function getAllSecrets(): Record<string, string> {
  return { ...store };
}

async function persist(): Promise<boolean> {
  if (!rustAvailable) return false;
  try {
    await invoke("secrets_write", { content: JSON.stringify(store) });
    return true;
  } catch {
    return false;
  }
}

function schedulePersist(): void {
  if (persistTimer != null) return;
  persistTimer = window.setTimeout(() => {
    persistTimer = null;
    void persist();
  }, 200);
}

/** Flushes any pending secret writes immediately, for callers about to leave the page. */
export async function flushSecrets(): Promise<void> {
  if (persistTimer != null) {
    window.clearTimeout(persistTimer);
    persistTimer = null;
  }
  await persist();
}

export async function loadSecrets(): Promise<void> {
  if (loaded) return;
  loaded = true;
  try {
    const raw = await invoke<string | null>("secrets_read");
    rustAvailable = true;
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object") store = parsed as Record<string, string>;
    }
  } catch {
    rustAvailable = false;
  }

  let migrated = false;
  const legacyKeys: string[] = [];
  try {
    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const key = localStorage.key(i);
      if (!key || !isSecretKey(key)) continue;
      const val = localStorage.getItem(key);
      if (val == null) continue;
      legacyKeys.push(key);
      if (store[key] == null) {
        store[key] = val;
        migrated = true;
      }
    }
  } catch {
    void 0;
  }

  if (legacyKeys.length > 0) {
    const persisted = !migrated || (await persist());
    if (!rustAvailable || persisted) {
      try {
        for (const key of legacyKeys) localStorage.removeItem(key);
      } catch {
        void 0;
      }
    }
  }
}

function removeLegacyLocalSecret(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    void 0;
  }
}

export function getSecret(key: string): string | null {
  return store[key] ?? null;
}

export function setSecret(key: string, value: string | null): void {
  if (value == null) delete store[key];
  else store[key] = value;
  if (rustAvailable) schedulePersist();
  removeLegacyLocalSecret(key);
}
