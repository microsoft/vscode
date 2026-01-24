#!/bin/sh
set -e

CONTAINER=""
ARCH="amd64"
BASE_IMAGE=""
CACHE_FROM=""
ARGS=""

while [ $# -gt 0 ]; do
	case "$1" in
		--container) CONTAINER="$2"; shift 2 ;;
		--arch) ARCH="$2"; shift 2 ;;
		--base-image) BASE_IMAGE="$2"; shift 2 ;;
		--cache-from) CACHE_FROM="$2"; shift 2 ;;
		*) ARGS="$ARGS $1"; shift ;;
	esac
done

if [ -z "$CONTAINER" ]; then
	echo "Error: --container is required"
	exit 1
fi

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
ROOT_DIR=$(cd "$SCRIPT_DIR/.." && pwd)

echo "Building container image: $CONTAINER"
docker buildx build \
	--platform "linux/$ARCH" \
	${BASE_IMAGE:+--build-arg "BASE_IMAGE=$BASE_IMAGE"} \
	${CACHE_FROM:+--cache-from "type=docker,ref=$CACHE_FROM"} \
	--tag "$CONTAINER" \
	--file "$ROOT_DIR/containers/$CONTAINER.dockerfile" \
	"$ROOT_DIR/containers"

echo "Running sanity tests in container"
docker run \
	--rm \
	--platform "linux/$ARCH" \
	--volume "$ROOT_DIR:/root" \
	"$CONTAINER" \
	$ARGS
