#!/usr/bin/env bash
#---------------------------------------------------------------------------------------------
#  Copyright (c) Microsoft Corporation. All rights reserved.
#  Licensed under the MIT License. See License.txt in the project root for license information.
#---------------------------------------------------------------------------------------------

set -euo pipefail

if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
	exit 0
fi

if [[ "$(uname -s)" != "Darwin" ]]; then
	echo "A running Docker daemon is required for Dev Container smoke tests." >&2
	exit 1
fi

export HOMEBREW_NO_AUTO_UPDATE=1
brew install docker colima
colima start --runtime docker --vm-type vz --cpu 2 --memory 4 --disk 20
docker info
