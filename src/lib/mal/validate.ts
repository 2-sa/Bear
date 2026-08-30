import { getSession, setSession } from "./session";
import { ensureRefreshed } from "./auth";
import { safeFetch } from "@/lib/safe-fetch";

let inflight: Promise<void> | null = null;

export function validateMalSession(): Promise<void> {
  if (inflight) return inflight;
  inflight = run().finally(() => {
    inflight = null;
  });
  return inflight;
}

async function run(): Promise<void> {
  const session = getSession();
  if (!session) return;
  try {
    const res = await safeFetch("https://api.myanimelist.net/v2/users/@me", {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    });
    if (res.status === 401) {
      const refreshed = await ensureRefreshed();
      if (!refreshed) setSession(null);
    }
  } catch {
    if (!navigator.onLine) return;
    setSession(null);
  }
}
