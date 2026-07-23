import { workerRoutes } from "@/lib/network-config";
import { validateControlledDownloadUrl } from "@/lib/network-config";
import { isMacDesktop, isWindowsDesktop } from "@/lib/platform";
import { safeFetch } from "@/lib/safe-fetch";

export type VersionEntry = {
  version: string;
  date?: string;
  notes?: string;
  win?: string;
  mac?: string;
  channel?: "beta" | "stable";
};

export const currentVersion = __APP_VERSION__;

export async function fetchVersionHistory(): Promise<VersionEntry[]> {
  const url = workerRoutes.updateVersions();
  if (!url) throw new Error("Version history service is not configured.");
  const res = await safeFetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`history ${res.status}`);
  const data = (await res.json()) as { versions?: VersionEntry[] };
  const list = Array.isArray(data.versions) ? data.versions : [];
  return list.filter((v) => v && typeof v.version === "string");
}

export function installerUrl(entry: VersionEntry): string | null {
  if (isWindowsDesktop()) return validateControlledDownloadUrl(entry.win);
  if (isMacDesktop()) return validateControlledDownloadUrl(entry.mac);
  return null;
}
