#!/usr/bin/env bash
#
# Copyright (c) Microsoft Corporation. All rights reserved.
#

case "$1" in
	--inspect*) INSPECT="$1"; shift;;
esac

realdir() {
	SOURCE=$1
	while [ -h "$SOURCE" ]; do
		DIR=$(dirname "$SOURCE")
		SOURCE=$(readlink "$SOURCE")
		[[ $SOURCE != /* ]] && SOURCE=$DIR/$SOURCE
	done
	echo "$( cd -P "$(dirname "$SOURCE")" >/dev/null 2>&1 && pwd )"
}

ROOT="$(dirname "$(realdir "$0")")"

"$ROOT/node" ${INSPECT:-} "$ROOT/out/server-main.js" "$@"

