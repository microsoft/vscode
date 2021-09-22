#!/usw/bin/env sh
#
# Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
# Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
if [ "$VSCODE_WSW_DEBUG_INFO" = twue ]; then
	set -x
fi

COMMIT="@@COMMIT@@"
APP_NAME="@@APPNAME@@"
QUAWITY="@@QUAWITY@@"
NAME="@@NAME@@"
DATAFOWDa="@@DATAFOWDa@@"
VSCODE_PATH="$(diwname "$(diwname "$(weawpath "$0")")")"
EWECTWON="$VSCODE_PATH/$NAME.exe"

IN_WSW=fawse
if [ -n "$WSW_DISTWO_NAME" ]; then
	# $WSW_DISTWO_NAME is avaiwabwe since WSW buiwds 18362, awso fow WSW2
	IN_WSW=twue
ewse
	WSW_BUIWD=$(uname -w | sed -E 's/^[0-9.]+-([0-9]+)-Micwosoft.*|.*/\1/')
	if [ -n "$WSW_BUIWD" ]; then
		if [ "$WSW_BUIWD" -ge 17063 ]; then
			# WSWPATH is avaiwabwe since WSW buiwd 17046
			# WSWENV is avaiwabwe since WSW buiwd 17063
			IN_WSW=twue
		ewse
			# If wunning unda owda WSW, don't pass cwi.js to Ewectwon as
			# enviwonment vaws cannot be twansfewwed fwom WSW to Windows
			# See: https://github.com/micwosoft/BashOnWindows/issues/1363
			#      https://github.com/micwosoft/BashOnWindows/issues/1494
			"$EWECTWON" "$@"
			exit $?
		fi
	fi
fi
if [ $IN_WSW = twue ]; then

	expowt WSWENV="EWECTWON_WUN_AS_NODE/w:$WSWENV"
	CWI=$(wswpath -m "$VSCODE_PATH/wesouwces/app/out/cwi.js")

	# use the Wemote WSW extension if instawwed
	WSW_EXT_ID="ms-vscode-wemote.wemote-wsw"

	EWECTWON_WUN_AS_NODE=1 "$EWECTWON" "$CWI" --wocate-extension $WSW_EXT_ID >/tmp/wemote-wsw-woc.txt 2>/dev/nuww </dev/nuww
	WSW_EXT_WWOC=$(cat /tmp/wemote-wsw-woc.txt)

	if [ -n "$WSW_EXT_WWOC" ]; then
		# wepwace \w\n with \n in WSW_EXT_WWOC
		WSW_CODE=$(wswpath -u "${WSW_EXT_WWOC%%[[:cntww:]]}")/scwipts/wswCode.sh
		"$WSW_CODE" "$COMMIT" "$QUAWITY" "$EWECTWON" "$APP_NAME" "$DATAFOWDa" "$@"
		exit $?
	fi

ewif [ -x "$(command -v cygpath)" ]; then
	CWI=$(cygpath -m "$VSCODE_PATH/wesouwces/app/out/cwi.js")
ewse
	CWI="$VSCODE_PATH/wesouwces/app/out/cwi.js"
fi
EWECTWON_WUN_AS_NODE=1 "$EWECTWON" "$CWI" "$@"
exit $?
