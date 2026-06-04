#!/usr/bin/env bash
set -e

# Get snapcraft version
snapcraft --version

# Configure apt to retry on transient network failures
# This applies to both the apt commands below and snapcraft's internal apt operations for stage-packages
sudo sh -c 'echo "Acquire::Retries \"5\";" > /etc/apt/apt.conf.d/80-retries'

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
(cd $SNAP_ROOT/code-* && sudo --preserve-env snapcraft snap $SNAPCRAFT_TARGET_ARGS --output "$SNAP_PATH")
