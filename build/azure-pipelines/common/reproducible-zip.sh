#!/usr/bin/env bash
#---------------------------------------------------------------------------------------------
# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License. See License.txt in the project root for license information.
#---------------------------------------------------------------------------------------------
#
# Create a reproducible .zip archive.
#
# Pre-touches every entry with the committer time of HEAD (override via
# SOURCE_DATE_EPOCH) and feeds a byte-sorted file list to zip so the archive
# is deterministic. The `-X` flag strips per-entry extra attributes (uid/gid,
# extended attributes); `-y` preserves symlinks as symlinks.
#
# Usage: reproducible-zip.sh <archive.zip> <cwd> <pattern>
#
# The script `cd`s into <cwd> and then runs `find <pattern> -print` to build
# the entry list. <pattern> is shell-expanded by the caller's shell, so:
#   - pass '*' (unquoted by the caller) to include top-level entries flat,
#     producing entries like 'Visual Studio Code.app/Contents/...'
#     (matches the old `cd src && zip -Xry archive *` darwin-client pattern)
#   - pass a literal directory name to include that directory and its
#     subtree, producing entries like 'vscode-server-darwin-x64/bin/...'
#     (matches the old `cd .. && zip -Xry archive name` darwin-server pattern)

set -e

# BSD `date -r`, `touch -t` and Info-ZIP `zip` all read TZ via localtime();
# force UTC so the DOS time written into the zip central directory does not
# depend on the build agent's timezone.
export TZ=UTC0

if [ "$#" -lt 3 ]; then
	echo "Usage: $0 <archive.zip> <cwd> <pattern>" >&2
	exit 1
fi

ARCHIVE_PATH="$1"
CWD="$2"
shift 2

# Resolve to an absolute path so the subshell `cd` below does not break it.
case "$ARCHIVE_PATH" in
	/*) ;;
	*) ARCHIVE_PATH="$(pwd)/$ARCHIVE_PATH" ;;
esac

SOURCE_DATE_EPOCH="${SOURCE_DATE_EPOCH:-$(git log -1 --pretty=%ct)}"
TOUCH_DATE=$(date -r "$SOURCE_DATE_EPOCH" "+%Y%m%d%H%M.%S")

(
	cd "$CWD"
	# Re-expand globs now that we are in <cwd>. Callers pass patterns quoted
	# (e.g. '*') so they survive the outer shell unscathed; here we eval them
	# into an array so e.g. 'Visual Studio Code.app' is one element, not three.
	patterns=()
	for arg in "$@"; do
		eval "matches=( $arg )"
		patterns+=( "${matches[@]}" )
	done
	if [ "${#patterns[@]}" -eq 0 ]; then
		echo "Error: no entries matched in $CWD" >&2
		exit 1
	fi
	# Verify each top-level entry actually exists (catches unmatched literal
	# globs that fell through to the literal pattern, e.g. '*' with no match).
	for entry in "${patterns[@]}"; do
		if [ ! -e "$entry" ] && [ ! -L "$entry" ]; then
			echo "Error: '$entry' does not exist in $CWD" >&2
			exit 1
		fi
	done
	find "${patterns[@]}" -exec touch -h -t "$TOUCH_DATE" {} +
	find "${patterns[@]}" -print | LC_ALL=C sort | zip -X -y "$ARCHIVE_PATH" -@
)
