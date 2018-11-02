#!/bin/bash

if [[ "$OSTYPE" == "darwin"* ]]; then
	realpath() { [[ $1 = /* ]] && echo "$1" || echo "$PWD/${1#./}"; }
	ROOT=$(dirname $(dirname $(realpath "$0")))
else
	ROOT=$(dirname $(dirname $(readlink -f $0)))
fi

pushd $ROOT

if [[ "$OSTYPE" == "darwin"* ]]; then
	NAME=`node -p "require('./product.json').nameLong"`
	CODE="$ROOT/.build/electron/$NAME.app/Contents/MacOS/Electron"
else
	NAME=`node -p "require('./product.json').applicationName"`
	CODE="$ROOT/.build/electron/$NAME"
fi

# Get electron
node build/lib/electron.js || ./node_modules/.bin/gulp electron

popd

export VSCODE_DEV=1
if [[ "$OSTYPE" == "darwin"* ]]; then
	ulimit -n 4096 ; ELECTRON_RUN_AS_NODE=1 \
		"$CODE" \
		"$@"
else
	ELECTRON_RUN_AS_NODE=1 \
		"$CODE" \
		"$@"
fi
