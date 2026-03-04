#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

if command -v memory-brain >/dev/null 2>&1; then
  exec memory-brain "$@"
fi

if [[ ! -f dist/src/cli.js ]]; then
  npm run build >/dev/null
fi

exec node dist/src/cli.js "$@"
