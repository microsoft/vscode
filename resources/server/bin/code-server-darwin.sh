#!/usr/bin/env sh
#
# Copyright (c) Microsoft Corporation. All rights reserved.
#

case "$1" in
	--inspect*) INSPECT="$1"; shift;;
esac

function realpath() { python -c "import os,sys; print(os.path.realpath(sys.argv[1]))" "$0"; }
ROOT=$(dirname $(dirname $(realpath "$0")))

"$ROOT/node" ${INSPECT:-} "$ROOT/out/server-main.js" "$@"
