import { useCallback, useEffect, useRef, type RefObject } from "react";
import type { BookApi } from "../book-view";

const FLIP_MS = 320;

export function useBookTurnQueue(bookApi: RefObject<BookApi | null>) {
  const busyUntil = useRef(0);
  const pending = useRef<"next" | "prev" | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const fire = useCallback(
    (dir: "next" | "prev") => {
      const api = bookApi.current;
      if (!api) return;
      if (dir === "next") api.next();
      else api.prev();
      busyUntil.current = performance.now() + FLIP_MS;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        const p = pending.current;
        if (p) {
          pending.current = null;
          fire(p);
        }
      }, FLIP_MS + 10);
    },
    [bookApi],
  );

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return useCallback(
    (dir: "next" | "prev") => {
      if (performance.now() < busyUntil.current) {
        pending.current = dir;
        return;
      }
      fire(dir);
    },
    [fire],
  );
}
