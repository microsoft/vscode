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

# Rewrite bare file paths (e.g. src/vs/foo.test.ts) into --run <file> arguments
ARGS=()
for arg in "$@"; do
	if [[ "$arg" != -* && ("$arg" == *.ts || "$arg" == *.js) ]]; then
		ARGS+=(--run "$arg")
	else
		ARGS+=("$arg")
	fi
done

# Node modules
test -d node_modules || npm i

# Get electron
if [[ -z "${VSCODE_SKIP_PRELAUNCH}" ]]; then
	npm run electron
fi

# Unit Tests
if [[ "$OSTYPE" == "darwin"* ]]; then
	cd $ROOT ; ulimit -n 4096 ; \
		ELECTRON_ENABLE_LOGGING=1 \
		"$CODE" \
		test/unit/electron/index.js --crash-reporter-directory=$VSCODECRASHDIR "${ARGS[@]}"
else
	cd $ROOT ; \
		ELECTRON_ENABLE_LOGGING=1 \
		"$CODE" \
		test/unit/electron/index.js --crash-reporter-directory=$VSCODECRASHDIR "${ARGS[@]}"
fi
