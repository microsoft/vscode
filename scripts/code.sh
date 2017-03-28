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

	INTENDED_VERSION="v`node -p "require('./package.json').electronVersion"`"
	INSTALLED_VERSION=`cat .build/electron/version 2> /dev/null`

	# Node modules
	test -d node_modules || ./scripts/npm.sh install

	# Get electron
	(test -f "$CODE" && [ $INTENDED_VERSION == $INSTALLED_VERSION ]) || ./node_modules/.bin/gulp electron

	# Build
	test -d out || ./node_modules/.bin/gulp compile

	# Configuration
	export NODE_ENV=development
	export VSCODE_DEV=1
	export VSCODE_CLI=1
	export ELECTRON_ENABLE_LOGGING=1
	export ELECTRON_ENABLE_STACK_DUMPING=1

	# Launch Code
	exec "$CODE" . "$@"
}

# Use the following to get v8 tracing:
# code --js-flags="--trace-hydrogen --trace-phase=Z --trace-deopt --code-comments --hydrogen-track-positions --redirect-code-traces" "$@"

code "$@"
