#!/usr/bin/env bash

# This file is used to archive off a copy of any differences in the source tree into another location
# in the image. Once the codespace / container is up, this will be restored into its proper location.

set -e

SOURCE_FOLDER="${1:-"."}"
CACHE_FOLDER="${2:-"$HOME/.devcontainer-cache"}"

if [ ! -d "${CACHE_FOLDER}" ]; then
	echo "No cache folder found. Be sure to run before-cache.sh to set one up."
	exit 1
fi

echo "[$(date)] Starting cache operation..."
cd "${SOURCE_FOLDER}"
echo "[$(date)] Determining diffs..."
find -L . -not -path "*/.git/*" -and -not -path "${CACHE_FOLDER}/*.manifest" -type f > "${CACHE_FOLDER}/after.manifest"
grep -Fxvf  "${CACHE_FOLDER}/before.manifest" "${CACHE_FOLDER}/after.manifest" > "${CACHE_FOLDER}/cache.manifest"
echo "[$(date)] Archiving diffs..."
tar -cf "${CACHE_FOLDER}/cache.tar" --totals --files-from "${CACHE_FOLDER}/cache.manifest"
echo "[$(date)] Done! $(du -h "${CACHE_FOLDER}/cache.tar")"
