import { useSyncExternalStore } from "react";

export type SecondarySubChoice = string | null | "auto";

let choice: SecondarySubChoice = "auto";
const listeners = new Set<() => void>();

function publish(next: SecondarySubChoice): void {
  if (choice === next) return;
  choice = next;
  listeners.forEach((listener) => listener());
}

export function setSecondarySub(id: string | null): void {
  publish(id);
}

export function resetSecondarySub(): void {
  publish("auto");
}

export function useSecondarySubChoice(): SecondarySubChoice {
  return useSyncExternalStore(
    (callback) => {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    () => choice,
    (): SecondarySubChoice => "auto",
  );
}
