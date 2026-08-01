#!/usr/bin/env bash
set -euo pipefail

clear_incomplete_group() {
  local variable
  for variable in "$@"; do
    if [[ -z "${!variable:-}" ]]; then
      for variable in "$@"; do
        unset "$variable"
      done
      return
    fi
  done
}

# GitHub Actions creates empty environment variables for missing secrets. Tauri
# treats their presence as a request to sign/notarize, so only retain complete
# credential groups.
clear_incomplete_group APPLE_CERTIFICATE APPLE_CERTIFICATE_PASSWORD APPLE_SIGNING_IDENTITY
clear_incomplete_group APPLE_ID APPLE_PASSWORD APPLE_TEAM_ID

pnpm tauri "$@"
node scripts/macos-runtime-libs.mjs verify "$@"
