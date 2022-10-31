#!/usr/bin/env bash

if [[ "$OSTYPE" == "darwin"* ]]; then
	realpath() { [[ $1 = /* ]] && echo "$1" || echo "$PWD/${1#./}"; }
	root=$(dirname "$(dirname "$(realpath "$0")")")
else
	root=$(dirname "$(dirname "$(readlink -f "$0")")")
fi

function code() {
	pushd "$root" || exit

	# Get electron, compile, built-in extensions
	if [[ -z "${VSCODE_SKIP_PRELAUNCH}" ]]; then
		node build/lib/preLaunch.js
	fi

	node=$(node build/lib/node.js)
	if [ ! -e "$node" ];then
		# Load remote node
		yarn gulp node
	fi

	popd || exit

	NODE_ENV=development \
	VSCODE_DEV=1 \
	"$node" "$root"/scripts/code-server.js "$@"
}

code "$@"
