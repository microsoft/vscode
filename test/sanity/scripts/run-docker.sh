#!/bin/sh
set -e

CONTAINER=""
ARCH="amd64"
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
	echo "Building container image: $CONTAINER"
	docker buildx build \
		--platform "linux/$ARCH" \
		${BASE_IMAGE:+--build-arg "BASE_IMAGE=$BASE_IMAGE"} \
		--tag "$CONTAINER" \
		--file "$ROOT_DIR/containers/$CONTAINER.dockerfile" \
		"$ROOT_DIR/containers"
else
	echo "Using cached container image: $CONTAINER"
fi

# Configure QEMU page size for cross-architecture emulation (16K or 64K)
QEMU_ARGS=""
if [ -n "$PAGE_SIZE" ]; then
	case "$PAGE_SIZE" in
		16k) QEMU_ARGS="-e QEMU_CPU=max,pauth-impdef=on -e QEMU_PAGESIZE=16384" ;;
		64k) QEMU_ARGS="-e QEMU_CPU=max,pauth-impdef=on -e QEMU_PAGESIZE=65536" ;;
		*) echo "Warning: Unknown page size '$PAGE_SIZE', using default" ;;
	esac

	# Set up QEMU user-mode emulation for cross-architecture builds
	echo "Setting up QEMU emulation for linux/$ARCH"
	docker run --privileged --rm tonistiigi/binfmt --install "$ARCH" > /dev/null
fi

echo "Running sanity tests in container"
docker run \
	--rm \
	--platform "linux/$ARCH" \
	--volume "$ROOT_DIR:/root" \
	$QEMU_ARGS \
	"$CONTAINER" \
	$ARGS
