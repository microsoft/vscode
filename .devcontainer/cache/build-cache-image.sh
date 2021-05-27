#!/bin/bash

# This file simply wraps the dockeer build command used to build the image with the
# cached result of the commands from "prepare.sh" and pushes it to the specified
# container image registry.

set -e

SCRIPT_PATH="$(cd "$(dirname $0)" && pwd)"
CONTAINER_IMAGE_REPOSITORY="$1"
BRANCH="${2:-"main"}"

if [ "${CONTAINER_IMAGE_REPOSITORY}" = "" ]; then
	echo "Container repository not specified!"
	exit 1
fi

TAG="branch-${BRANCH//\//-}"
echo "[$(date)] ${BRANCH} => ${TAG}"
cd "${SCRIPT_PATH}/../.."

echo "[$(date)] Starting image build..."
docker build -t ${CONTAINER_IMAGE_REPOSITORY}:"${TAG}" -f "${SCRIPT_PATH}/cache.Dockerfile" .
echo "[$(date)] Image build complete."

echo "[$(date)] Pushing image..."
docker push ${CONTAINER_IMAGE_REPOSITORY}:"${TAG}"
echo "[$(date)] Done!"
