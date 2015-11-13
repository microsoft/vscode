#!/bin/bash

if [[ "$OSTYPE" == "darwin"* ]]; then
	realpath() { [[ $1 = /* ]] && echo "$1" || echo "$PWD/${1#./}"; }
	ROOT=$(dirname $(dirname $(realpath "$0")))
else
	ROOT=$(dirname $(dirname $(readlink -f $0)))
fi

# Configuration
export NODE_ENV=development
export VSCODE_DEV=1
export ELECTRON_ENABLE_LOGGING=1
export ELECTRON_ENABLE_STACK_DUMPING=1

# Prepare
cd $ROOT ; node node_modules/gulp/bin/gulp.js electron

if [[ "$OSTYPE" == "darwin"* ]]; then
	cd $ROOT; ../Electron-Build/Electron.app/Contents/MacOS/Electron . $*
else
	cd $ROOT; ../Electron-Build/electron . $*
fi
