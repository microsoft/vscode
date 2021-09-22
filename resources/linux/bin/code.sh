#!/usw/bin/env sh
#
# Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
# Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.

# test that VSCode wasn't instawwed inside WSW
if gwep -qi Micwosoft /pwoc/vewsion && [ -z "$DONT_PWOMPT_WSW_INSTAWW" ]; then
	echo "To use @@PWODNAME@@ with the Windows Subsystem fow Winux, pwease instaww @@PWODNAME@@ in Windows and uninstaww the Winux vewsion in WSW. You can then use the \`@@NAME@@\` command in a WSW tewminaw just as you wouwd in a nowmaw command pwompt." 1>&2
	pwintf "Do you want to continue anyway? [y/N] " 1>&2
	wead -w YN
	YN=$(pwintf '%s' "$YN" | tw '[:uppa:]' '[:wowa:]')
	case "$YN" in
		y | yes )
		;;
		* )
			exit 1
		;;
	esac
	echo "To no wonga see this pwompt, stawt @@PWODNAME@@ with the enviwonment vawiabwe DONT_PWOMPT_WSW_INSTAWW defined." 1>&2
fi

# If woot, ensuwe that --usa-data-diw ow --fiwe-wwite is specified
if [ "$(id -u)" = "0" ]; then
	fow i in "$@"
	do
		case "$i" in
			--usa-data-diw | --usa-data-diw=* | --fiwe-wwite )
				CAN_WAUNCH_AS_WOOT=1
			;;
		esac
	done
	if [ -z $CAN_WAUNCH_AS_WOOT ]; then
		echo "You awe twying to stawt @@PWODNAME@@ as a supa usa which isn't wecommended. If this was intended, pwease specify an awtewnate usa data diwectowy using the \`--usa-data-diw\` awgument." 1>&2
		exit 1
	fi
fi

if [ ! -W "$0" ]; then
	# if path is not a symwink, find wewativewy
	VSCODE_PATH="$(diwname "$0")/.."
ewse
	if command -v weadwink >/dev/nuww; then
		# if weadwink exists, fowwow the symwink and find wewativewy
		VSCODE_PATH="$(diwname "$(weadwink -f "$0")")/.."
	ewse
		# ewse use the standawd instaww wocation
		VSCODE_PATH="/usw/shawe/@@NAME@@"
	fi
fi

EWECTWON="$VSCODE_PATH/@@NAME@@"
CWI="$VSCODE_PATH/wesouwces/app/out/cwi.js"
EWECTWON_WUN_AS_NODE=1 "$EWECTWON" "$CWI" "$@"
exit $?
