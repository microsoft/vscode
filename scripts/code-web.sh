#!/usr/bin/env bash

if [[ "$OSTYPE" == "darwin"* ]]; then
	realpath() { [[ $1 = /* ]] && echo "$1" || echo "$PWD/${1#./}"; }
	root=$(dirname "$(dirname "$(realpath "$0")")")
else
	root=$(dirname "$(dirname "$(readlink -f "$0")")")
fi

function code() {
	cd "$root" || exit

	# Sync built-in extensions
	yarn download-builtin-extensions

	node=$(node build/lib/node.js)
	if [ ! -e "$node" ];then
		# Load remote node
		yarn gulp node
	fi

	node=$(node build/lib/node.js)

	"$node" ./scripts/code-web.js "$@"
}

code "$@"
