#!/usr/bin/env bash

set -e

if [[ "$OSTYPE" == "darwin"* ]]; then
	realpath() { [[ "$1" = /* ]] && echo "$1" || echo "$PWD/${1#./}"; }
	root=$(dirname "$(dirname "$(realpath "$0")")")
else
	root=$(dirname "$(dirname "$(readlink -f "$0")")")
	# If the script is running in Docker using the WSL2 engine, powershell.exe won't exist
	if grep -qi Microsoft /proc/version && type powershell.exe > /dev/null 2>&1; then
		IN_WSL=true
	fi
fi

function code() {
	cd "$root" || exit

	if [[ "$OSTYPE" == "darwin"* ]]; then
		name=$(node -p "require('./product.json').nameLong")
		code="./.build/electron/$name.app/Contents/MacOS/Electron"
	else
		name=$(node -p "require('./product.json').applicationName")
		code=".build/electron/$name"
	fi

	# Get electron, compile, built-in extensions
	if [[ -z "${VSCODE_SKIP_PRELAUNCH}" ]]; then
		node build/lib/preLaunch.js
	fi

	# Manage built-in extensions
	if [[ "$1" == "--builtin" ]]; then
		exec "$code" build/builtin
		return
	fi

	# Configuration
	export NODE_ENV=development
	export VSCODE_DEV=1
	export VSCODE_CLI=1
	export ELECTRON_ENABLE_STACK_DUMPING=1
	export ELECTRON_ENABLE_LOGGING=1

	# Launch Code
	exec "$code" . "$@"
}

function code-wsl()
{
	host_ip=$(powershell.exe -noprofile -Command "& {(Get-NetIPAddress | Where-Object {\$_.InterfaceAlias -like '*WSL*' -and \$_.AddressFamily -eq 'IPv4'}).IPAddress | Write-Host -NoNewline}" <<<$'\n')
	export DISPLAY="$host_ip:0"

	# in a wsl shell
	electron="$root/.build/electron/Code - OSS.exe"
	if [ -f "$electron"  ]; then
		pushd "$root" || exit
		export WSLENV=ELECTRON_RUN_AS_NODE/w:VSCODE_DEV/w:$WSLENV
		local WSL_EXT_ID="ms-vscode-remote.remote-wsl"
		local WSL_EXT_WLOC
		WSL_EXT_WLOC=$(VSCODE_DEV=1 ELECTRON_RUN_AS_NODE=1 \
			"$root/.build/electron/Code - OSS.exe" "out/cli.js" \
			--ms-enable-electron-run-as-node \
			--locate-extension "$WSL_EXT_ID" <<<$'\n')
		popd
		if [ -n "$WSL_EXT_WLOC" ]; then
			# replace \r\n with \n in WSL_EXT_WLOC
			local WSL_CODE
			WSL_CODE=$(wslpath -u "${WSL_EXT_WLOC%%[[:cntrl:]]}")/scripts/wslCode-dev.sh
			$WSL_CODE "$root" "$@"
			exit $?
		else
			echo "Remote WSL not installed, trying to run VSCode in WSL."
		fi
	fi
}

if [ "$IN_WSL" == "true" ] && [ -z "$DISPLAY" ]; then
	code-wsl "$@"
elif [ -f /mnt/wslg/versions.txt ]; then
	code --disable-gpu "$@"
else
	code "$@"
fi

exit $?
