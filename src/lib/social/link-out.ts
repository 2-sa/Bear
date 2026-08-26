import { useSyncExternalStore } from "react";
import { safeExternalUrl } from "./link-out-activation";

let current: string | null = null;
const subs = new Set<() => void>();

function emit(): void {
  for (const s of subs) s();
}

function subscribe(fn: () => void): () => void {
  subs.add(fn);
  return () => {
    subs.delete(fn);
  };
}

export function openLinkOut(url: string): void {
  const safeUrl = safeExternalUrl(url || "");
  if (!safeUrl) return;
  current = safeUrl;
  emit();
}

export function closeLinkOut(): void {
  current = null;
  emit();
}

export function useLinkOut(): string | null {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => current,
  );
}
