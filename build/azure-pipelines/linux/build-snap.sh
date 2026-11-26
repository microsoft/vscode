#!/usr/bin/env bash
# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License. See License.txt in the project root for license information.

set -e

# Get snapcraft version
snapcraft --version

# Configure apt to retry on transient network failures
# This applies to both the apt commands below and snapcraft's internal apt operations for stage-packages
sudo sh -c 'echo "Acquire::Retries \"5\";" > /etc/apt/apt.conf.d/80-retries'

# Abandon a stalled connection after 15s instead of apt's default 120s. snapcraft
# fetches stage-packages one at a time, and when the mirror stalls a connection the
# retry on a new one usually succeeds at once; with the default, 35 such stalls took
# 70 minutes and the job hit its time limit. The timeout applies to inactivity, so
# slow but progressing downloads are unaffected.
sudo sh -c 'echo "Acquire::http::Timeout \"15\";" > /etc/apt/apt.conf.d/80-timeout'

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
sudo DEBIAN_FRONTEND=noninteractive apt-get upgrade -y
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y curl apt-transport-https ca-certificates gcc

# The build container provides the modern patchelf used by this Snapcraft image.
# Route Snapcraft's bundled path and explicit override-build/override-prime calls
# to that implementation so enable-patchelf patches the complete payload consistently.
SNAPCRAFT_PATCHELF="${SNAP:-/snap/snapcraft/current}/bin/patchelf"
if [ -x /snap/bin/patchelf ] && [ -e "$SNAPCRAFT_PATCHELF" ]; then
  sudo ln -sf /snap/bin/patchelf "$SNAPCRAFT_PATCHELF"
fi
"$SNAPCRAFT_PATCHELF" --version

# Define variables
SNAP_ROOT="$(pwd)/.build/linux/snap/$VSCODE_ARCH"

# Build OpenSSL 3 shared libraries against core24 glibc from the prebuilt static
# archives so the Copilot SDK runtime resolves libcrypto.so.3 / libssl.so.3 from
# the snap rather than loading an incompatible host OpenSSL.
OPENSSL_PREBUILT_DIR="$(pwd)/.build/linux/snap/openssl"
if [ -f "$OPENSSL_PREBUILT_DIR/libcrypto.a" ] && [ -f "$OPENSSL_PREBUILT_DIR/libssl.a" ]; then
  for prebuild_dir in "$SNAP_ROOT"/code-*/usr/share/*/resources/app/node_modules.asar.unpacked/@microsoft/copilot-sdk-linux-*/prebuilds/linux-*; do
    [ -d "$prebuild_dir" ] || continue
    gcc -shared -Wl,-soname,libcrypto.so.3 \
      -Wl,--whole-archive "$OPENSSL_PREBUILT_DIR/libcrypto.a" -Wl,--no-whole-archive \
      -ldl -pthread -o "$prebuild_dir/libcrypto.so.3"
    gcc -shared -Wl,-soname,libssl.so.3 \
      -Wl,-rpath,'$ORIGIN' \
      -Wl,--whole-archive "$OPENSSL_PREBUILT_DIR/libssl.a" -Wl,--no-whole-archive \
      -L"$prebuild_dir" -l:libcrypto.so.3 -ldl -pthread -o "$prebuild_dir/libssl.so.3"
  done
fi

# Create snap package
BUILD_VERSION="$(date +%s)"
SNAP_FILENAME="code-$VSCODE_QUALITY-$VSCODE_ARCH-$BUILD_VERSION.snap"
SNAP_PATH="$SNAP_ROOT/$SNAP_FILENAME"
case $VSCODE_ARCH in
  x64) SNAPCRAFT_TARGET_ARGS=() ;;
  *) SNAPCRAFT_TARGET_ARGS=(--build-for "$VSCODE_ARCH") ;;
esac
(
  set -o pipefail
  cd "$SNAP_ROOT"/code-*
  snapcraftLog=$(mktemp)
  trap 'rm -f "$snapcraftLog"' EXIT

  # Snapcraft's snap puts craftctl in $SNAP/libexec/snapcraft and relies on snapd's
  # environment block to add it to PATH. Add Snapcraft's bin directory too so
  # override-build and override-prime use the container's modern patchelf.
  SNAPCRAFT_PATH="${SNAP:-/snap/snapcraft/current}/bin:${SNAP:-/snap/snapcraft/current}/libexec/snapcraft:$PATH"

  # Retry Store initialization 429s only while Snapcraft has not written part state
  # or created a partial output snap.
  # Snapcraft 9 requires --output to stay inside the project directory, so pack to
  # $SNAP_FILENAME in cwd and move it to $SNAP_PATH afterwards.
  # Three backoffs with jitter, then a final attempt (0 means no more retries).
  for delay in 30 60 120 0; do
    if sudo --preserve-env env "PATH=$SNAPCRAFT_PATH" snapcraft pack --destructive-mode "${SNAPCRAFT_TARGET_ARGS[@]}" --output "$SNAP_FILENAME" 2>&1 | tee "$snapcraftLog"; then
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

  sudo mv "$SNAP_FILENAME" "$SNAP_PATH"
)
