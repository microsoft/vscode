#!/usr/bin/env bash

if [[ "$OSTYPE" == "darwin"* ]]; then
	realpath() { [[ $1 = /* ]] && echo "$1" || echo "$PWD/${1#./}"; }
	root=$(dirname "$(dirname "$(realpath "$0")")")
else
	root=$(dirname "$(dirname "$(readlink -f "$0")")")
fi

pushd "$root" || exit

if [[ "$OSTYPE" == "darwin"* ]]; then
	name=$(node -p "require('./product.json').nameLong")
	code="$root/.build/electron/$name.app/Contents/MacOS/Electron"
else
	name=$(node -p "require('./product.json').applicationName")
	code="$root/.build/electron/$name"
fi

# Get electron
yarn electron

popd || exit

export VSCODE_DEV=1
if [[ "$OSTYPE" == "darwin"* ]]; then
	ulimit -n 4096 ; ELECTRON_RUN_AS_NODE=1 \
		"$code" \
		"$@" \
		--ms-enable-electron-run-as-node
else
	ELECTRON_RUN_AS_NODE=1 \
		"$code" \
		"$@" \
		--ms-enable-electron-run-as-node
fi
