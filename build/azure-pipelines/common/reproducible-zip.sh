#!/usr/bin/env bash
#---------------------------------------------------------------------------------------------
# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License. See License.txt in the project root for license information.
#---------------------------------------------------------------------------------------------
#
# Create a reproducible .zip archive of a directory's contents.
#
# Pre-touches every entry with the committer time of HEAD (override via
# SOURCE_DATE_EPOCH) and feeds a byte-sorted file list to zip so the archive
# is deterministic. The `-X` flag strips per-entry extra attributes (uid/gid,
# extended attributes); `-y` preserves symlinks as symlinks.
#
# Usage: reproducible-zip.sh <archive.zip> <source-dir>

set -e

if [ "$#" -ne 2 ]; then
	echo "Usage: $0 <archive.zip> <source-dir>" >&2
	exit 1
fi

ARCHIVE_PATH="$1"
SOURCE_DIR="$2"

# Resolve to an absolute path so the subshell `cd` below does not break it.
case "$ARCHIVE_PATH" in
	/*) ;;
	*) ARCHIVE_PATH="$(pwd)/$ARCHIVE_PATH" ;;
esac

SOURCE_DATE_EPOCH="${SOURCE_DATE_EPOCH:-$(git log -1 --pretty=%ct)}"
TOUCH_DATE=$(date -r "$SOURCE_DATE_EPOCH" "+%Y%m%d%H%M.%S")

(
	cd "$SOURCE_DIR"
	find . -exec touch -h -t "$TOUCH_DATE" {} +
	find . -print | LC_ALL=C sort | zip -X -y "$ARCHIVE_PATH" -@
)
