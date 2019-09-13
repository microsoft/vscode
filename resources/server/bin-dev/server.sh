#!/usr/bin/env bash

if [[ "$OSTYPE" == "darwin"* ]]; then
	realpath() { [[ $1 = /* ]] && echo "$1" || echo "$PWD/${1#./}"; }
	ROOT=$(dirname $(dirname $(dirname $(dirname $(realpath "$0")))))
else
	ROOT=$(dirname $(dirname $(dirname $(dirname $(readlink -f $0)))))
fi

function code() {
	cd $ROOT

	# Sync built-in extensions
	yarn download-builtin-extensions

	NODE=$(node build/lib/node.js)

	# Download nodejs
	if [ ! -f $NODE ]; then
		yarn gulp node
	fi

	NODE_ENV=development \
	VSCODE_DEV=1 \
	$NODE "$ROOT/out/vs/server/main.js" "$@"
}

code "$@"
