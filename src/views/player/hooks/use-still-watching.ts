import { useCallback, useEffect, useSyncExternalStore } from "react";
import {
  clearStillWatchingState,
  getStillWatchingState,
  initialStillWatchingState,
  requestStillWatchingAdvance,
  resetStillWatchingRun,
  resolveStillWatchingPrompt,
  setStillWatchingState,
  subscribeStillWatchingState,
} from "@/lib/still-watching";
import type { PlayEpisode } from "@/lib/view";

export function useStillWatching(params: {
  storeKey: string;
  enabled: boolean;
  threshold: number;
  onContinue: (episode: PlayEpisode) => void;
  onStop: () => void;
}) {
  const { storeKey, enabled, threshold, onContinue, onStop } = params;
  const subscribe = useCallback(
    (listener: () => void) => subscribeStillWatchingState(storeKey, listener),
    [storeKey],
  );
  const getSnapshot = useCallback(() => getStillWatchingState<PlayEpisode>(storeKey), [storeKey]);
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    if (!enabled) {
      clearStillWatchingState(storeKey);
      return;
    }
    const resetRun = () => {
      setStillWatchingState(
        storeKey,
        resetStillWatchingRun(getStillWatchingState<PlayEpisode>(storeKey)),
      );
    };
    window.addEventListener("pointerdown", resetRun, true);
    window.addEventListener("keydown", resetRun, true);
    return () => {
      window.removeEventListener("pointerdown", resetRun, true);
      window.removeEventListener("keydown", resetRun, true);
    };
  }, [enabled, storeKey]);

  const gateAdvance = useCallback(
    (episode: PlayEpisode): boolean => {
      const result = requestStillWatchingAdvance(
        getStillWatchingState<PlayEpisode>(storeKey),
        episode,
        enabled,
        threshold,
      );
      setStillWatchingState(storeKey, result.state);
      return result.held;
    },
    [enabled, storeKey, threshold],
  );

  const continueWatching = useCallback(() => {
    const resolved = resolveStillWatchingPrompt(getStillWatchingState<PlayEpisode>(storeKey));
    setStillWatchingState(storeKey, resolved.state);
    if (resolved.pending) onContinue(resolved.pending);
  }, [onContinue, storeKey]);

  const stopWatching = useCallback(() => {
    setStillWatchingState(storeKey, initialStillWatchingState<PlayEpisode>());
    onStop();
  }, [onStop, storeKey]);

  return {
    prompt: enabled ? state.pending : null,
    gateAdvance,
    continueWatching,
    stopWatching,
  };
}
