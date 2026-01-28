#!/bin/sh
set -e

CONTAINER=""
ARCH="amd64"
MIRROR="mcr.microsoft.com/mirror/docker/library/"
BASE_IMAGE=""
PAGE_SIZE=""
ARGS=""

while [ $# -gt 0 ]; do
	case "$1" in
		--container) CONTAINER="$2"; shift 2 ;;
		--arch) ARCH="$2"; shift 2 ;;
		--base-image) BASE_IMAGE="$2"; shift 2 ;;
		--page-size) PAGE_SIZE="$2"; shift 2 ;;
		*) ARGS="$ARGS $1"; shift ;;
	esac
done

if [ -z "$CONTAINER" ]; then
	echo "Error: --container is required"
	exit 1
fi

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
ROOT_DIR=$(cd "$SCRIPT_DIR/.." && pwd)

# Only build if image doesn't exist (i.e., not loaded from cache)
if ! docker image inspect "$CONTAINER" > /dev/null 2>&1; then
	if [ "$PAGE_SIZE" != "" ]; then
		echo "Setting up QEMU user-mode emulation for $ARCH"
		docker run --privileged --rm tonistiigi/binfmt --install "$ARCH"
	fi

	echo "Building container image: $CONTAINER"
	docker buildx build \
		--platform "linux/$ARCH" \
		--build-arg "MIRROR=$MIRROR" \
		${BASE_IMAGE:+--build-arg "BASE_IMAGE=$BASE_IMAGE"} \
		--tag "$CONTAINER" \
		--file "$ROOT_DIR/containers/$CONTAINER.dockerfile" \
		"$ROOT_DIR/containers"
else
	echo "Using cached container image: $CONTAINER"
fi

# For 64K page size, use QEMU system emulation with a 64K kernel
if [ "$PAGE_SIZE" = "64k" ]; then
	exec "$SCRIPT_DIR/run-qemu-64k.sh" \
		--container "$CONTAINER" \
		-- $ARGS
else
	echo "Running sanity tests in container"
	docker run \
		--rm \
		--platform "linux/$ARCH" \
		--volume "$ROOT_DIR:/root" \
		--entrypoint sh \
		"$CONTAINER" \
		/root/containers/entrypoint.sh $ARGS
fi
