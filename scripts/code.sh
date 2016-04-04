#!/usr/bin/env bash

if [[ "$OSTYPE" == "darwin"* ]]; then
	realpath() { [[ $1 = /* ]] && echo "$1" || echo "$PWD/${1#./}"; }
	ROOT=$(dirname $(dirname $(realpath "$0")))
else
	ROOT=$(dirname $(dirname $(readlink -f $0)))
fi

function code() {
	cd $ROOT

	# Node modules
	test -d node_modules || ./scripts/npm.sh install

	# Get electron
	./node_modules/.bin/gulp electron

	# Build
	test -d out || ./node_modules/.bin/gulp compile

	# Configuration
	export NODE_ENV=development
	export VSCODE_DEV=1
	export ELECTRON_ENABLE_LOGGING=1
	export ELECTRON_ENABLE_STACK_DUMPING=1

	# Launch Code
	if [[ "$OSTYPE" == "darwin"* ]]; then
		exec ./.build/electron/Electron.app/Contents/MacOS/Electron . "$@"
	else
		exec ./.build/electron/electron . "$@"
	fi
}

code "$@"
