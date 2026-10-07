#!/usr/bin/env bash
# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License. See License.txt in the project root.

set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../../.." && pwd -P)
DEFAULT_STORAGE=disk
if [[ "$(uname -s)" == Linux && ( "${CI:-}" == true || "${TF_BUILD:-}" == true || "${TF_BUILD:-}" == True ) ]]; then
	DEFAULT_STORAGE=split
fi
STORAGE=${VSCODE_GIT_TEST_STORAGE:-$DEFAULT_STORAGE}

case "$STORAGE" in
	split|tmpfs)
		status=0
		VSCODE_GIT_TEST_STORAGE=disk bash "$ROOT/test/integration/run-with-tmpfs.sh" bash "$0" "$@" || status=$?
		if [[ "$STORAGE" == split ]]; then
			echo "Running required disk-backed Git commit, worktree, and symlink coverage."
			VSCODE_GIT_TEST_STORAGE=disk TEST_TMPFS_BACKING=disk MOCHA_GREP='git smoke test|worktreeSymlink|worktreeInclude' bash "$0" "$@" || status=$?
		fi
		exit "$status"
		;;
	disk)
		;;
	*)
		echo "Invalid Git test storage mode: $STORAGE" >&2
		exit 2
		;;
esac

if [[ "$#" -eq 0 ]]; then
	echo "Git tests require an application command." >&2
	exit 2
fi
CODE=$1
shift
ARGS=()
PROFILE=""
for argument in "$@"; do
	if [[ "$argument" == --user-data-dir=* ]]; then
		PROFILE=${argument#--user-data-dir=}
	else
		ARGS+=("$argument")
	fi
done
if [[ -z "$PROFILE" ]]; then
	echo "Git tests require an owned user-data directory." >&2
	exit 2
fi
if [[ "${TEST_TMPFS_BACKING:-disk}" == tmpfs ]]; then
	BASE_PROFILE=$PROFILE
	PROFILE=$(mktemp -d "$TMPDIR/vscode-git-profile.XXXXXX")
	if [[ -f "$BASE_PROFILE/User/settings.json" ]]; then
		mkdir -p "$PROFILE/User"
		cp "$BASE_PROFILE/User/settings.json" "$PROFILE/User/settings.json"
	fi
elif [[ "$(uname -s)" == Linux && "${TEST_TMPFS_BACKING:-}" == disk ]]; then
	case "$(findmnt -n -o FSTYPE --target "$PROFILE")" in
		tmpfs|ramfs)
			echo "Disk-backed Git coverage requires non-tmpfs user data: $PROFILE" >&2
			exit 1
			;;
	esac
fi
WORKSPACE="$PROFILE/git-workspace"
mkdir -p "$WORKSPACE"
echo "Git integration storage: ${TEST_TMPFS_BACKING:-disk}, workspace=$WORKSPACE"
"$CODE" "$WORKSPACE" "${ARGS[@]}" "--user-data-dir=$PROFILE"
