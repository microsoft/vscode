#!/usr/bin/env bash
# Stops the Code OSS instance of a launch and removes its run directory. Reused run directories
# are kept unless --remove is passed.
#
# Usage: cleanup.sh <run-dir> [--playwright-session <name>] [--remove]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
exec node --disable-warning=ExperimentalWarning "$SCRIPT_DIR/cleanup.ts" "$@"