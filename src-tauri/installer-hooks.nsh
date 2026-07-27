!macro NSIS_HOOK_PREINSTALL
  ; Intentionally empty. Never terminate processes by generic executable name:
  ; those names can belong to unrelated applications on the user's device.
!macroend
