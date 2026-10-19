#!/usr/bin/env bash
set -euo pipefail
cd /workspace/ZCFA-ZeroCodeFullAutomation
export XDG_DATA_HOME=/workspace/.cache/share
export XDG_CACHE_HOME=/workspace/.cache
export PNPM_HOME=/workspace/.cache/pnpm
export NEXT_TELEMETRY_DISABLED=1
node -e 'if (process.versions.node.split(".")[0] !== "24") throw new Error("Node 24.x required")'
test "$(pnpm --version)" = "11.25.0"
test -x "${ZC_CHROMIUM_PATH:-/usr/bin/chromium}"
pnpm install --frozen-lockfile --store-dir /workspace/.cache/pnpm-store
pnpm typecheck
pnpm test
pnpm build
