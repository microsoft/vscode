#!/usr/bin/env bash

if [[ "$OSTYPE" == "darwin"* ]]; then
	realpath() { [[ $1 = /* ]] && echo "$1" || echo "$PWD/${1#./}"; }
	ROOT=$(dirname $(dirname $(dirname $(realpath "$0"))))
else
	ROOT=$(dirname $(dirname $(dirname $(readlink -f $0))))
fi

SERVER_SCRIPT="$ROOT/out/server.js"
exec /usr/bin/env node "$SERVER_SCRIPT" "$@"
