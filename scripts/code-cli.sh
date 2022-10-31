#!/usr/bin/env bash

if [[ "$OSTYPE" == "darwin"* ]]; then
	realpath() { [[ $1 = /* ]] && echo "$1" || echo "$PWD/${1#./}"; }
	root=$(dirname "$(dirname "$(realpath "$0")")")
else
	root=$(dirname "$(dirname "$(readlink -f "$0")")")
fi

function code() {
	cd "$root" || exit

	if [[ "$OSTYPE" == "darwin"* ]]; then
		name=$(node -p "require('./product.json').nameLong")
		code="./.build/electron/$name.app/Contents/MacOS/Electron"
	else
		name=$(node -p "require('./product.json').applicationName")
		code=".build/electron/$name"
	fi

	# Get electron, compile, built-in extensions
	if [[ -z "${VSCODE_SKIP_PRELAUNCH}" ]]; then
		node build/lib/preLaunch.js
	fi

	# Manage built-in extensions
	if [[ "$1" == "--builtin" ]]; then
		exec "$code" build/builtin
		return
	fi

	ELECTRON_RUN_AS_NODE=1 \
	NODE_ENV=development \
	VSCODE_DEV=1 \
	ELECTRON_ENABLE_LOGGING=1 \
	ELECTRON_ENABLE_STACK_DUMPING=1 \
	"$code" --inspect=5874 "$root/out/cli.js" --ms-enable-electron-run-as-node . "$@"
}

code "$@"
