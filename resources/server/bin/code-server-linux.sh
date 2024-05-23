#!/usr/bin/env sh
#
# Copyright (c) Microsoft Corporation. All rights reserved.
#

case "$1" in
	--inspect*) INSPECT="$1"; shift;;
esac

ROOT="$(dirname "$(dirname "$(readlink -f "$0")")")"

# workaround for https://github.com/microsoft/vscode/issues/212678
# Remove this once we update to Node.js >= 20.11.x
export UV_USE_IO_URING=0

"$ROOT/node" ${INSPECT:-} "$ROOT/out/server-main.js" "$@"
