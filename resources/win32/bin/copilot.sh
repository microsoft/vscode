#!/usr/bin/env sh
#
# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License. See License.txt in the project root for license information.
#
# vscode-copilot-launcher: the copilot command for POSIX shells that use the Windows PATH. In WSL it runs the Linux
# copilot shim from the VS Code Server in the distribution, like the code command runs the server's code command. In
# Git Bash and Cygwin it runs copilot.exe from this folder. Windows shells run copilot.exe directly.
if [ "$VSCODE_WSL_DEBUG_INFO" = true ]; then
	set -x
fi

COMMIT="@@COMMIT@@"
QUALITY="@@QUALITY@@"
APP_NAME="@@APPNAME@@"
DATAFOLDER="@@DATAFOLDER@@"
SERVERDATAFOLDER="@@SERVERDATAFOLDER@@"
LAUNCHER_DIR="$(dirname "$(realpath "$0")")"

IN_WSL=false
if [ -n "$WSL_DISTRO_NAME" ]; then
	IN_WSL=true
else
	case "$(uname -r 2>/dev/null)" in
		*[Mm]icrosoft*) IN_WSL=true ;;
	esac
fi

if [ "$IN_WSL" != true ]; then
	exec "$LAUNCHER_DIR/copilot.exe" "$@"
fi

case "$QUALITY" in
	insider) SERVER_QUALITY=Insiders ;;
	exploration) SERVER_QUALITY=Exploration ;;
	*) SERVER_QUALITY=Stable ;;
esac

is_shim() {
	[ -f "$1" ] && [ -x "$1" ]
}

# Prints the copilot shim of the VS Code Server for this commit, in the layout of Remote - WSL, of Remote - SSH, or of
# the standalone code CLI (code tunnel), or else the most recently built one of any installed server, because any
# version of the shim works the same way.
find_shim() {
	cli_data="${VSCODE_CLI_DATA_DIR:-${HOME:+$HOME/$DATAFOLDER/cli}}"
	for candidate in \
		"${VSCODE_AGENT_FOLDER:+$VSCODE_AGENT_FOLDER/bin/$COMMIT/bin/copilot-shim/copilot}" \
		"${VSCODE_AGENT_FOLDER:+$VSCODE_AGENT_FOLDER/cli/servers/$SERVER_QUALITY-$COMMIT/server/bin/copilot-shim/copilot}" \
		"${HOME:+$HOME/$SERVERDATAFOLDER/bin/$COMMIT/bin/copilot-shim/copilot}" \
		"${HOME:+$HOME/$SERVERDATAFOLDER/cli/servers/$SERVER_QUALITY-$COMMIT/server/bin/copilot-shim/copilot}" \
		"${cli_data:+$cli_data/servers/$SERVER_QUALITY-$COMMIT/server/bin/copilot-shim/copilot}"; do
		if [ -n "$candidate" ] && is_shim "$candidate"; then
			printf '%s\n' "$candidate"
			return
		fi
	done

	ls -1t -- \
		"${VSCODE_AGENT_FOLDER:-/nonexistent}"/bin/*/bin/copilot-shim/copilot \
		"${VSCODE_AGENT_FOLDER:-/nonexistent}"/cli/servers/*/server/bin/copilot-shim/copilot \
		"${VSCODE_CLI_DATA_DIR:-/nonexistent}"/servers/*/server/bin/copilot-shim/copilot \
		"${HOME:-/nonexistent}"/.vscode-server*/bin/*/bin/copilot-shim/copilot \
		"${HOME:-/nonexistent}"/.vscode*/cli/servers/*/server/bin/copilot-shim/copilot \
		2>/dev/null | while IFS= read -r candidate; do
		if is_shim "$candidate"; then
			printf '%s\n' "$candidate"
			break
		fi
	done
}

# Prints PATH without the folders of VS Code copilot launchers, so that the shim's search for GitHub Copilot CLI finds
# neither this script nor the launcher of another VS Code quality. Only the start of each copilot is read, where the
# launcher's marker is, so a GitHub Copilot CLI executable on PATH isn't read in full on every run.
path_without_launchers() {
	remaining="$PATH:"
	result=
	separator=
	while [ -n "$remaining" ]; do
		entry="${remaining%%:*}"
		remaining="${remaining#*:}"
		if [ -f "${entry:-.}/copilot" ] && head -c 512 "${entry:-.}/copilot" 2>/dev/null | grep -q 'vscode-copilot-launcher'; then
			continue
		fi
		result="$result$separator$entry"
		separator=:
	done
	printf '%s\n' "$result"
}

SHIM="$(find_shim)"
if [ -n "$SHIM" ]; then
	PATH="$(path_without_launchers)"
	export PATH
	exec "$SHIM" "$@"
fi

echo "The copilot command runs GitHub Copilot CLI through the VS Code Server, which isn't installed in this WSL distribution yet." >&2
echo "Run '$APP_NAME .' to open a folder from WSL in VS Code, which installs it, and then run copilot again." >&2
echo "To install GitHub Copilot CLI yourself, see https://docs.github.com/copilot/how-tos/copilot-cli/set-up-copilot-cli/install-copilot-cli" >&2
exit 127
