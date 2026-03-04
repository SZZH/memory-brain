#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

npm install
npm run build

cat <<'EOF'
Memory Brain Skill installed.

Default memory home:
  ~/.memory-brain

This location stores:
- config files
- SQLite memory database
- summaries and archives
- search indexes
- logs
EOF
