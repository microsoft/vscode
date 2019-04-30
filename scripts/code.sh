#!/usr/bin/env bash

set -e

if [[ "$OSTYPE" == "darwin"* ]]; then
	realpath() { [[ $1 = /* ]] && echo "$1" || echo "$PWD/${1#./}"; }
	ROOT=$(dirname "$(dirname "$(realpath "$0")")")

	# On Linux with Electron 2.0.x running out of a VM causes
	# a freeze so we only enable this flag on macOS
	export ELECTRON_ENABLE_LOGGING=1
else
	ROOT=$(dirname "$(dirname "$(readlink -f $0)")")
	if grep -qi Microsoft /proc/version; then
		IN_WSL=true
	fi
fi

function code() {
	cd "$ROOT"

	if [[ "$OSTYPE" == "darwin"* ]]; then
		NAME=`node -p "require('./product.json').nameLong"`
		CODE="./.build/electron/$NAME.app/Contents/MacOS/Electron"
	else
		NAME=`node -p "require('./product.json').applicationName"`
		CODE=".build/electron/$NAME"
	fi

	# Node modules
	test -d node_modules || yarn

	# Get electron
	node build/lib/electron.js || ./node_modules/.bin/gulp electron

	# Manage built-in extensions
	if [[ "$1" == "--builtin" ]]; then
		exec "$CODE" build/builtin
		return
	fi

	# Sync built-in extensions
	node build/lib/builtInExtensions.js

	# Build
	test -d out || ./node_modules/.bin/gulp compile

	# Configuration
	export NODE_ENV=development
	export VSCODE_DEV=1
	export VSCODE_CLI=1
	export ELECTRON_ENABLE_STACK_DUMPING=1

	# Launch Code
	exec "$CODE" . "$@"
}

function code-wsl()
{
	# in a wsl shell
	local WIN_CODE_CLI_CMD=$(wslpath -w "$ROOT/scripts/code-cli.bat")
	if ! [ -z "$WIN_CODE_CLI_CMD" ]; then
		local WSL_EXT_ID="ms-vscode-remote.remote-wsl"
		local WSL_EXT_WLOC=$(cmd.exe /c "$WIN_CODE_CLI_CMD" --locate-extension $WSL_EXT_ID)
		if ! [ -z "$WSL_EXT_WLOC" ]; then
			# replace \r\n with \n in WSL_EXT_WLOC
			local WSL_CODE=$(wslpath -u "${WSL_EXT_WLOC%%[[:cntrl:]]}")/scripts/wslCode-dev.sh
			$WSL_CODE "$ROOT" "$@"
			exit $?
		fi
	fi
}

if ! [ -z ${IN_WSL+x} ]; then
	code-wsl "$@"
fi
code "$@"