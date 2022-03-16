#!/usr/bin/env bash

# This file expands the cache.tar file in the image that contains the results of "prepare.sh"
# on top of the source tree. It runs as a postCreateCommand which runs after the container/codespace
# is already up where you would typically run a command like "yarn install".

set -e
SOURCE_FOLDER="$(cd "${1:-"."}" && pwd)"
CACHE_FOLDER="${2:-"$HOME/.devcontainer-cache"}"

if [ ! -d "${CACHE_FOLDER}" ]; then
	echo "No cache folder found."
	exit 0
fi

echo "[$(date)] Expanding $(du -h "${CACHE_FOLDER}/cache.tar") file to ${SOURCE_FOLDER}..."
cd "${SOURCE_FOLDER}"
# Ensure user/group is correct if the UID/GID was changed for some reason
echo "+1000 +$(id -u)" > "${CACHE_FOLDER}/cache-owner-map"
echo "+1000 +$(id -g)" > "${CACHE_FOLDER}/cache-group-map"
# Untar to workspace folder, preserving permissions and order, but mapping GID/UID if required
tar --owner-map="${CACHE_FOLDER}/cache-owner-map" --group-map="${CACHE_FOLDER}/cache-group-map" -xpsf "${CACHE_FOLDER}/cache.tar"
rm -rf "${CACHE_FOLDER}"
echo "[$(date)] Done!"
