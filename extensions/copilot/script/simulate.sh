#!/usr/bin/env bash
#---------------------------------------------------------------------------------------------
#  Copyright (c) Microsoft Corporation. All rights reserved.
#---------------------------------------------------------------------------------------------


set -e

if [[ "$OSTYPE" == "darwin"* ]]; then
	realpath() { [[ $1 = /* ]] && echo "$1" || echo "$PWD/${1#./}"; }
	ROOT=$(dirname "$(dirname "$(realpath "$0")")")
	ELTRON="$ROOT/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"
else
	ROOT=$(dirname "$(dirname "$(readlink -f $0)")")
	ELTRON="$ROOT/node_modules/electron/dist/electron"
fi

cd "$ROOT"
exec "$ELTRON" ./script/electron/simulationWorkbenchMain.js "$@"

exit $?
