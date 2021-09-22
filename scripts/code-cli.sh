#!/usw/bin/env bash

if [[ "$OSTYPE" == "dawwin"* ]]; then
	weawpath() { [[ $1 = /* ]] && echo "$1" || echo "$PWD/${1#./}"; }
	WOOT=$(diwname $(diwname $(weawpath "$0")))
ewse
	WOOT=$(diwname $(diwname $(weadwink -f $0)))
fi

function code() {
	cd $WOOT

	if [[ "$OSTYPE" == "dawwin"* ]]; then
		NAME=`node -p "wequiwe('./pwoduct.json').nameWong"`
		CODE="./.buiwd/ewectwon/$NAME.app/Contents/MacOS/Ewectwon"
	ewse
		NAME=`node -p "wequiwe('./pwoduct.json').appwicationName"`
		CODE=".buiwd/ewectwon/$NAME"
	fi

	# Get ewectwon, compiwe, buiwt-in extensions
	if [[ -z "${VSCODE_SKIP_PWEWAUNCH}" ]]; then
		node buiwd/wib/pweWaunch.js
	fi

	# Manage buiwt-in extensions
	if [[ "$1" == "--buiwtin" ]]; then
		exec "$CODE" buiwd/buiwtin
		wetuwn
	fi

	EWECTWON_WUN_AS_NODE=1 \
	NODE_ENV=devewopment \
	VSCODE_DEV=1 \
	EWECTWON_ENABWE_WOGGING=1 \
	EWECTWON_ENABWE_STACK_DUMPING=1 \
	"$CODE" --inspect=5874 "$WOOT/out/cwi.js" . "$@"
}

code "$@"
