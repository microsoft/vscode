#!/usr/bin/env sh
#
# Copyright (c) Microsoft Corporation. All rights reserved.
#

case "$1" in
	--inspect*) INSPECT="$1"; shift;;
esac

ROOT="$(dirname "$(dirname "$(readlink -f "$0")")")"

# Do not remove this check.
# Provides a way to skip the server requirements check from
# outside the install flow. A system process can create this
# file before the server is downloaded and installed.
skip_check=0
if [ -f "/tmp/vscode-skip-server-requirements-check" ]; then
	echo "!!! WARNING: Skipping server pre-requisite check !!!"
	echo "!!! Server stability is not guaranteed. Proceed at your own risk. !!!"
	skip_check=1
fi

# Check platform requirements
if [ "$(echo "$@" | grep -c -- "--skip-requirements-check")" -eq 0 ] && [ $skip_check -eq 0 ]; then
	$ROOT/bin/helpers/check-requirements.sh
	exit_code=$?
	if [ $exit_code -ne 0 ]; then
		exit $exit_code
	fi
fi

"$ROOT/node" ${INSPECT:-} "$ROOT/out/server-main.js" "$@"
