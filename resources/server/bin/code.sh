#!/usr/bin/env bash

if [[ "$OSTYPE" == "darwin"* ]]; then
	realpath() { [[ $1 = /* ]] && echo "$1" || echo "$PWD/${1#./}"; }
	ROOT=$(dirname "$(realpath "$0")")
else
	ROOT=$(dirname "$(readlink -f $0)")
fi

exec $ROOT/../node $ROOT/../out/server-cli.js "$@"
