#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
USER_DATA_DIR="${CODE_OSS_DEV_AUTHED_USER_DATA_DIR:-$HOME/.vscode-oss-dev}"

while [[ $# -gt 0 ]]; do
	case "$1" in
		--repo) REPO="$2"; shift 2 ;;
		--user-data-dir) USER_DATA_DIR="$2"; shift 2 ;;
		*) echo "Unknown arg: $1" >&2; exit 2 ;;
	esac
done

if [[ ! -x "$REPO/scripts/code.sh" ]]; then
	echo "Could not find an executable Code OSS launcher at $REPO/scripts/code.sh." >&2
	exit 2
fi

mkdir -p "$USER_DATA_DIR"
unset ELECTRON_RUN_AS_NODE
LOG_FILE=$(mktemp "${TMPDIR:-/tmp}/code-oss-profile-bootstrap.XXXXXX.log")
nohup "$REPO/scripts/code.sh" "--user-data-dir=$USER_DATA_DIR" >"$LOG_FILE" 2>&1 &
PID=$!
sleep 2
if ! kill -0 "$PID" 2>/dev/null; then
	echo "Code OSS exited before opening the bootstrap window. Log tail:" >&2
	tail -n 40 "$LOG_FILE" >&2
	exit 1
fi

node -e 'console.log(JSON.stringify({ userDataDir: process.argv[1], logFile: process.argv[2] }))' "$USER_DATA_DIR" "$LOG_FILE"
