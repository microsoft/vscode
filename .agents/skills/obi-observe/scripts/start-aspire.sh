#!/usr/bin/env bash
# Start the Aspire Dashboard as a local OTLP viewer.
#
# UI:        http://localhost:18888
# OTLP gRPC: localhost:4317   (used by OBI)
# OTLP HTTP: localhost:4318   (used by the Copilot extension OTel exporter)
#
# Idempotent: if a container named "vscode-aspire" is already running, this
# script is a no-op and exits 0.

set -euo pipefail

NAME="${ASPIRE_CONTAINER_NAME:-vscode-aspire}"
IMAGE="${ASPIRE_IMAGE:-mcr.microsoft.com/dotnet/aspire-dashboard:latest}"

if docker ps --format '{{.Names}}' | grep -qx "$NAME"; then
	echo "[start-aspire.sh] '$NAME' already running"
	echo "[start-aspire.sh] UI:        http://localhost:18888"
	echo "[start-aspire.sh] OTLP gRPC: localhost:4317"
	echo "[start-aspire.sh] OTLP HTTP: localhost:4318"
	exit 0
fi

# Remove any stopped container with the same name so --name doesn't collide.
docker rm -f "$NAME" >/dev/null 2>&1 || true

echo "[start-aspire.sh] pulling/starting $IMAGE as '$NAME'..."
docker run -d --rm \
	--name "$NAME" \
	-p 18888:18888 \
	-p 4317:18889 \
	-p 4318:18890 \
	-e DOTNET_DASHBOARD_UNSECURED_ALLOW_ANONYMOUS=true \
	"$IMAGE" >/dev/null

# Give it ~10s to start listening, then sanity-check the UI port.
for i in $(seq 1 20); do
	if curl -sf -o /dev/null --max-time 1 http://localhost:18888 2>/dev/null; then
		echo "[start-aspire.sh] ready after ${i}s"
		echo "[start-aspire.sh] UI:        http://localhost:18888"
		echo "[start-aspire.sh] OTLP gRPC: localhost:4317"
		echo "[start-aspire.sh] OTLP HTTP: localhost:4318"
		exit 0
	fi
	sleep 1
done

echo "[start-aspire.sh] timed out waiting for UI on :18888. Container logs:" >&2
docker logs --tail 50 "$NAME" >&2 || true
exit 1
