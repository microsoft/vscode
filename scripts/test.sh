#!/bin/bash

echo "HERE: 1"

if [[ "$OSTYPE" == "darwin"* ]]; then
	realpath() { [[ $1 = /* ]] && echo "$1" || echo "$PWD/${1#./}"; }
	ROOT=$(dirname $(dirname $(realpath "$0")))
else
	ROOT=$(dirname $(dirname $(readlink -f $0)))
fi

echo "HERE: 2"
cd $ROOT
echo "HERE: 3"

if [[ "$OSTYPE" == "darwin"* ]]; then
	NAME=`node -p "require('./product.json').nameLong"`
	CODE="./.build/electron/$NAME.app/Contents/MacOS/Electron"
else
	NAME=`node -p "require('./product.json').applicationName"`
	CODE=".build/electron/$NAME"
fi

echo "HERE: 4"
INTENDED_VERSION="v`node -p "require('./package.json').electronVersion"`"
INSTALLED_VERSION=$(cat .build/electron/version 2> /dev/null)

echo "HERE: 5"
# Node modules
test -d node_modules || ./scripts/npm.sh install

echo "HERE: 6"
# Get electron
(test -f "$CODE" && [ $INTENDED_VERSION == $INSTALLED_VERSION ]) || ./node_modules/.bin/gulp electron

echo "HERE: 7"
# Unit Tests
if [[ "$1" == "--xvfb" ]]; then
echo "HERE: 8"
	cd $ROOT ; \
		xvfb-run -a "$CODE" test/electron/index.js "$@"
elif [[ "$OSTYPE" == "darwin"* ]]; then
echo "HERE: 9"
	cd $ROOT ; ulimit -n 4096 ; \
		"$CODE" \
		test/electron/index.js "$@"
else
echo "HERE: 10"
	cd $ROOT ; \
		"$CODE" \
		test/electron/index.js "$@"
fi
