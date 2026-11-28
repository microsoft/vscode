#!/usr/bin/env bash
# Stop a Code OSS instance started by launch.sh and remove its throwaway profile.
#
# The main process is stopped first: when a renderer dies before the main
# process, the main process shows a "window terminated unexpectedly" dialog that
# activates the app and takes focus from the user. Then any leftover process
# that still uses this launch's user-data-dir is stopped.
#
# On macOS, also reports whether the instance activated (took focus) at any
# time since launch, including window reloads and this stop.
#
# Usage:
#   cleanup.sh <runDir> [--playwright-session <name>]
#
# Prints a single JSON line: {"runDir":"...","removed":true,"activated":false,"activations":[]}

set -euo pipefail

RUN_DIR=""
PW_SESSION=""
while [[ $# -gt 0 ]]; do
	case "$1" in
		--playwright-session)
			if [[ $# -lt 2 ]]; then
				echo "Missing value for --playwright-session." >&2
				exit 2
			fi
			PW_SESSION="$2"
			shift 2
			;;
		-*) echo "Unknown arg: $1" >&2; exit 2 ;;
		*)
			if [[ -n "$RUN_DIR" ]]; then
				echo "Unexpected arg: $1" >&2
				exit 2
			fi
			RUN_DIR="$1"
			shift
			;;
	esac
done

if [[ -z "$RUN_DIR" ]]; then
	echo "Usage: cleanup.sh <runDir> [--playwright-session <name>]" >&2
	exit 2
fi
if [[ ! -d "$RUN_DIR" ]]; then
	echo "Run directory does not exist: $RUN_DIR" >&2
	exit 2
fi
RUN_DIR=$(cd "$RUN_DIR" && pwd)
case "$(basename "$RUN_DIR")" in
	code-oss-dev-*) ;;
	*) echo "Refusing to clean a directory that launch.sh did not create: $RUN_DIR" >&2; exit 2 ;;
esac

if [[ -n "$PW_SESSION" ]]; then
	if ! npx @playwright/cli "-s=$PW_SESSION" close >/dev/null 2>&1; then
		echo "[cleanup.sh] WARNING: failed to close Playwright session $PW_SESSION; continuing cleanup." >&2
	fi
fi

PID=""
LAUNCHED_AT=""
# Match processes by the exact path launch.sh passed, which may differ from the
# resolved path (for example /tmp and /private/tmp on macOS).
PROFILE_ARG="--user-data-dir=$RUN_DIR/user-data"
if [[ -f "$RUN_DIR/launch.json" ]]; then
	{
		read -r PID
		read -r LAUNCHED_AT
		read -r PROFILE_ARG
	} <<< "$(node -e '
		const info = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
		console.log(`${info.pid ?? ""}\n${info.launchedAt ?? ""}\n--user-data-dir=${info.userDataDir}`);
	' "$RUN_DIR/launch.json")"
fi

# Processes that still use this launch's profile.
run_dir_pids() {
	ps -axo pid=,command= | grep -F -- "$PROFILE_ARG" | grep -v -F 'grep' | awk '{ print $1 }' || true
}

wait_for_exit() {
	local remaining
	for _ in $(seq 1 20); do
		remaining=$(run_dir_pids)
		if [[ -z "$remaining" ]]; then
			return 0
		fi
		sleep 0.25
	done
	return 1
}

# SIGKILL leaves the main process no chance to show any dialog.
if [[ -n "$PID" ]] && kill -0 "$PID" 2>/dev/null && ps -o command= -p "$PID" | grep -q -F -- "$PROFILE_ARG"; then
	kill -KILL "$PID" 2>/dev/null || true
fi
if ! wait_for_exit; then
	# shellcheck disable=SC2046
	kill -TERM $(run_dir_pids) 2>/dev/null || true
	if ! wait_for_exit; then
		# shellcheck disable=SC2046
		kill -KILL $(run_dir_pids) 2>/dev/null || true
		wait_for_exit || true
	fi
fi
REMAINING=$(run_dir_pids)
if [[ -n "$REMAINING" ]]; then
	echo "Code OSS processes still reference the run directory: $(echo "$REMAINING" | tr '\n' ' ')" >&2
	exit 1
fi

ACTIVATION='{"activated":null,"activations":[]}'
if [[ -n "$PID" && -n "$LAUNCHED_AT" ]]; then
	ACTIVATION=$("$(cd "$(dirname "$0")/.." && pwd)/check-activation.sh" "$PID" "$((LAUNCHED_AT - 1))")
	if [[ "$ACTIVATION" == *'"activated":true'* ]]; then
		echo "[cleanup.sh] WARNING: Code OSS (PID $PID) activated and took focus from the user during its lifetime: $ACTIVATION" >&2
		echo "[cleanup.sh] WARNING: report this so the launcher can be fixed." >&2
	fi
fi

rm -rf "$RUN_DIR"

node -e '
	const activation = JSON.parse(process.argv[2]);
	console.log(JSON.stringify({ runDir: process.argv[1], removed: true, activated: activation.activated, activations: activation.activations }));
' "$RUN_DIR" "$ACTIVATION"
