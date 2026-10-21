#!/usr/bin/env bash
# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License. See License.txt in the project root.

set -euo pipefail

if [[ "$(uname -s)" != Linux || "$#" -eq 0 ]]; then
	echo "Agent Host tmpfs tests require Linux and a command." >&2
	exit 2
fi

TEST_TMPDIR=$(mktemp -d "${TMPDIR:-/tmp}/agent-host-e2e-tmpfs.XXXXXX")
MOUNTED=false
# Exit status when the command succeeded but the tmpfs could not be cleaned up, so the
# caller can tell a cleanup failure apart from a test failure.
CLEANUP_FAILED_STATUS=3

# Describes each holder so it can be traced to the test that leaked it: its parent and process group, its age (match it
# against the test log's timestamps), its full command line, and what it holds open on the mount. Each probe has the
# same budget as the holder probe, since reading /proc of a stuck process can block.
describe_holders() {
	local pid
	for pid in "$@"; do
		# fuser reports the mount itself as "kernel"; only processes can be described.
		if [[ ! "$pid" =~ ^[0-9]+$ ]]; then
			continue
		fi
		echo "Agent Host tmpfs holder $pid (PID, parent PID, process group, age in seconds, command line):" >&2
		timeout --signal=KILL 10s ps -o pid=,ppid=,pgid=,etimes=,args= -p "$pid" >&2 || true
		sudo -n timeout --signal=KILL 10s find "/proc/$pid/cwd" "/proc/$pid/root" "/proc/$pid/fd" -maxdepth 1 -lname "$TEST_TMPDIR*" -printf '  %p -> %l\n' >&2 2>/dev/null || true
	done
}

# Codex's Linux filesystem helper can strand a bubblewrap sandbox child that blocks forever, reparented to PID 1, when
# Codex kills the helper's launcher mid-session (KNOWN_ISSUES.md, openai/codex#54877). Kills such holders, but only if
# every holder is one, and retries the unmount. Any other holder keeps the unmount failure fatal.
reap_orphaned_codex_sandboxes() {
	local holders pid orphans=()
	holders=$(sudo -n timeout --signal=KILL 10s fuser -m "$TEST_TMPDIR" 2>/dev/null) || true
	for pid in $holders; do
		# fuser reports the mount itself as "kernel"; only processes can hold it busy.
		if [[ ! "$pid" =~ ^[0-9]+$ ]]; then
			continue
		fi
		if [[ "$(timeout --signal=KILL 10s ps -o ppid= -p "$pid" | tr -d ' ')" != 1 ]] || ! timeout --signal=KILL 10s ps -o args= -p "$pid" | grep -q -- '--codex-run-as-fs-helper'; then
			return 1
		fi
		orphans+=("$pid")
	done
	if [[ "${#orphans[@]}" -eq 0 ]]; then
		return 1
	fi
	for pid in "${orphans[@]}"; do
		echo "::warning title=Orphaned Codex sandbox helper::Killed orphaned Codex sandbox helper $pid holding the Agent Host test tmpfs; see src/vs/platform/agentHost/test/node/e2e/KNOWN_ISSUES.md"
		describe_holders "$pid"
		sudo -n kill -KILL -- "$pid" || true
	done
	for _ in {1..50}; do
		if sudo -n umount -- "$TEST_TMPDIR" 2>/dev/null; then
			return 0
		fi
		sleep 0.1
	done
	return 1
}

cleanup_failure_status() {
	if [[ "$1" -eq 0 ]]; then
		echo "$CLEANUP_FAILED_STATUS"
	else
		echo "$1"
	fi
}

cleanup() {
	local status=$?
	trap - EXIT
	if [[ "$MOUNTED" == true ]]; then
		if ! sudo -n umount -- "$TEST_TMPDIR" && ! reap_orphaned_codex_sandboxes; then
			echo "Failed to unmount Agent Host test tmpfs: $TEST_TMPDIR" >&2
			echo "Agent Host tmpfs mount holders (PID, command, and access type):" >&2
			# fuser writes the holder PIDs to stdout and its verbose table to stderr.
			local holders=''
			if holders=$(sudo -n timeout --signal=KILL 10s fuser -vm "$TEST_TMPDIR"); then
				:
			else
				local diagnostic_status=$?
				echo "Agent Host tmpfs holder diagnostics exited with status $diagnostic_status; the unmount failure remains fatal." >&2
			fi
			# shellcheck disable=SC2086 # One argument per PID.
			describe_holders $holders
			exit "$(cleanup_failure_status "$status")"
		fi
	fi
	if ! rmdir -- "$TEST_TMPDIR"; then
		echo "Failed to remove Agent Host tmpfs mount directory: $TEST_TMPDIR" >&2
		exit "$(cleanup_failure_status "$status")"
	fi
	exit "$status"
}
trap cleanup EXIT

sudo -n mount -t tmpfs -o "size=4G,mode=700,uid=$(id -u),gid=$(id -g),nosuid,nodev" tmpfs "$TEST_TMPDIR"
MOUNTED=true
FILESYSTEM=$(findmnt -n -o FSTYPE --target "$TEST_TMPDIR")
if [[ "$FILESYSTEM" != tmpfs ]]; then
	echo "Agent Host test storage is not tmpfs: $TEST_TMPDIR" >&2
	exit 1
fi
echo "Agent Host E2E storage: tmpfs ($TEST_TMPDIR)"
findmnt --target "$TEST_TMPDIR"
TMPDIR="$TEST_TMPDIR" TMP="$TEST_TMPDIR" TEMP="$TEST_TMPDIR" AGENT_HOST_E2E_STORAGE_BACKING=tmpfs "$@"
