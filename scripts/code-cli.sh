#!/usr/bin/env bash

if [[ "$OSTYPE" == "darwin"* ]]; then
	realpath() { [[ $1 = /* ]] && echo "$1" || echo "$PWD/${1#./}"; }
	ROOT=$(dirname $(dirname $(realpath "$0")))
else
	ROOT=$(dirname $(dirname $(readlink -f $0)))
fi

function code() {
	cd $ROOT

	if [[ "$OSTYPE" == "darwin"* ]]; then
		NAME=`node -p "require('./product.json').nameLong"`
		CODE="./.build/electron/$NAME.app/Contents/MacOS/Electron"
	else
		NAME=`node -p "require('./product.json').applicationName"`
		CODE=".build/electron/$NAME"
	fi

	# Get electron, compile, built-in extensions
	if [[ -z "${VSCODE_SKIP_PRELAUNCH}" ]]; then
		node build/lib/preLaunch.js
	fi

	# Manage built-in extensions
	if [[ "$1" == "--builtin" ]]; then
		exec "$CODE" build/builtin
		return
	fi

	ELECTRON_RUN_AS_NODE=1 \
	NODE_ENV=development \
	VSCODE_DEV=1 \
	ELECTRON_ENABLE_LOGGING=1 \
	ELECTRON_ENABLE_STACK_DUMPING=1 \
	"$CODE" --inspect=5874 "$ROOT/out/cli.js" . "$@"
}

code "$@"
