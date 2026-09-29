#!/usr/bin/env bash
# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License. See License.txt in the project root for license information.

set -euo pipefail

case "${VSCODE_ARCH:-}" in
  x64) SNAP_ARCH=amd64; ELF_ARCH=x86-64 ;;
  arm64) SNAP_ARCH=arm64; ELF_ARCH=aarch64 ;;
  *) echo "Unsupported Snap architecture: ${VSCODE_ARCH:-unset}" >&2; exit 1 ;;
esac

SNAP_ROOT="$(pwd)/.build/linux/snap/$VSCODE_ARCH"
BUILD_VERSION="$(date +%s)"
SNAP_FILENAME="code-$VSCODE_QUALITY-$VSCODE_ARCH-$BUILD_VERSION.snap"
SNAP_PATH="$SNAP_ROOT/$SNAP_FILENAME"
SNAP_SOURCE=()
for candidate in "$SNAP_ROOT"/code-*; do
  if [ -d "$candidate" ]; then
    SNAP_SOURCE+=("$candidate")
  fi
done
if [ "${#SNAP_SOURCE[@]}" -ne 1 ]; then
  echo "Expected one prepared Snap source in $SNAP_ROOT." >&2
  exit 1
fi
SNAP_BASE=$(awk '/^base: / { print $2; exit }' "${SNAP_SOURCE[0]}/snap/snapcraft.yaml")
case "$SNAP_BASE" in
  core22|core24|core26) ;;
  *) echo "Unsupported Snap base in the prepared package: $SNAP_BASE" >&2; exit 1 ;;
esac
if [ -n "${VSCODE_SNAP_BASE:-}" ] && [ "$SNAP_BASE" != "$VSCODE_SNAP_BASE" ]; then
  echo "The prepared Snap uses $SNAP_BASE, but VSCODE_SNAP_BASE is $VSCODE_SNAP_BASE." >&2
  exit 1
fi

SNAP_NAME=$(awk '/^name: / { print $2; exit }' "${SNAP_SOURCE[0]}/snap/snapcraft.yaml")
binaryInfo=$(file -b "${SNAP_SOURCE[0]}/usr/share/$SNAP_NAME/$SNAP_NAME")
if [[ "$binaryInfo" != *"$ELF_ARCH"* ]]; then
  echo "The prepared $SNAP_NAME executable is not $ELF_ARCH: $binaryInfo" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ "$SNAP_BASE" = core26 ]; then
  if [ ! -r /etc/os-release ]; then
    echo "Cannot determine the host release for a core26 Snap build." >&2
    exit 1
  fi
  . /etc/os-release
  if [ "${ID:-}" != ubuntu ] || [ "${VERSION_ID:-}" != 26.04 ] || [ "$(dpkg --print-architecture)" != "$SNAP_ARCH" ]; then
    echo "core26 Snap builds require native Ubuntu 26.04 on $SNAP_ARCH." >&2
    exit 1
  fi
  if ! command -v snapcraft >/dev/null 2>&1; then
    echo "Install Snapcraft 9 or newer to build a core26 Snap." >&2
    exit 1
  fi
  SNAPCRAFT_BIN=$(command -v snapcraft)
  SNAPCRAFT_VERSION=$("$SNAPCRAFT_BIN" --version)
  if [[ ! "$SNAPCRAFT_VERSION" =~ ^snapcraft[[:space:]]+(9|[1-9][0-9]+)\. ]]; then
    echo "core26 requires Snapcraft 9 or newer, found: $SNAPCRAFT_VERSION" >&2
    exit 1
  fi
else
  case "$SNAP_BASE" in
    core22)
      SNAPCRAFT_IMAGE="ghcr.io/canonical/snapcraft:8_core22@sha256:f664b5db4deeea6847a341e1a47627b7b9a245a0de4ca7f8f061f3b2bc9b4d5a"
      APT_SOURCES="$SCRIPT_DIR/snapcraft-ubuntu-22-$SNAP_ARCH.list"
      APT_TARGET="/etc/apt/sources.list"
      ;;
    core24)
      SNAPCRAFT_IMAGE="ghcr.io/canonical/snapcraft:8_core24@sha256:0443273552768a3230c2ede3aa47e567da0242bfbb0a7bb1283093208c404a0c"
      APT_SOURCES="$SCRIPT_DIR/snapcraft-ubuntu-24-$SNAP_ARCH.sources"
      APT_TARGET="/etc/apt/sources.list.d/ubuntu.sources"
      ;;
  esac
  APT_RETRIES="$SCRIPT_DIR/snapcraft-apt-retries.conf"
  if [ ! -f "$APT_SOURCES" ] || [ ! -f "$APT_RETRIES" ]; then
    echo "Missing $SNAP_BASE Snapcraft Apt configuration for $SNAP_ARCH." >&2
    exit 1
  fi
fi
(
  cd "${SNAP_SOURCE[0]}"
  snapcraftLog=$(mktemp)
  trap 'rm -f "$snapcraftLog"' EXIT

  pack_snap() {
    if [ "$SNAP_BASE" = core26 ]; then
      sudo --preserve-env "$SNAPCRAFT_BIN" pack --destructive-mode --output "$SNAP_FILENAME"
    else
      sudo -E docker run --rm --platform "linux/$SNAP_ARCH" \
        --mount "type=bind,src=$(pwd),dst=/project" \
        --mount "type=bind,src=$APT_SOURCES,dst=$APT_TARGET,readonly" \
        --mount "type=bind,src=$APT_RETRIES,dst=/etc/apt/apt.conf.d/80-retries,readonly" \
        "$SNAPCRAFT_IMAGE" pack --destructive-mode --output "/project/$SNAP_FILENAME"
    fi
  }

  # Retry only before Snapcraft has written part state or a partial snap.
  # Three backoffs with jitter, then a final attempt (0 means no more retries).
  for delay in 30 60 120 0; do
    if pack_snap 2>&1 | tee "$snapcraftLog"; then
      break
    else
      exitCodes=("${PIPESTATUS[@]}")
    fi

    (( exitCodes[1] == 0 )) || exit "${exitCodes[1]}"

    if (( delay == 0 || exitCodes[0] != 1 )) ||
      [[ -d parts && -n "$(find parts -mindepth 1 -print -quit)" ]] ||
      [[ -e "$SNAP_FILENAME" ]] ||
      [[ "$(awk 'NF { last = $0 } END { print last }' "$snapcraftLog")" != 'Issue encountered while processing your request: [429] Too Many Requests.' ]]; then
      exit "${exitCodes[0]}"
    fi

    delay=$((delay + RANDOM % 30))
    echo "Snap Store HTTP 429 before any parts ran; retrying initialization in ${delay}s." >&2
    sleep "$delay"
  done

  if [ ! -s "$SNAP_FILENAME" ]; then
    echo "Snapcraft did not create $SNAP_FILENAME." >&2
    exit 1
  fi
  mv "$SNAP_FILENAME" "$SNAP_PATH"
)

if [ ! -s "$SNAP_PATH" ]; then
  echo "Snap package is missing at $SNAP_PATH." >&2
  exit 1
fi
