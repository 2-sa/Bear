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
  return [];
}

export function installerUrl(_entry: VersionEntry): string | null {
  return null;
}
