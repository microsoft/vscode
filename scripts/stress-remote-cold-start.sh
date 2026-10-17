#!/usr/bin/env bash
# TEMPORARY (flaky test flush-out): repeatedly cold-launch the remote "API tests (folder)"
# extension test window, recreating first-launch conditions every iteration, and count
# renderer-unresponsive events. Do not merge.
set -uo pipefail

ITERATIONS=${STRESS_ITERATIONS:-15}
ARM=${STRESS_ARM:-unknown}
# none: plain cold launch. gpu/renderer: SIGSTOP the first process of that type as soon as it
# spawns, keep it stopped for FREEZE_SECONDS, then SIGCONT it, to simulate a transient stall.
FREEZE_MODE=${STRESS_FREEZE_MODE:-none}
FREEZE_SECONDS=${STRESS_FREEZE_SECONDS:-25}
ROOT=$(pwd)
OUT=$ROOT/.build/logs/stress
mkdir -p "$OUT"

npm run gulp node >/dev/null

export REMOTE_VSCODE=vscode-remote://test+test$ROOT/extensions
export MOCHA_GREP='vscode API - env'

# Dumps the Electron process tree and GPU process kernel state as soon as the window is
# reported unresponsive, so a stalled GPU process launch can be told apart from a busy renderer.
watch_unresponsive() {
	local log=$1 diag=$2
	while sleep 0.5; do
		if grep -q 'is unresponsive\|detected unresponsive' "$log" 2>/dev/null; then
			{
				echo "--- $(date -u +%FT%T.%3NZ) process tree"
				ps -eo pid,ppid,etimes,stat,wchan:32,pcpu,args --forest | grep -E 'electron|code-oss|--type=' | grep -v grep | cut -c1-400
				for pid in $(pgrep -f -- '--type=gpu-process'); do
					echo "--- gpu-process $pid"
					sudo cat /proc/$pid/status 2>/dev/null | grep -E 'State|Threads'
					sudo cat /proc/$pid/stack 2>/dev/null
					for t in /proc/$pid/task/*; do echo "$t $(sudo cat $t/wchan 2>/dev/null) $(sudo cat $t/stat 2>/dev/null | cut -d' ' -f3)"; done
				done
				for pid in $(pgrep -f -- '--type=renderer'); do
					echo "--- renderer $pid"
					sudo cat /proc/$pid/status 2>/dev/null | grep -E 'State|Threads'
					sudo cat /proc/$pid/stack 2>/dev/null
				done
			} >> "$diag" 2>&1
			return
		fi
		if [[ -f "$log.done" ]]; then
			return
		fi
	done
}

# Freezes the first new process of the requested type for FREEZE_SECONDS.
freeze_first() {
	local type=$1 log=$2 deadline=$((SECONDS + 30)) pid=''
	while [[ $SECONDS -lt $deadline ]]; do
		pid=$(pgrep -n -f -- "--type=$type" || true)
		if [[ -n "$pid" ]]; then
			break
		fi
		sleep 0.02
	done
	if [[ -z "$pid" ]]; then
		echo "freeze: no $type process appeared" >> "$log"
		return
	fi
	kill -STOP "$pid" && echo "freeze: $(date -u +%T.%3N) stopped $type $pid for ${FREEZE_SECONDS}s" >> "$log"
	sleep "$FREEZE_SECONDS"
	kill -CONT "$pid" 2>/dev/null && echo "freeze: $(date -u +%T.%3N) resumed $type $pid" >> "$log"
}

passed=0; failed=0; unresponsive=0; recovered=0
for i in $(seq 1 "$ITERATIONS"); do
	echo "===== [$ARM] cold launch $i/$ITERATIONS ====="
	sync
	echo 3 | sudo tee /proc/sys/vm/drop_caches >/dev/null
	rm -rf ~/.cache/mesa_shader_cache ~/.cache/mesa_shader_cache_db
	UDD=$(mktemp -d)
	LOGS=$OUT/$i
	mkdir -p "$LOGS"
	export TESTRESOLVER_DATA_FOLDER=$(mktemp -d)
	export TESTRESOLVER_LOGS_FOLDER=$LOGS/server
	LOG=$LOGS/stdout.txt
	: > "$LOG"
	watch_unresponsive "$LOG" "$LOGS/unresponsive-diagnostics.txt" &
	WATCHER=$!
	FREEZER=''
	if [[ "$FREEZE_MODE" != none ]]; then
		freeze_first "$FREEZE_MODE" "$LOGS/freeze.txt" &
		FREEZER=$!
	fi
	START=$(date +%s)
	./scripts/code.sh --folder-uri="$REMOTE_VSCODE/vscode-api-tests/testWorkspace" \
		--extensionDevelopmentPath="$REMOTE_VSCODE/vscode-api-tests" \
		--extensionTestsPath="$REMOTE_VSCODE/vscode-api-tests/out/singlefolder-tests" \
		--disable-telemetry --disable-experiments --skip-welcome --skip-release-notes \
		--crash-reporter-directory="$ROOT/.build/crashes" --logsPath="$LOGS" --no-cached-data \
		--disable-updates --use-inmemory-secretstorage --disable-workspace-trust \
		--user-data-dir="$UDD" > "$LOG" 2>&1
	CODE=$?
	touch "$LOG.done"
	wait "$WATCHER" 2>/dev/null
	if [[ -n "$FREEZER" ]]; then
		kill "$FREEZER" 2>/dev/null; wait "$FREEZER" 2>/dev/null
		pkill -CONT -f -- '--type=' 2>/dev/null || true
		cat "$LOGS/freeze.txt" 2>/dev/null
	fi
	ELAPSED=$(( $(date +%s) - START ))
	if grep -q 'unresponsive' "$LOG"; then
		unresponsive=$((unresponsive + 1))
		echo "::warning title=Unresponsive window::[$ARM] iteration $i: $(grep 'unresponsive' "$LOG" | tr '\n' ' ')"
		[[ -f "$LOGS/unresponsive-diagnostics.txt" ]] && cat "$LOGS/unresponsive-diagnostics.txt"
	fi
	if grep -q 'recovered from unresponsive' "$LOG"; then
		recovered=$((recovered + 1))
	fi
	grep -E 'detected unresponsive|recovered from unresponsive|is unresponsive|did not recover|workbench#open|passing|failing|vaapi|gpu-process' "$LOG" | cut -c1-200
	if [[ $CODE -eq 0 ]]; then
		passed=$((passed + 1))
		echo "iteration $i: exit 0 in ${ELAPSED}s"
	else
		failed=$((failed + 1))
		echo "::error title=Cold launch failed::[$ARM] iteration $i exited with code $CODE after ${ELAPSED}s"
		tail -40 "$LOG"
	fi
	rm -rf "$UDD" "$TESTRESOLVER_DATA_FOLDER"
done

echo "STRESS SUMMARY arm=$ARM freeze=$FREEZE_MODE iterations=$ITERATIONS passed=$passed failed=$failed unresponsive=$unresponsive recovered=$recovered"
echo "::notice title=Stress summary::arm=$ARM freeze=$FREEZE_MODE iterations=$ITERATIONS passed=$passed failed=$failed unresponsive=$unresponsive recovered=$recovered"
[[ $failed -eq 0 ]]
