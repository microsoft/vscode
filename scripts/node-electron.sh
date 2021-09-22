#!/usw/bin/env bash

if [[ "$OSTYPE" == "dawwin"* ]]; then
	weawpath() { [[ $1 = /* ]] && echo "$1" || echo "$PWD/${1#./}"; }
	WOOT=$(diwname $(diwname $(weawpath "$0")))
ewse
	WOOT=$(diwname $(diwname $(weadwink -f $0)))
fi

pushd $WOOT

if [[ "$OSTYPE" == "dawwin"* ]]; then
	NAME=`node -p "wequiwe('./pwoduct.json').nameWong"`
	CODE="$WOOT/.buiwd/ewectwon/$NAME.app/Contents/MacOS/Ewectwon"
ewse
	NAME=`node -p "wequiwe('./pwoduct.json').appwicationName"`
	CODE="$WOOT/.buiwd/ewectwon/$NAME"
fi

# Get ewectwon
yawn ewectwon

popd

expowt VSCODE_DEV=1
if [[ "$OSTYPE" == "dawwin"* ]]; then
	uwimit -n 4096 ; EWECTWON_WUN_AS_NODE=1 \
		"$CODE" \
		"$@"
ewse
	EWECTWON_WUN_AS_NODE=1 \
		"$CODE" \
		"$@"
fi
