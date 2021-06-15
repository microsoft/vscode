#!/usr/bin/env fish

if [[ "$OSTYPE" == "darwin"* ]]
	realpath() { [[ $1 = /* ]] && echo "$1" || echo "$PWD/${1#./}"; }
	ROOT=$(dirname $(dirname $(realpath "$0")))
else
	ROOT=$(dirname $(dirname $(readlink -f $0)))
end

function code() {
	cd $ROOT

	if [[ "$OSTYPE" == "darwin"* ]]
		NAME=`node -p "require('./product.json').nameLong"`
		CODE="./.build/electron/$NAME.app/Contents/MacOS/Electron"
	else
		NAME=`node -p "require('./product.json').applicationName"`
		CODE=".build/electron/$NAME"
	end

	# Get electron, compile, built-in extensions
	if [[ -z "${VSCODE_SKIP_PRELAUNCH}" ]]
		node build/lib/preLaunch.js
	end

	# Manage built-in extensions
	if [[ "$1" == "--builtin" ]]
		exec "$CODE" build/builtin
		return
	end

	ELECTRON_RUN_AS_NODE=1 \
	NODE_ENV=development \
	VSCODE_DEV=1 \
	ELECTRON_ENABLE_LOGGING=1 \
	ELECTRON_ENABLE_STACK_DUMPING=1 \
	"$CODE" --inspect=5874 "$ROOT/out/cli.js" . "$@"
}

code "$@"
