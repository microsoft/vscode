#!/usr/bin/env bash
set -euo pipefail

source ./setup_llm.sh

echo "[start_claude] Launching Claude CLI..."
echo ""

# Run Claude directly
claude --dangerously-skip-permissions "$@"
