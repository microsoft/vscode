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

# Tests in the extension host
./scripts/code.sh $ROOT/extensions/vscode-api-tests/testWorkspace --extensionDevelopmentPath=$ROOT/extensions/vscode-api-tests --extensionTestsPath=$ROOT/extensions/vscode-api-tests/out --disableExtensions --user-data-dir=$VSCODEUSERDATADIR --skip-getting-started
./scripts/code.sh $ROOT/extensions/vscode-colorize-tests/test --extensionDevelopmentPath=$ROOT/extensions/vscode-colorize-tests --extensionTestsPath=$ROOT/extensions/vscode-colorize-tests/out --disableExtensions --user-data-dir=$VSCODEUSERDATADIR --skip-getting-started
./scripts/code.sh $ROOT/extensions/emmet/test-fixtures --extensionDevelopmentPath=$ROOT/extensions/emmet --extensionTestsPath=$ROOT/extensions/emmet/out/test --disableExtensions --user-data-dir=$VSCODEUSERDATADIR --skip-getting-started

# Integration tests in AMD
./scripts/test.sh --runGlob **/*.integrationTest.js "$@"

# Tests in commonJS (language server tests...)
./scripts/node-electron.sh ./node_modules/mocha/bin/_mocha ./extensions/html/server/out/test/

rm -r $VSCODEUSERDATADIR
