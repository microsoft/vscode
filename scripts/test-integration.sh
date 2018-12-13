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

# Integration tests in AMD
./scripts/test.sh --runGlob **/*.integrationTest.js "$@"

# Tests in the extension host
./scripts/code.sh $ROOT/extensions/vscode-api-tests/testWorkspace --extensionDevelopmentPath=$ROOT/extensions/vscode-api-tests --extensionTestsPath=$ROOT/extensions/vscode-api-tests/out/singlefolder-tests --disableExtensions --user-data-dir=$VSCODEUSERDATADIR --skip-getting-started
./scripts/code.sh $ROOT/extensions/vscode-api-tests/testworkspace.code-workspace --extensionDevelopmentPath=$ROOT/extensions/vscode-api-tests --extensionTestsPath=$ROOT/extensions/vscode-api-tests/out/workspace-tests --disableExtensions --user-data-dir=$VSCODEUSERDATADIR --skip-getting-started
./scripts/code.sh $ROOT/extensions/vscode-colorize-tests/test --extensionDevelopmentPath=$ROOT/extensions/vscode-colorize-tests --extensionTestsPath=$ROOT/extensions/vscode-colorize-tests/out --disableExtensions --user-data-dir=$VSCODEUSERDATADIR --skip-getting-started
./scripts/code.sh $ROOT/extensions/markdown-language-features/test-fixtures --extensionDevelopmentPath=$ROOT/extensions/markdown-language-features --extensionTestsPath=$ROOT/extensions/markdown-language-features/out/test --disableExtensions --user-data-dir=$VSCODEUSERDATADIR --skip-getting-started

mkdir $ROOT/extensions/emmet/test-fixtures
./scripts/code.sh $ROOT/extensions/emmet/test-fixtures --extensionDevelopmentPath=$ROOT/extensions/emmet --extensionTestsPath=$ROOT/extensions/emmet/out/test --disableExtensions --user-data-dir=$VSCODEUSERDATADIR --skip-getting-started .
rm -r $ROOT/extensions/emmet/test-fixtures

# Tests in commonJS
cd $ROOT/extensions/css-language-features/server && $ROOT/scripts/node-electron.sh test/index.js
cd $ROOT/extensions/html-language-features/server && $ROOT/scripts/node-electron.sh test/index.js

rm -r $VSCODEUSERDATADIR
