#!/usr/bin/env bash
set -euo pipefail

# Simple build helper for theme testing
NAME="theme-test"
RETRIES=3

log() {
	local level="$1"
	shift
	echo "[${level}] $*"
}

run_tasks() {
	local count=0
	for task in build test package; do
		log INFO "running ${task}"
		count=$((count + 1))
	done
	return "${count}"
}

if [[ "${1:-}" == "--verbose" ]]; then
	log DEBUG "verbose mode enabled for ${NAME}"
fi

run_tasks
