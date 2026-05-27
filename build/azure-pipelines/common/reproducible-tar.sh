#!/usr/bin/env bash
#---------------------------------------------------------------------------------------------
# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License. See License.txt in the project root for license information.
#---------------------------------------------------------------------------------------------
#
# Create a reproducible .tar.gz archive.
#
# All file mtimes, ownership and entry ordering are normalized; the gzip
# wrapper carries no embedded timestamp or filename. The committer time of
# HEAD is used as the canonical modification time (override via SOURCE_DATE_EPOCH).
#
# Usage: reproducible-tar.sh <archive.tar.gz> [tar args...]
#   e.g. reproducible-tar.sh out/server.tar.gz -C .. vscode-server-linux-x64

set -e

if [ "$#" -lt 1 ]; then
	echo "Usage: $0 <archive.tar.gz> [tar args...]" >&2
	exit 1
fi

ARCHIVE_PATH="$1"
shift

# Exported so gzip (called by tar -z) honors it for its header mtime as well.
# Requires gzip >= 1.10 (2018); CI build images are well past that.
export SOURCE_DATE_EPOCH="${SOURCE_DATE_EPOCH:-$(git log -1 --pretty=%ct)}"

exec tar \
	--sort=name \
	--mtime="@$SOURCE_DATE_EPOCH" \
	--owner=0 \
	--group=0 \
	--numeric-owner \
	-czf "$ARCHIVE_PATH" \
	"$@"
