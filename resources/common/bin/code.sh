#!/usr/bin/env bash
VSCODE_CWD=$(pwd)

while getopts ":hv-:" opt; do
	case $opt in
		-)
			case $OPTARG in
				help|version)
					ENABLE_OUTPUT=1
					;;
			esac
			;;
		h|v)
			ENABLE_OUTPUT=1
			;;
	esac
done

if [[ "$OSTYPE" == "darwin"* ]]; then
	if [ $ENABLE_OUTPUT ]; then
		if [ -x "/Applications/Visual Studio Code.app" ]; then
			VSCODE_PATH="/Applications/Visual Studio Code.app"
		elif [ -x "$HOME/Applications/Visual Studio Code.app" ]; then
			VSCODE_PATH="$HOME/Applications/Visual Studio Code.app"
		else
			echo "Could not locate Visual Studio Code.app"
			exit 1
		fi
		"$VSCODE_PATH/Contents/MacOS/Electron" "$@"
	else
		open -n -b "com.microsoft.VSCode" --args $*
	fi
else
	VSCODE_PATH="/usr/share/code/Code"
	if [ -x $VSCODE_PATH ]; then
		if [ $ENABLE_OUTPUT ]; then
			"$VSCODE_PATH" "$@"
			exit $?
		else
			nohup $VSCODE_PATH "$@" > ~/.vscode/nohup.out 2>&1 &
		fi
	else
		echo "Could not locate Visual Studio Code executable."
		exit 1
	fi
fi
