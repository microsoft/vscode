#!/bin/sh
set -e

CONTAINER=""
ARCH="amd64"
BASE_IMAGE=""
CACHE_DIR=""
ARGS=""

while [ $# -gt 0 ]; do
	case "$1" in
		--container) CONTAINER="$2"; shift 2 ;;
		--arch) ARCH="$2"; shift 2 ;;
		--base-image) BASE_IMAGE="$2"; shift 2 ;;
		--cache-dir) CACHE_DIR="$2"; shift 2 ;;
		*) ARGS="$ARGS $1"; shift ;;
	esac
done

if [ -z "$CONTAINER" ]; then
	echo "Error: --container is required"
	exit 1
fi

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
ROOT_DIR=$(cd "$SCRIPT_DIR/.." && pwd)

# Create a buildx builder with docker-container driver if cache is enabled
# (required for --cache-to support)
if [ -n "$CACHE_DIR" ]; then
	BUILDER_NAME="vscode-sanity"
	if ! docker buildx inspect "$BUILDER_NAME" > /dev/null 2>&1; then
		echo "Creating buildx builder: $BUILDER_NAME"
		docker buildx create --name "$BUILDER_NAME" --driver docker-container --use
	else
		docker buildx use "$BUILDER_NAME"
	fi
fi

echo "Building container image: $CONTAINER"
docker buildx build \
	--platform "linux/$ARCH" \
	${BASE_IMAGE:+--build-arg "BASE_IMAGE=$BASE_IMAGE"} \
	${CACHE_DIR:+--cache-from "type=local,src=$CACHE_DIR"} \
	${CACHE_DIR:+--cache-to "type=local,dest=$CACHE_DIR,mode=max"} \
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
