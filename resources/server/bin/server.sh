#!/usr/bin/env sh
#
# Copyright (c) Microsoft Corporation. All rights reserved.
#

echo " "
echo "*"
echo "* Reminder: You may only use this software with Visual Studio family products,"
echo "* as described in the license (https://go.microsoft.com/fwlink/?linkid=2077057)"
echo "*"
echo " "

case "$1" in
	--inspect*) INSPECT="$1"; shift;;
esac

ROOT="$(dirname "$(realpath "$0")")"

"$ROOT/node" ${INSPECT:-} "$ROOT/out/remoteExtensionHostAgent.js" "$@"
