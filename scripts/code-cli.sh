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

	ELECTRON_RUN_AS_NODE=1 \
	NODE_ENV=development \
	VSCODE_DEV=1 \
	ELECTRON_ENABLE_LOGGING=1 \
	ELECTRON_ENABLE_STACK_DUMPING=1 \
	"$CODE" --debug=5874 "$ROOT/out/cli.js" . "$@"
}

code "$@"
