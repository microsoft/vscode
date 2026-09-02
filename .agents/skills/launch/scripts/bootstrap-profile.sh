#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
USER_DATA_DIR="${CODE_OSS_DEV_AUTHED_USER_DATA_DIR:-$HOME/.vscode-oss-dev}"
EXIT_MARKER=""

while [[ $# -gt 0 ]]; do
	case "$1" in
		--repo) REPO="$2"; shift 2 ;;
		--user-data-dir) USER_DATA_DIR="$2"; shift 2 ;;
		--wait-for-exit) EXIT_MARKER="$2"; shift 2 ;;
		*) echo "Unknown arg: $1" >&2; exit 2 ;;
	esac
done

if [[ -n "$EXIT_MARKER" ]]; then
	for _ in {1..120}; do
		if [[ -f "$EXIT_MARKER" ]]; then
			node -e 'console.log(JSON.stringify({ exitMarker: process.argv[1], stopped: true }))' "$EXIT_MARKER"
			exit 0
		fi
		sleep 0.25
	done
	echo "Code OSS processes still use the bootstrap profile after 30 seconds." >&2
	exit 1
fi

if [[ ! -d "$REPO" ]]; then
	echo "VS Code checkout does not exist: $REPO" >&2
	exit 2
fi
REPO=$(cd "$REPO" && pwd -P)
if [[ ! -x "$REPO/scripts/code.sh" ]]; then
	echo "Could not find an executable Code OSS launcher at $REPO/scripts/code.sh." >&2
	exit 2
fi

mkdir -p "$USER_DATA_DIR"
USER_DATA_DIR=$(cd "$USER_DATA_DIR" && pwd -P)
unset ELECTRON_RUN_AS_NODE
LOG_FILE=$(mktemp "${TMPDIR:-/tmp}/code-oss-profile-bootstrap.XXXXXX.log")
CDP_PORT=$(node -e '
const net = require("net");
const server = net.createServer();
server.listen(0, "127.0.0.1", () => {
	console.log(server.address().port);
	server.close();
});
')
nohup "$REPO/scripts/code.sh" "--user-data-dir=$USER_DATA_DIR" "--remote-debugging-port=$CDP_PORT" >"$LOG_FILE" 2>&1 &
PID=$!
EXIT_MARKER="$LOG_FILE.exited"
STOP_MARKER="$LOG_FILE.stop"
nohup node -e '
	const { execFileSync } = require("node:child_process");
	const { existsSync, writeFileSync } = require("node:fs");
	const rootPid = Number(process.argv[1]);
	const marker = process.argv[2];
	const stopMarker = process.argv[3];
	const tracked = new Set([rootPid]);
	let stoppingAt;
	const psArgs = process.platform === "darwin"
		? ["-ax", "-o", "pid=", "-o", "ppid="]
		: ["-e", "-o", "pid=", "-o", "ppid="];
	let timer;
	const check = () => {
		const processes = execFileSync("ps", psArgs, { encoding: "utf8" })
			.trim()
			.split(/\r?\n/)
			.map(line => line.trim().split(/\s+/).map(Number))
			.filter(([pid, parentPid]) => Number.isInteger(pid) && Number.isInteger(parentPid));
		let changed;
		do {
			changed = false;
			for (const [pid, parentPid] of processes) {
				if (!tracked.has(pid) && tracked.has(parentPid)) {
					tracked.add(pid);
					changed = true;
				}
			}
		} while (changed);
		const runningPids = new Set(processes.map(([pid]) => pid));
		if (existsSync(stopMarker)) {
			stoppingAt ??= Date.now();
			const signal = Date.now() - stoppingAt >= 5000 ? "SIGKILL" : "SIGTERM";
			for (const pid of tracked) {
				if (runningPids.has(pid)) {
					try {
						process.kill(pid, signal);
					} catch (error) {
						if (error.code !== "ESRCH") throw error;
					}
				}
			}
		}
		if (![...tracked].some(pid => runningPids.has(pid))) {
			if (timer) {
				clearInterval(timer);
			}
			writeFileSync(marker, "");
			return true;
		}
		return false;
	};
	if (!check()) {
		timer = setInterval(check, 250);
	}
' "$PID" "$EXIT_MARKER" "$STOP_MARKER" >>"$LOG_FILE" 2>&1 &
disown $! 2>/dev/null || true

WAIT_FOR_CDP="$SCRIPT_DIR/waitForCdp.ts"
if ! READY_MS=$(node "$WAIT_FOR_CDP" "$PID" "$CDP_PORT" "${CODE_OSS_BOOTSTRAP_READY_TIMEOUT_MS:-90000}"); then
	touch "$STOP_MARKER"
	for _ in {1..120}; do
		[[ -f "$EXIT_MARKER" ]] && break
		sleep 0.25
	done
	echo "Code OSS bootstrap window did not become ready. Log tail:" >&2
	tail -n 40 "$LOG_FILE" >&2
	if [[ ! -f "$EXIT_MARKER" ]]; then
		echo "Bootstrap process tree did not stop after readiness failure." >&2
	fi
	exit 1
fi

node -e 'console.log(JSON.stringify({ pid: Number(process.argv[1]), cdpPort: Number(process.argv[2]), readyMs: Number(process.argv[3]), userDataDir: process.argv[4], logFile: process.argv[5], exitMarker: process.argv[6] }))' "$PID" "$CDP_PORT" "$READY_MS" "$USER_DATA_DIR" "$LOG_FILE" "$EXIT_MARKER"
