#!/usr/bin/env bash
# Installs a Node.js release from nodejs.org for the current host and puts it on the
# PATH of later pipeline steps. Unlike UseNode@1, which has no per-download deadline,
# each attempt is bounded, so a stalled download is retried instead of using up the job
# timeout. A step timeout would not help: Azure Pipelines never retries a timed-out step.
#
# Usage: install-node.sh <version> <install-dir>
set -euo pipefail

VERSION="$1"
INSTALL_DIR="$2"
ATTEMPTS="${NODE_DOWNLOAD_ATTEMPTS:-4}"
MAX_TIME="${NODE_DOWNLOAD_MAX_TIME:-180}"

case "$(uname -s)" in
	Linux) PLATFORM=linux ;;
	Darwin) PLATFORM=darwin ;;
	*) echo "Unsupported OS: $(uname -s)" >&2; exit 1 ;;
esac
case "$(uname -m)" in
	x86_64|amd64) ARCH=x64 ;;
	aarch64|arm64) ARCH=arm64 ;;
	*) echo "Unsupported architecture: $(uname -m)" >&2; exit 1 ;;
esac

NAME="node-v${VERSION}-${PLATFORM}-${ARCH}"
BASE_URL="https://nodejs.org/dist/v${VERSION}"
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

download() {
	# Abort an attempt that runs too long or makes no real progress for 30 s.
	curl -fsSL --connect-timeout 20 --max-time "$MAX_TIME" --speed-limit 102400 --speed-time 30 -o "$2" "$1"
}

sha256() {
	if command -v sha256sum > /dev/null; then sha256sum "$1"; else shasum -a 256 "$1"; fi | cut -d' ' -f1
}

for attempt in $(seq 1 "$ATTEMPTS"); do
	if download "$BASE_URL/SHASUMS256.txt" "$WORK_DIR/SHASUMS256.txt" \
		&& download "$BASE_URL/$NAME.tar.gz" "$WORK_DIR/$NAME.tar.gz"; then
		EXPECTED="$(grep " $NAME.tar.gz\$" "$WORK_DIR/SHASUMS256.txt" | cut -d' ' -f1 || true)"
		ACTUAL="$(sha256 "$WORK_DIR/$NAME.tar.gz")"
		if [ -n "$EXPECTED" ] && [ "$EXPECTED" = "$ACTUAL" ]; then
			break
		fi
		echo "##[warning]Checksum mismatch for $NAME.tar.gz (expected '$EXPECTED', got '$ACTUAL')"
	else
		echo "##[warning]Downloading Node.js $VERSION failed (attempt $attempt of $ATTEMPTS)"
	fi
	if [ "$attempt" -eq "$ATTEMPTS" ]; then
		echo "##[error]Could not download Node.js $VERSION from $BASE_URL after $ATTEMPTS attempts"
		exit 1
	fi
	sleep $((attempt * 10))
done

rm -rf "$INSTALL_DIR"
mkdir -p "$INSTALL_DIR"
tar -xzf "$WORK_DIR/$NAME.tar.gz" -C "$INSTALL_DIR" --strip-components=1
echo "##vso[task.prependpath]$INSTALL_DIR/bin"
"$INSTALL_DIR/bin/node" --version
