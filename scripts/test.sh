#!/usr/bin/env bash
set -e

if [[ "$OSTYPE" == "darwin"* ]]; then
	realpath() { [[ $1 = /* ]] && echo "$1" || echo "$PWD/${1#./}"; }
	ROOT=$(dirname $(dirname $(realpath "$0")))
else
	ROOT=$(dirname $(dirname $(readlink -f $0)))
	# --disable-dev-shm-usage: when run on docker containers where size of /dev/shm
	# partition < 64MB which causes OOM failure for chromium compositor that uses the partition for shared memory
	LINUX_EXTRA_ARGS="--disable-dev-shm-usage"
fi

cd $ROOT

if [[ "$OSTYPE" == "darwin"* ]]; then
	NAME=`node -p "require('./product.json').nameLong"`
	CODE="./.build/electron/$NAME.app/Contents/MacOS/Electron"
else
	NAME=`node -p "require('./product.json').applicationName"`
	CODE=".build/electron/$NAME"
fi

VSCODECRASHDIR=$ROOT/.build/crashes

# Node modules
test -d node_modules || yarn

# Get electron
yarn electron

# Unit Tests
echo
echo "### Electron Unit Tests"
echo
if [[ "$OSTYPE" == "darwin"* ]]; then
	cd $ROOT ; ulimit -n 4096 ; \
		ELECTRON_ENABLE_LOGGING=1 \
		"$CODE" \
		test/unit/electron/index.js --crash-reporter-directory=$VSCODECRASHDIR "$@"
else
	cd $ROOT ; \
		ELECTRON_ENABLE_LOGGING=1 \
		"$CODE" \
		test/unit/electron/index.js --crash-reporter-directory=$VSCODECRASHDIR $LINUX_EXTRA_ARGS "$@"
fi


echo
echo "### Node.js Unit Tests"
echo
if [[ "$OSTYPE" == "darwin"* ]]; then
	cd $ROOT ; ulimit -n 4096 ; \
		ELECTRON_RUN_AS_NODE="1" \
		"$CODE" \
		node_modules/.bin/mocha test/unit/node/index.mjs --delay --ui=tdd --timeout=5000 --exit --runGlob **/node/**/*.test.js "$@"
else
	cd $ROOT ; \
		ELECTRON_RUN_AS_NODE="1" \
		"$CODE" \
		node_modules/.bin/mocha test/unit/node/index.mjs --delay --ui=tdd --timeout=5000 --exit --runGlob **/node/**/*.test.js $LINUX_EXTRA_ARGS "$@"
fi
