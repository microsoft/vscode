#!/usr/bin/env bash
# Stop the OBI + Aspire containers started by start-obi.sh / start-aspire.sh.
# Safe to run when nothing is running.

set -euo pipefail

for NAME in "${OBI_CONTAINER_NAME:-vscode-obi}" "${ASPIRE_CONTAINER_NAME:-vscode-aspire}"; do
	if docker ps --format '{{.Names}}' | grep -qx "$NAME"; then
		echo "[stop.sh] stopping $NAME..."
		docker stop "$NAME" >/dev/null
	else
		echo "[stop.sh] $NAME not running"
	fi
	# --rm should clean these up on stop, but make sure.
	docker rm -f "$NAME" >/dev/null 2>&1 || true
done
echo "[stop.sh] done"
