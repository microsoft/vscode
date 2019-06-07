#!/bin/bash
set -ex

if [[ "$OSTYPE" == "darwin"* ]]; then
	realpath() { [[ $1 = /* ]] && echo "$1" || echo "$PWD/${1#./}"; }
	ROOT=$(dirname $(dirname $(dirname $(dirname $(realpath "$0")))))
	VSCODEUSERDATADIR=`mktemp -d -t 'myuserdatadir'`
else
	ROOT=$(dirname $(dirname $(dirname $(dirname $(readlink -f $0)))))
	VSCODEUSERDATADIR=`mktemp -d 2>/dev/null`
fi

cd $ROOT
if [[ "$1" == "" ]]; then
	AUTHORITY=vscode-remote://test+test
	EXT_PATH=$ROOT/extensions
	# Load remote node
	./node_modules/.bin/gulp node-remote
else
	AUTHORITY=$1
	EXT_PATH=$2
	VSCODEUSERDATADIR=${3:-$VSCODEUSERDATADIR}
fi

REMOTE_VSCODE=$AUTHORITY$EXT_PATH

# Tests in the extension host
./scripts/code.sh --folder-uri=$REMOTE_VSCODE/vscode-api-tests/testWorkspace --extensionDevelopmentPath=$REMOTE_VSCODE/vscode-api-tests --extensionTestsPath=$REMOTE_VSCODE/vscode-api-tests/out/singlefolder-tests --user-data-dir=$VSCODEUSERDATADIR --skip-getting-started
./scripts/code.sh --file-uri=$REMOTE_VSCODE/vscode-api-tests/testworkspace.code-workspace --extensionDevelopmentPath=$REMOTE_VSCODE/vscode-api-tests --extensionTestsPath=$REMOTE_VSCODE/vscode-api-tests/out/workspace-tests --user-data-dir=$VSCODEUSERDATADIR --skip-getting-started
./scripts/code.sh --folder-uri=$REMOTE_VSCODE/vscode-colorize-tests --extensionDevelopmentPath=$REMOTE_VSCODE/vscode-colorize-tests --extensionTestsPath=$REMOTE_VSCODE/vscode-colorize-tests/out --user-data-dir=$VSCODEUSERDATADIR --skip-getting-started
./scripts/code.sh --folder-uri=$REMOTE_VSCODE/markdown-language-features/test-fixtures --extensionDevelopmentPath=$REMOTE_VSCODE/markdown-language-features --extensionTestsPath=$REMOTE_VSCODE/markdown-language-features/out/test --user-data-dir=$VSCODEUSERDATADIR --skip-getting-started

if [[ "$1" == "" ]]; then mkdir -p $EXT_PATH/emmet/test-fixtures; fi
./scripts/code.sh --folder-uri=$REMOTE_VSCODE/emmet/test-fixtures --extensionDevelopmentPath=$REMOTE_VSCODE/emmet --extensionTestsPath=$REMOTE_VSCODE/emmet/out/test --user-data-dir=$VSCODEUSERDATADIR --skip-getting-started
if [[ "$1" == "" ]]; then rm -rf $EXT_PATH/emmet/test-fixtures; fi

# Clean up
if [[ "$3" == "" ]]; then
	rm -r $VSCODEUSERDATADIR
fi
