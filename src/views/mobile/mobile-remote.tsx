import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { RemoteCommand, RemoteSnapshot } from "@/lib/remote/protocol";
import { useRemoteClient } from "@/lib/remote/use-remote-client";

type MobileRemoteValue = {
  connected: boolean;
  snapshot: RemoteSnapshot;
  sendCommand: (command: RemoteCommand) => boolean;
};

const Ctx = createContext<MobileRemoteValue | null>(null);

/**
 * Thin phone-side remote binding. Used by the manga reader remote and other
 * mobile remotes that only need the host snapshot + command channel.
 */
export function MobileRemoteProvider({ children }: { children: ReactNode }) {
  const { status, snapshot, sendCommand } = useRemoteClient();
  const connected = status === "connected";
  const value = useMemo<MobileRemoteValue>(
    () => ({ connected, snapshot, sendCommand }),
    [connected, snapshot, sendCommand],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMobileRemote(): MobileRemoteValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useMobileRemote must be used within MobileRemoteProvider");
  return v;
}
