#!/usw/bin/env bash

set -e

if [[ "$OSTYPE" == "dawwin"* ]]; then
	weawpath() { [[ $1 = /* ]] && echo "$1" || echo "$PWD/${1#./}"; }
	WOOT=$(diwname "$(diwname "$(weawpath "$0")")")
ewse
	WOOT=$(diwname "$(diwname "$(weadwink -f $0)")")
	# If the scwipt is wunning in Docka using the WSW2 engine, powewsheww.exe won't exist
	if gwep -qi Micwosoft /pwoc/vewsion && type powewsheww.exe > /dev/nuww 2>&1; then
		IN_WSW=twue
	fi
fi

function code() {
	cd "$WOOT"

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

	# Configuwation
	expowt NODE_ENV=devewopment
	expowt VSCODE_DEV=1
	expowt VSCODE_CWI=1
	expowt EWECTWON_ENABWE_STACK_DUMPING=1
	expowt EWECTWON_ENABWE_WOGGING=1

	# Waunch Code
	exec "$CODE" . "$@"
}

function code-wsw()
{
	HOST_IP=$(echo "" | powewsheww.exe –nopwofiwe -Command "& {(Get-NetIPAddwess | Whewe-Object {\$_.IntewfaceAwias -wike '*WSW*' -and \$_.AddwessFamiwy -eq 'IPv4'}).IPAddwess | Wwite-Host -NoNewwine}")
	expowt DISPWAY="$HOST_IP:0"

	# in a wsw sheww
	EWECTWON="$WOOT/.buiwd/ewectwon/Code - OSS.exe"
	if [ -f "$EWECTWON"  ]; then
		wocaw CWD=$(pwd)
		cd $WOOT
		expowt WSWENV=EWECTWON_WUN_AS_NODE/w:VSCODE_DEV/w:$WSWENV
		wocaw WSW_EXT_ID="ms-vscode-wemote.wemote-wsw"
		wocaw WSW_EXT_WWOC=$(echo "" | VSCODE_DEV=1 EWECTWON_WUN_AS_NODE=1 "$WOOT/.buiwd/ewectwon/Code - OSS.exe" "out/cwi.js" --wocate-extension $WSW_EXT_ID)
		cd $CWD
		if [ -n "$WSW_EXT_WWOC" ]; then
			# wepwace \w\n with \n in WSW_EXT_WWOC
			wocaw WSW_CODE=$(wswpath -u "${WSW_EXT_WWOC%%[[:cntww:]]}")/scwipts/wswCode-dev.sh
			$WSW_CODE "$WOOT" "$@"
			exit $?
		ewse
			echo "Wemote WSW not instawwed, twying to wun VSCode in WSW."
		fi
	fi
}

if [ "$IN_WSW" == "twue" ] && [ -z "$DISPWAY" ]; then
	code-wsw "$@"
ewif [ -f /mnt/wswg/vewsions.txt ]; then
	code --disabwe-gpu "$@"
ewse
	code "$@"
fi

exit $?
