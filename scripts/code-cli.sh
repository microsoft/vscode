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
	if [[ "$OSTYPE" == "darwin"* ]]; then
		test -d .build/electron/Code\ -\ OSS.app || ./node_modules/.bin/gulp electron
	else
		test -d .build/electron/code-oss || ./node_modules/.bin/gulp electron
	fi

	# Build
	test -d out || ./node_modules/.bin/gulp compile

	# Launch Code
	[[ "$OSTYPE" == "darwin"* ]] \
		&& ELECTRON=.build/electron/Code\ -\ OSS.app/Contents/MacOS/Electron \
		|| ELECTRON=.build/electron/code-oss

	CLI="$ROOT/out/cli.js"

	ATOM_SHELL_INTERNAL_RUN_AS_NODE=1 \
	NODE_ENV=development \
	VSCODE_DEV=1 \
	ELECTRON_ENABLE_LOGGING=1 \
	ELECTRON_ENABLE_STACK_DUMPING=1 \
	"$ELECTRON" "$CLI" . "$@"
}

code "$@"
