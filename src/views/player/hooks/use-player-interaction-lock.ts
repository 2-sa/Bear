import { useCallback, useEffect, useMemo, useState } from "react";
import { effectiveBinding, eventToBinding } from "@/lib/hotkeys";
import { setPlayerInteractionLocked } from "@/lib/player/interaction-lock";
import { useSettings } from "@/lib/settings";

const UNLOCK_CONTROL = "[data-player-unlock-control]";

function isUnlockControlTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(UNLOCK_CONTROL) != null;
}

function stopInteraction(event: Event): void {
  if (event.cancelable) event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
}

export function usePlayerInteractionBlocker({
  locked,
  binding,
  onToggle,
}: {
  locked: boolean;
  binding: string;
  onToggle: () => void;
}): void {
  useEffect(() => {
    const onKeyboard = (event: KeyboardEvent) => {
      const isToggle = event.type === "keydown" && eventToBinding(event) === binding;
      if (isToggle) {
        stopInteraction(event);
        if (!event.repeat) onToggle();
        return;
      }
      if (!locked) return;
      stopInteraction(event);
    };
    const onPointer = (event: Event) => {
      if (!locked || isUnlockControlTarget(event.target)) return;
      stopInteraction(event);
    };
    const keyboardOptions: AddEventListenerOptions = { capture: true };
    const pointerOptions: AddEventListenerOptions = { capture: true };
    const activePointerOptions: AddEventListenerOptions = { capture: true, passive: false };
    window.addEventListener("keydown", onKeyboard, keyboardOptions);
    window.addEventListener("keyup", onKeyboard, keyboardOptions);
    window.addEventListener("pointerdown", onPointer, pointerOptions);
    window.addEventListener("pointerup", onPointer, pointerOptions);
    window.addEventListener("pointermove", onPointer, pointerOptions);
    window.addEventListener("click", onPointer, pointerOptions);
    window.addEventListener("dblclick", onPointer, pointerOptions);
    window.addEventListener("contextmenu", onPointer, pointerOptions);
    window.addEventListener("wheel", onPointer, activePointerOptions);
    window.addEventListener("touchstart", onPointer, activePointerOptions);
    window.addEventListener("touchmove", onPointer, activePointerOptions);
    window.addEventListener("touchend", onPointer, activePointerOptions);
    return () => {
      window.removeEventListener("keydown", onKeyboard, keyboardOptions);
      window.removeEventListener("keyup", onKeyboard, keyboardOptions);
      window.removeEventListener("pointerdown", onPointer, pointerOptions);
      window.removeEventListener("pointerup", onPointer, pointerOptions);
      window.removeEventListener("pointermove", onPointer, pointerOptions);
      window.removeEventListener("click", onPointer, pointerOptions);
      window.removeEventListener("dblclick", onPointer, pointerOptions);
      window.removeEventListener("contextmenu", onPointer, pointerOptions);
      window.removeEventListener("wheel", onPointer, activePointerOptions);
      window.removeEventListener("touchstart", onPointer, activePointerOptions);
      window.removeEventListener("touchmove", onPointer, activePointerOptions);
      window.removeEventListener("touchend", onPointer, activePointerOptions);
    };
  }, [binding, locked, onToggle]);
}

export function usePlayerInteractionLock() {
  const { settings } = useSettings();
  const [locked, setLocked] = useState(false);
  const binding = useMemo(
    () => effectiveBinding("playerScreenLock", settings.hotkeys ?? {}),
    [settings.hotkeys],
  );
  const lock = useCallback(() => setLocked(true), []);
  const unlock = useCallback(() => setLocked(false), []);
  const toggle = useCallback(() => setLocked((value) => !value), []);

  usePlayerInteractionBlocker({ locked, binding, onToggle: toggle });

  useEffect(() => {
    setPlayerInteractionLocked(locked);
  }, [locked]);
  useEffect(() => () => setPlayerInteractionLocked(false), []);

  return { locked, binding, lock, unlock };
}
