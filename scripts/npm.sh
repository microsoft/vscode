#!/bin/bash

if [[ "$OSTYPE" == "darwin"* ]]; then
	realpath() { [[ $1 = /* ]] && echo "$1" || echo "$PWD/${1#./}"; }
	ROOT=$(dirname "$(dirname "$(realpath "$0")")")
	npm_config_arch=x64
else
	ROOT=$(dirname "$(dirname "$(readlink -f $0)")")

	# if [ -z $npm_config_arch ]; then
	# 	npm_config_arch=$(node -p process.arch)
	# 	echo "Warning: remember to set \$npm_config_arch to either x64 or ia32 to build the binaries for the right architecture. Picking '$npm_config_arch'."
	# fi
fi

ELECTRON_VERSION=$(
	cat "$ROOT"/package.json |
	grep electronVersion |
	sed -e 's/[[:space:]]*"electronVersion":[[:space:]]*"\([0-9.]*\)"\(,\)*/\1/'
)

ELECTRON_GYP_HOME=~/.electron-gyp
mkdir -p $ELECTRON_GYP_HOME

npm_config_disturl=https://atom.io/download/electron \
npm_config_target=$ELECTRON_VERSION \
npm_config_runtime=electron \
HOME=$ELECTRON_GYP_HOME \
npm $*