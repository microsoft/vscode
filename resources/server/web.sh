#!/usr/bin/env bash

if [[ "$OSTYPE" == "darwin"* ]]; then
	realpath() { [[ $1 = /* ]] && echo "$1" || echo "$PWD/${1#./}"; }
	ROOT=$(dirname $(dirname $(dirname $(realpath "$0"))))
else
	ROOT=$(dirname $(dirname $(dirname $(readlink -f $0))))
fi

function code() {
	cd $ROOT

	# Sync built-in extensions
	yarn download-builtin-extensions

	# Load remote node
	yarn gulp node

	NODE=$(node build/lib/node.js)

	NODE_ENV=development \
	VSCODE_DEV=1 \
	$NODE $(dirname "$0")/bin-dev/code-web.js "$@"
}

code "$@"
