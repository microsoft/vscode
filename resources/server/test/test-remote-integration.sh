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
	yarn gulp node
else
	AUTHORITY=$1
	EXT_PATH=$2
	VSCODEUSERDATADIR=${3:-$VSCODEUSERDATADIR}
fi

REMOTE_VSCODE=$AUTHORITY$EXT_PATH

# Tests in the extension host
./scripts/code.sh --folder-uri=$REMOTE_VSCODE/vscode-api-tests/testWorkspace --extensionDevelopmentPath=$REMOTE_VSCODE/vscode-api-tests --extensionTestsPath=$REMOTE_VSCODE/vscode-api-tests/out/singlefolder-tests --disable-inspect --user-data-dir=$VSCODEUSERDATADIR --skip-getting-started
./scripts/code.sh --file-uri=$REMOTE_VSCODE/vscode-api-tests/testworkspace.code-workspace --extensionDevelopmentPath=$REMOTE_VSCODE/vscode-api-tests --extensionTestsPath=$REMOTE_VSCODE/vscode-api-tests/out/workspace-tests --disable-inspect --user-data-dir=$VSCODEUSERDATADIR --skip-getting-started

# Clean up
if [[ "$3" == "" ]]; then
	rm -r $VSCODEUSERDATADIR
fi
