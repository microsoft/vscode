#!/usr/bin/env bash
# Start OBI (OpenTelemetry eBPF Instrumentation) scoped to VS Code processes.
# Spans are exported via OTLP gRPC to a local Aspire dashboard on :4317 by
# default. Also tail OBI's stdout for a per-request text log.
#
# Idempotent: if a container named "vscode-obi" is already running, this
# script is a no-op and exits 0.
#
# Environment overrides:
#   OBI_TARGET_EXE   Glob matched against process executable paths.
#                    Default: *electron*  (covers Code OSS / Insiders renderer,
#                    main, ext host, helpers, since they all fork the same
#                    electron binary).
#   OBI_ENDPOINT     OTLP endpoint URL. Default: http://localhost:4317
#                    (works with --network=host).
#   OBI_IMAGE        OBI container image. Default: otel/ebpf-instrument:v0.9.0
#   OBI_LOG_LEVEL    info | debug | trace. Default: info.

set -euo pipefail

NAME="${OBI_CONTAINER_NAME:-vscode-obi}"
IMAGE="${OBI_IMAGE:-otel/ebpf-instrument:v0.9.0}"
TARGET_EXE="${OBI_TARGET_EXE:-*electron*}"
ENDPOINT="${OBI_ENDPOINT:-http://localhost:4317}"
LOG_LEVEL="${OBI_LOG_LEVEL:-info}"

if docker ps --format '{{.Names}}' | grep -qx "$NAME"; then
	echo "[start-obi.sh] '$NAME' already running"
	echo "[start-obi.sh] tail logs:  docker logs -f $NAME"
	exit 0
fi

docker rm -f "$NAME" >/dev/null 2>&1 || true

echo "[start-obi.sh] target exe glob: $TARGET_EXE"
echo "[start-obi.sh] OTLP endpoint:   $ENDPOINT"
echo "[start-obi.sh] image:           $IMAGE"

# --network=host is the simplest way to reach a host-published OTLP endpoint.
# --privileged + --pid=host are required for eBPF attach across the host PID ns.
docker run -d --rm \
	--name "$NAME" \
	--privileged \
	--pid=host \
	--network=host \
	-e OTEL_EXPORTER_OTLP_ENDPOINT="$ENDPOINT" \
	-e OTEL_EXPORTER_OTLP_PROTOCOL=grpc \
	-e OTEL_SERVICE_NAME=vscode-obi \
	-e OTEL_EBPF_AUTO_TARGET_EXE="$TARGET_EXE" \
	-e OTEL_EBPF_TRACE_PRINTER=text \
	-e OTEL_EBPF_BPF_CONTEXT_PROPAGATION=all \
	-e OTEL_EBPF_LOG_LEVEL="$LOG_LEVEL" \
	-v /sys/kernel/debug:/sys/kernel/debug \
	-v /sys/fs/bpf:/sys/fs/bpf \
	"$IMAGE" >/dev/null

# Give OBI a moment to start, then dump the first lines so we can see early failures.
sleep 2
if ! docker ps --format '{{.Names}}' | grep -qx "$NAME"; then
	echo "[start-obi.sh] container '$NAME' exited early. Logs:" >&2
	docker logs --tail 80 "$NAME" 2>&1 | sed 's/^/  /' >&2 || true
	exit 1
fi

echo "[start-obi.sh] running. Live logs:  docker logs -f $NAME"
echo "[start-obi.sh] Aspire UI:           http://localhost:18888"
echo
echo "[start-obi.sh] last 20 log lines:"
docker logs --tail 20 "$NAME" 2>&1 | sed 's/^/  /'
