#!/usr/bin/env bash
# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License. See License.txt in the project root for license information.

set -e

# Get snapcraft version
snapcraft --version

# Configure apt to retry on transient network failures
# This applies to both the apt commands below and snapcraft's internal apt operations for stage-packages
sudo sh -c 'echo "Acquire::Retries \"5\";" > /etc/apt/apt.conf.d/80-retries'

# Point apt at the Azure Ubuntu mirror. The build agents cannot reach
# archive.ubuntu.com/ports.ubuntu.com (DNS resolves them to a non-routable
# TEST-NET address, so connections time out), whereas the Azure mirror is
# reachable. This must run before any apt operation and before snapcraft, since
# snapcraft copies the host's /etc/apt configuration to download stage-packages.
for src in /etc/apt/sources.list /etc/apt/sources.list.d/*.list /etc/apt/sources.list.d/*.sources; do
  [ -f "$src" ] || continue
  sudo sed -i \
    -e 's|http://archive.ubuntu.com|http://azure.archive.ubuntu.com|g' \
    -e 's|http://ports.ubuntu.com|http://azure.ports.ubuntu.com|g' \
    "$src"
done

# Make sure we get latest packages
sudo apt-get update
sudo apt-get upgrade -y
sudo apt-get install -y curl apt-transport-https ca-certificates

# Define variables
SNAP_ROOT="$(pwd)/.build/linux/snap/$VSCODE_ARCH"

# Create snap package
BUILD_VERSION="$(date +%s)"
SNAP_FILENAME="code-$VSCODE_QUALITY-$VSCODE_ARCH-$BUILD_VERSION.snap"
SNAP_PATH="$SNAP_ROOT/$SNAP_FILENAME"
case $VSCODE_ARCH in
  x64) SNAPCRAFT_TARGET_ARGS="" ;;
  *) SNAPCRAFT_TARGET_ARGS="--target-arch $VSCODE_ARCH" ;;
esac
(
  set -o pipefail
  cd "$SNAP_ROOT"/code-*
  snapcraftLog=$(mktemp)
  trap 'rm -f "$snapcraftLog"' EXIT

  # Snapcraft 7.5.3 saves global state before running any part; only retry before that.
  # Recheck this boundary when upgrading the pinned image:
  # https://github.com/canonical/snapcraft/blob/7.5.3/snapcraft_legacy/internal/lifecycle/_runner.py#L121-L145
  # Three backoffs with jitter, then a final attempt (0 means no more retries).
  for delay in 30 60 120 0; do
    if sudo --preserve-env snapcraft snap $SNAPCRAFT_TARGET_ARGS --output "$SNAP_PATH" 2>&1 | tee "$snapcraftLog"; then
      break
    else
      exitCodes=("${PIPESTATUS[@]}")
    fi

    (( exitCodes[1] == 0 )) || exit "${exitCodes[1]}"

    if (( delay == 0 || exitCodes[0] != 1 )) ||
      [[ -e parts/.snapcraft_global_state ]] ||
      ! grep -Fxq 'Starting Snapcraft 7.5.3' "$snapcraftLog" ||
      [[ "$(awk 'NF { last = $0 } END { print last }' "$snapcraftLog")" != 'Issue encountered while processing your request: [429] Too Many Requests.' ]]; then
      exit "${exitCodes[0]}"
    fi

    delay=$((delay + RANDOM % 30))
    echo "Snap Store HTTP 429 before any parts ran; retrying initialization in ${delay}s." >&2
    sleep "$delay"
  done
)
