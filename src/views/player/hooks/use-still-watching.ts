import { useCallback, useEffect, useState } from "react";
import {
  initialStillWatchingState,
  requestStillWatchingAdvance,
  resetStillWatchingRun,
  resolveStillWatchingPrompt,
} from "@/lib/still-watching";
import type { PlayEpisode } from "@/lib/view";

export function useStillWatching(params: {
  enabled: boolean;
  threshold: number;
  onContinue: (episode: PlayEpisode) => void;
  onStop: () => void;
}) {
  const { enabled, threshold, onContinue, onStop } = params;
  const [state, setState] = useState(() => initialStillWatchingState<PlayEpisode>());

  useEffect(() => {
    if (!enabled) return;
    const resetRun = () => {
      setState((current) => resetStillWatchingRun(current));
    };
    window.addEventListener("pointerdown", resetRun, true);
    window.addEventListener("keydown", resetRun, true);
    return () => {
      window.removeEventListener("pointerdown", resetRun, true);
      window.removeEventListener("keydown", resetRun, true);
    };
  }, [enabled]);

  const gateAdvance = useCallback(
    (episode: PlayEpisode): boolean => {
      const result = requestStillWatchingAdvance(state, episode, enabled, threshold);
      setState(result.state);
      return result.held;
    },
    [enabled, state, threshold],
  );

  const continueWatching = useCallback(() => {
    const resolved = resolveStillWatchingPrompt(state);
    setState(resolved.state);
    if (resolved.pending) onContinue(resolved.pending);
  }, [onContinue, state]);

  const stopWatching = useCallback(() => {
    setState(initialStillWatchingState<PlayEpisode>());
    onStop();
  }, [onStop]);

  return {
    prompt: enabled ? state.pending : null,
    gateAdvance,
    continueWatching,
    stopWatching,
  };
}
