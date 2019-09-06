#!/bin/bash
set -e

if [[ "$OSTYPE" == "darwin"* ]]; then
	realpath() { [[ $1 = /* ]] && echo "$1" || echo "$PWD/${1#./}"; }
	ROOT=$(dirname $(dirname $(realpath "$0")))
	VSCODEUSERDATADIR=`mktemp -d -t 'myuserdatadir'`
else
	ROOT=$(dirname $(dirname $(readlink -f $0)))
	VSCODEUSERDATADIR=`mktemp -d 2>/dev/null`
fi

cd $ROOT

echo "Runs tests against the current documentation in https://github.com/microsoft/vscode-docs/tree/vnext"

# Tests in AMD
./scripts/test.sh --runGlob **/*.releaseTest.js "$@"


rm -r $VSCODEUSERDATADIR
