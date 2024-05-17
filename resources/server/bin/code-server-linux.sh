#!/usr/bin/env sh
#
# Copyright (c) Microsoft Corporation. All rights reserved.
#

case "$1" in
	--inspect*) INSPECT="$1"; shift;;
esac

ROOT="$(dirname "$(dirname "$(readlink -f "$0")")")"

export UV_USE_IO_URING=0 # workaround for https://github.com/microsoft/vscode/issues/212678

"$ROOT/node" ${INSPECT:-} "$ROOT/out/server-main.js" "$@"
