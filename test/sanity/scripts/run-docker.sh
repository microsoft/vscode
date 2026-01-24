#!/bin/sh
set -e

CONTAINER=""
ARCH="amd64"
BASE_IMAGE=""
CACHE_FROM_DIR=""
CACHE_TO_DIR=""
ARGS=""

while [ $# -gt 0 ]; do
	case "$1" in
		--container) CONTAINER="$2"; shift 2 ;;
		--arch) ARCH="$2"; shift 2 ;;
		--base-image) BASE_IMAGE="$2"; shift 2 ;;
		--cache-from-dir) CACHE_FROM_DIR="$2"; shift 2 ;;
		--cache-to-dir) CACHE_TO_DIR="$2"; shift 2 ;;
		*) ARGS="$ARGS $1"; shift ;;
	esac
done

if [ -z "$CONTAINER" ]; then
	echo "Error: --container is required"
	exit 1
fi

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
ROOT_DIR=$(cd "$SCRIPT_DIR/.." && pwd)

# Create a buildx builder with docker-container driver if it doesn't exist
# This is required for cache export/import with type=local
BUILDER_NAME="vscode-sanity"
if ! docker buildx inspect "$BUILDER_NAME" > /dev/null 2>&1; then
	echo "Creating buildx builder: $BUILDER_NAME"
	docker buildx create --name "$BUILDER_NAME" --driver docker-container --bootstrap
fi

echo "Building container image: $CONTAINER"
docker buildx build \
	--builder "$BUILDER_NAME" \
	--platform "linux/$ARCH" \
	${BASE_IMAGE:+--build-arg "BASE_IMAGE=$BASE_IMAGE"} \
	${CACHE_FROM_DIR:+--cache-from "type=local,src=$CACHE_FROM_DIR"} \
	${CACHE_TO_DIR:+--cache-to "type=local,dest=$CACHE_TO_DIR,mode=max"} \
	--load \
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
