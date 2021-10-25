#!/bin/bash

# This file simply wraps the docker build command to build an image that includes
# a cache.tar file with the result of "prepare.sh" inside of it. See cache.Dockerfile
# for the steps that are actually taken to do this.

set -e

SCRIPT_PATH="$(cd $(dirname "${BASH_SOURCE[0]}") && pwd)"
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
