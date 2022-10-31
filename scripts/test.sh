#!/usr/bin/env bash
set -e

if [[ "$OSTYPE" == "darwin"* ]]; then
	realpath() { [[ "$1" = /* ]] && echo "$1" || echo "$PWD/${1#./}"; }
	root=$(dirname "$(dirname "$(realpath "$0")")")
else
	root=$(dirname "$(dirname "$(readlink -f "$0")")")
	# --disable-dev-shm-usage: when run on docker containers where size of /dev/shm
	# partition < 64MB which causes OOM failure for chromium compositor that uses the partition for shared memory
	linux_extra_args="--disable-dev-shm-usage"
fi

cd "$root" || exit

if [[ "$OSTYPE" == "darwin"* ]]; then
	name=$(node -p "require('./product.json').nameLong")
	code="./.build/electron/$name.app/Contents/MacOS/Electron"
else
	name=$(node -p "require('./product.json').applicationName")
	code=".build/electron/$name"
fi

vscodecrashdir="$root"/.build/crashes

# Node modules
test -d node_modules || yarn

# Get electron
yarn electron

# Unit Tests
if [[ "$OSTYPE" == "darwin"* ]]; then
	cd "$root" ; ulimit -n 4096 ; \
		ELECTRON_ENABLE_LOGGING=1 \
		"$code" \
		test/unit/electron/index.js \
                --crash-reporter-directory="$vscodecrashdir" \
                "$@"
else
	cd "$root" ; \
		ELECTRON_ENABLE_LOGGING=1 \
		"$code" \
		test/unit/electron/index.js \
                --crash-reporter-directory="$vscodecrashdir" \
                $linux_extra_args "$@"
fi
