#!/usr/bin/env bash

# This file expands the cache.tar file in the image that contains the results of "prepare.sh"
# on top of the source tree. It runs as a postCreateCommand which runs after the container/codespace
# is already up where you would typically run a command like "yarn install".

set -e

SOURCE_FOLDER="$(cd "${1:-"."}" && pwd)"
CACHE_FOLDER="${2:-"/usr/local/etc/devcontainer-cache"}"

if [ ! -d "${CACHE_FOLDER}" ]; then
	echo "No cache folder found."
	exit 0
fi

echo "[$(date)] Expanding $(du -h "${CACHE_FOLDER}/cache.tar") file to ${SOURCE_FOLDER}..."
cd "${SOURCE_FOLDER}"
tar -xf "${CACHE_FOLDER}/cache.tar"
rm -f "${CACHE_FOLDER}/cache.tar"
echo "[$(date)] Done!"

