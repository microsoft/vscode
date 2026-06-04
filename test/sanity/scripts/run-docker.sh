#!/bin/sh
set -e

CONTAINER=""
ARCH="amd64"
REGISTRY="vscodehub.azurecr.io/vscode-linux-build-agent/sanity-tests"
ARGS=""

while [ $# -gt 0 ]; do
	case "$1" in
		--container) CONTAINER="$2"; shift 2 ;;
		--arch) ARCH="$2"; shift 2 ;;
		*) ARGS="$ARGS $1"; shift ;;
	esac
done

if [ -z "$CONTAINER" ]; then
	echo "Error: --container is required"
	exit 1
fi

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
ROOT_DIR=$(cd "$SCRIPT_DIR/.." && pwd)
IMAGE="$REGISTRY:$CONTAINER-$ARCH"
HOST_UID=$(id -u)
HOST_GID=$(id -g)

# The container runs as root and writes into the bind-mounted volume, leaving
# files owned by root on the host. Restore host ownership so the agent user
# can read/publish artifacts (crash dumps).
fix_ownership() {
	docker run \
		--rm \
		--platform "linux/$ARCH" \
		--volume "$ROOT_DIR:/root" \
		--entrypoint sh \
		"$IMAGE" \
		-c "chown -R $HOST_UID:$HOST_GID /root" >/dev/null 2>&1 || true
}
trap fix_ownership EXIT

echo "Pulling container image: $IMAGE"
docker pull --platform "linux/$ARCH" "$IMAGE"

echo "Running sanity tests in container"
docker run \
	--rm \
	--platform "linux/$ARCH" \
	--shm-size=2g \
	--volume "$ROOT_DIR:/root" \
	${GITHUB_ACCOUNT:+--env GITHUB_ACCOUNT} \
	${GITHUB_PASSWORD:+--env GITHUB_PASSWORD} \
	--entrypoint sh \
	"$IMAGE" \
	/root/containers/entrypoint.sh $ARGS
