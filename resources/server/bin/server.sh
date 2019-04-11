#!/usr/bin/env bash
#
# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License. See License.txt in the project root for license information.

if  [[ $1 =~ ^\-\-inspect ]]; then
	INSPECT=$1
	shift
fi

ROOT="$(dirname "$(realpath "$0")")"

"$ROOT/node" "${INSPECT:-}" "$ROOT/out/remoteExtensionHostAgent.js" "$@"

