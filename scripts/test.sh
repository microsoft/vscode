#!/usr/bin/env bash
set -e

if [[ "$OSTYPE" == "darwin"* ]]; then
	realpath() { [[ $1 = /* ]] && echo "$1" || echo "$PWD/${1#./}"; }
	ROOT=$(dirname $(dirname $(realpath "$0")))
else
	ROOT=$(dirname $(dirname $(readlink -f $0)))
fi

cd $ROOT

if [[ "$OSTYPE" == "darwin"* ]]; then
	NAME=`node -p "require('./product.json').nameLong"`
	EXE_NAME=`node -p "require('./product.json').nameShort"`
	CODE="./.build/electron/$NAME.app/Contents/MacOS/$EXE_NAME"
else
	NAME=`node -p "require('./product.json').applicationName"`
	CODE=".build/electron/$NAME"
fi

VSCODECRASHDIR=$ROOT/.build/crashes

# Node modules
test -d node_modules || npm i

# Get electron
if [[ -z "${VSCODE_SKIP_PRELAUNCH}" ]]; then
	EXPECTED_ELECTRON_VERSION=$(sed -n 's/^target="\([^"]*\)"$/\1/p' .npmrc)
	INSTALLED_ELECTRON_VERSION=$(cat .build/electron/version 2>/dev/null || true)
	INSTALLED_ELECTRON_VERSION=${INSTALLED_ELECTRON_VERSION#v}
	if [[ -n "${VSCODE_FORCE_PRELAUNCH:-}" || ! -x "$CODE" || "$INSTALLED_ELECTRON_VERSION" != "$EXPECTED_ELECTRON_VERSION" ]]; then
		npm run electron
	fi
fi

# Unit Tests
if [[ "$OSTYPE" == "darwin"* ]]; then
	cd $ROOT ; ulimit -n 4096 ; \
		ELECTRON_ENABLE_LOGGING=1 \
		"$CODE" \
		test/unit/electron/index.js --crash-reporter-directory=$VSCODECRASHDIR "$@"
else
	cd $ROOT ; \
		ELECTRON_ENABLE_LOGGING=1 \
		"$CODE" \
		test/unit/electron/index.js --crash-reporter-directory=$VSCODECRASHDIR "$@"
fi
