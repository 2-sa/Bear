#!/usr/bin/env bash
set -euo pipefail

pnpm tauri "$@"
node scripts/macos-runtime-libs.mjs verify
