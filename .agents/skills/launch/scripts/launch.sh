#!/usr/bin/env bash
# Launches Code OSS (VS Code from sources) with an isolated copy of a user-data-dir and unique
# debugger ports, and prints one JSON line once it is ready. The implementation is launch.ts; this
# wrapper checks Node.js and passes the arguments through. See ../SKILL.md for the options.

set -euo pipefail
# Profile copies contain authentication state; keep them private
umask 077

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if ! command -v node >/dev/null 2>&1; then
	echo "Node.js is required on PATH; use the version from the repo's .nvmrc." >&2
	exit 1
fi
if [[ "$(node -p 'Boolean(process.features.typescript)')" != "true" ]]; then
	echo "Node.js $(node --version) cannot run TypeScript; use the version from the repo's .nvmrc." >&2
	exit 1
fi

# Copying is dominated by per-file overhead; more I/O threads keep the disk busy
UV_THREADPOOL_SIZE=32 exec node --disable-warning=ExperimentalWarning "$SCRIPT_DIR/launch.ts" "$@"