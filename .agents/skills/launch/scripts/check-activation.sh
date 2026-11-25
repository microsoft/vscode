#!/usr/bin/env bash
# Report whether a launched Code OSS instance activated (took focus from the
# user) since a given time. Code OSS launched by this skill must never activate;
# report any activation so the launcher can be fixed. Never hide the window to
# cover it up.
#
# On macOS this reads the unified log, where launchservicesd records every change
# of the frontmost application as "SETFRONT: pid=<pid> ...". Unlike polling the
# frontmost application, this also catches short activations.
#
# Usage:
#   check-activation.sh <pid> <since-epoch-seconds>
#
# Prints a single JSON line: {"pid":123,"activated":false,"activations":[]}
# "activated" is null where activations cannot be detected (Linux, Windows).

set -euo pipefail

if [[ $# -ne 2 || ! "$1" =~ ^[0-9]+$ || ! "$2" =~ ^[0-9]+$ ]]; then
	echo "Usage: check-activation.sh <pid> <since-epoch-seconds>" >&2
	exit 2
fi
PID="$1"
SINCE="$2"

if [[ "$(uname -s)" != "Darwin" ]]; then
	echo "{\"pid\":$PID,\"activated\":null,\"activations\":[]}"
	exit 0
fi

START=$(date -r "$SINCE" '+%Y-%m-%d %H:%M:%S')
# The trailing space keeps pid 123 from matching pid 1234.
if ! ACTIVATIONS=$(log show --style compact --start "$START" \
	--predicate "process == \"launchservicesd\" AND eventMessage CONTAINS \"SETFRONT: pid=$PID \"" 2>/dev/null); then
	echo "[check-activation.sh] could not read the unified log" >&2
	echo "{\"pid\":$PID,\"activated\":null,\"activations\":[]}"
	exit 0
fi

node -e '
	const pid = Number(process.argv[1]);
	const needle = `SETFRONT: pid=${pid} `;
	const activations = process.argv[2].split("\n")
		.filter(line => line.includes(needle))
		.map(line => line.split(" ").slice(0, 2).join(" "));
	console.log(JSON.stringify({ pid, activated: activations.length > 0, activations }));
' "$PID" "$ACTIVATIONS"
