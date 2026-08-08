import { useSyncExternalStore } from "react";

let urls = new Set<string>();
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function markAddedSub(url: string): void {
  if (!url || urls.has(url)) return;
  urls = new Set(urls);
  urls.add(url);
  emit();
}

export function useAddedSubs(): Set<string> {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => urls,
    () => urls,
  );
}
