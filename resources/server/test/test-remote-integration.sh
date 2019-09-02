#!/bin/bash
set -ex

if [[ "$OSTYPE" == "darwin"* ]]; then
	realpath() { [[ $1 = /* ]] && echo "$1" || echo "$PWD/${1#./}"; }
	ROOT=$(dirname $(dirname $(dirname $(dirname $(realpath "$0")))))
	VSCODEUSERDATADIR=`mktemp -d -t 'myuserdatadir'`
else
	ROOT=$(dirname $(dirname $(dirname $(dirname $(readlink -f $0)))))
	VSCODEUSERDATADIR=`mktemp -d 2>/dev/null`
	LINUX_NO_SANDBOX="--no-sandbox" # TODO@deepak workaround Electron 6 issue on Linux when running tests in container
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

# Figure out which Electron to use for running tests
if [ -z "$INTEGRATION_TEST_ELECTRON_PATH" ]
then
	# code.sh makes sure Test Extensions are compiled
	INTEGRATION_TEST_ELECTRON_PATH="./scripts/code.sh"

	# No extra arguments when running out of sources
	EXTRA_INTEGRATION_TEST_ARGUMENTS=""
else
	echo "Using $INTEGRATION_TEST_ELECTRON_PATH as Electron path"

	# Compile Test Extensions
	yarn gulp compile-extension:vscode-test-resolver

	# Running from a build, we need to enable the vscode-test-resolver extension
	EXTRA_INTEGRATION_TEST_ARGUMENTS="--extensions-dir=$EXT_PATH --enable-proposed-api=vscode.vscode-test-resolver"
fi

# Tests in the extension host
# "$INTEGRATION_TEST_ELECTRON_PATH" $LINUX_NO_SANDBOX --folder-uri=$REMOTE_VSCODE/vscode-api-tests/testWorkspace --extensionDevelopmentPath=$REMOTE_VSCODE/vscode-api-tests --extensionTestsPath=$REMOTE_VSCODE/vscode-api-tests/out/singlefolder-tests --disable-telemetry --disable-crash-reporter --disable-updates --skip-getting-started --disable-inspect --user-data-dir=$VSCODEUSERDATADIR $EXTRA_INTEGRATION_TEST_ARGUMENTS
# "$INTEGRATION_TEST_ELECTRON_PATH" $LINUX_NO_SANDBOX --file-uri=$REMOTE_VSCODE/vscode-api-tests/testworkspace.code-workspace --extensionDevelopmentPath=$REMOTE_VSCODE/vscode-api-tests --extensionTestsPath=$REMOTE_VSCODE/vscode-api-tests/out/workspace-tests --disable-telemetry --disable-crash-reporter --disable-updates --skip-getting-started --disable-inspect --user-data-dir=$VSCODEUSERDATADIR $EXTRA_INTEGRATION_TEST_ARGUMENTS

# TODO https://github.com/microsoft/vscode/issues/79459
./scripts/code.sh $LINUX_NO_SANDBOX --folder-uri=$REMOTE_VSCODE/vscode-api-tests/testWorkspace --extensionDevelopmentPath=$REMOTE_VSCODE/vscode-api-tests --extensionTestsPath=$REMOTE_VSCODE/vscode-api-tests/out/singlefolder-tests --disable-inspect --user-data-dir=$VSCODEUSERDATADIR --skip-getting-started
./scripts/code.sh $LINUX_NO_SANDBOX --file-uri=$REMOTE_VSCODE/vscode-api-tests/testworkspace.code-workspace --extensionDevelopmentPath=$REMOTE_VSCODE/vscode-api-tests --extensionTestsPath=$REMOTE_VSCODE/vscode-api-tests/out/workspace-tests --disable-inspect --user-data-dir=$VSCODEUSERDATADIR --skip-getting-started

# Clean up
if [[ "$3" == "" ]]; then
	rm -r $VSCODEUSERDATADIR
fi
