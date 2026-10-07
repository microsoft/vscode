#!/usr/bin/env bash
# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License. See License.txt in the project root.

set -euo pipefail

if [[ "$(uname -s)" != Linux || "$#" -eq 0 ]]; then
	echo "Tmpfs tests require Linux and a command." >&2
	exit 2
fi

TEST_TMPDIR=$(mktemp -d "${TMPDIR:-/tmp}/vscode-test-tmpfs.XXXXXX")
MOUNTED=false

cleanup() {
	local status=$?
	trap - EXIT
	if [[ "$MOUNTED" == true ]]; then
		if ! sudo -n umount -- "$TEST_TMPDIR"; then
			echo "Failed to unmount test tmpfs: $TEST_TMPDIR" >&2
			exit 1
		fi
	fi
	if ! rmdir -- "$TEST_TMPDIR"; then
		echo "Failed to remove test tmpfs mount directory: $TEST_TMPDIR" >&2
		exit 1
	fi
	exit "$status"
}
trap cleanup EXIT

sudo -n mount -t tmpfs -o "size=4G,mode=700,uid=$(id -u),gid=$(id -g),nosuid,nodev" tmpfs "$TEST_TMPDIR"
MOUNTED=true
if [[ "$(findmnt -n -o FSTYPE --target "$TEST_TMPDIR")" != tmpfs ]]; then
	echo "Test storage is not tmpfs: $TEST_TMPDIR" >&2
	exit 1
fi
echo "Test storage: tmpfs ($TEST_TMPDIR)"
findmnt --target "$TEST_TMPDIR"
TMPDIR="$TEST_TMPDIR" TMP="$TEST_TMPDIR" TEMP="$TEST_TMPDIR" TEST_TMPFS_BACKING=tmpfs "$@"
