#!/usr/bin/env bash
# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License. See License.txt in the project root for license information.

# Installs the given apt packages. Retries the update and install as a whole when
# the Ubuntu archive is unreachable for a while (seen behind the network
# isolation proxy), and fails the step if the last attempt fails too.
#
# Usage: apt-install-with-retry.sh <package>...

set -euo pipefail

# Abandon a stalled connection after 15s instead of apt's default 120s, and
# retry failed downloads (see build-snap.sh).
sudo sh -c 'printf "%s\n" "Acquire::Retries \"5\";" "Acquire::http::Timeout \"15\";" > /etc/apt/apt.conf.d/80-vscode-retry'

attempts=3
for ((attempt = 1; attempt <= attempts; attempt++)); do
  if sudo apt-get update && sudo apt-get install -y "$@"; then
    exit 0
  fi
  if ((attempt < attempts)); then
    echo "apt failed (attempt $attempt of $attempts); retrying in 60s." >&2
    sleep 60
  fi
done

echo "apt failed after $attempts attempts." >&2
exit 1
