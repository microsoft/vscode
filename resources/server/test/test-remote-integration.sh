#!/bin/bash
set -e

if [[ "$OSTYPE" == "darwin"* ]]; then
	realpath() { [[ $1 = /* ]] && echo "$1" || echo "$PWD/${1#./}"; }
	ROOT=$(dirname $(dirname $(dirname $(dirname $(realpath "$0")))))
	VSCODEUSERDATADIR=`mktemp -d -t 'myuserdatadir'`
	TESTRESOLVER_DATA_FOLDER=`mktemp -d -t 'testresolverdatafolder'`
else
	ROOT=$(dirname $(dirname $(dirname $(dirname $(readlink -f $0)))))
	VSCODEUSERDATADIR=`mktemp -d 2>/dev/null`
	TESTRESOLVER_DATA_FOLDER=`mktemp -d 2>/dev/null`
	# --disable-dev-shm-usage --use-gl=swiftshader: when run on docker containers where size of /dev/shm
	# partition < 64MB which causes OOM failure for chromium compositor that uses the partition for shared memory
	LINUX_EXTRA_ARGS="--disable-dev-shm-usage --use-gl=swiftshader"
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

export REMOTE_VSCODE=$AUTHORITY$EXT_PATH
VSCODECRASHDIR=$ROOT/.build/crashes
VSCODELOGSDIR=$ROOT/.build/logs/integration-tests-remote

# Figure out which Electron to use for running tests
if [ -z "$INTEGRATION_TEST_ELECTRON_PATH" ]
then
	echo "Storing crash reports into '$VSCODECRASHDIR'."
	echo "Storing log files into '$VSCODELOGSDIR'."

	# code.sh makes sure Test Extensions are compiled
	INTEGRATION_TEST_ELECTRON_PATH="./scripts/code.sh"

	# No extra arguments when running out of sources
	EXTRA_INTEGRATION_TEST_ARGUMENTS=""
else
	echo "Storing crash reports into '$VSCODECRASHDIR'."
	echo "Storing log files into '$VSCODELOGSDIR'."
	echo "Using $INTEGRATION_TEST_ELECTRON_PATH as Electron path for integration tests"

	# Run from a built: need to compile all test extensions
	# because we run extension tests from their source folders
	# and the build bundles extensions into .build webpacked
	yarn gulp 	compile-extension:vscode-api-tests \
				compile-extension:vscode-test-resolver \
				compile-extension:markdown-language-features \
				compile-extension:typescript-language-features \
				compile-extension:emmet \
				compile-extension:git \
				compile-extension-media

	# Configuration for more verbose output
	export VSCODE_CLI=1
	export ELECTRON_ENABLE_STACK_DUMPING=1
	export ELECTRON_ENABLE_LOGGING=1

	# Running from a build, we need to enable the vscode-test-resolver extension
	EXTRA_INTEGRATION_TEST_ARGUMENTS="--extensions-dir=$EXT_PATH  --enable-proposed-api=vscode.vscode-test-resolver --enable-proposed-api=vscode.vscode-api-tests --enable-proposed-api=vscode.image-preview --enable-proposed-api=vscode.git"
fi

if [ -z "$INTEGRATION_TEST_APP_NAME" ]; then
	after_suite() { true; }
else
	after_suite() { killall $INTEGRATION_TEST_APP_NAME || true; }
fi

export TESTRESOLVER_DATA_FOLDER=$TESTRESOLVER_DATA_FOLDER
export TESTRESOLVER_LOGS_FOLDER=$VSCODELOGSDIR/server

# Figure out which remote server to use for running tests
if [ -z "$VSCODE_REMOTE_SERVER_PATH" ]
then
	echo "Using remote server out of sources for integration tests"
else
	echo "Using $VSCODE_REMOTE_SERVER_PATH as server path for integration tests"
	export TESTRESOLVER_INSTALL_BUILTIN_EXTENSION='ms-vscode.vscode-smoketest-check'
fi

# Tests in the extension host

API_TESTS_DEFAULT_EXTRA_ARGS="--disable-telemetry --skip-welcome --skip-release-notes --crash-reporter-directory=$VSCODECRASHDIR --logsPath=$VSCODELOGSDIR --no-cached-data --disable-updates --disable-keytar --disable-inspect --disable-workspace-trust --user-data-dir=$VSCODEUSERDATADIR"

"$INTEGRATION_TEST_ELECTRON_PATH" $LINUX_EXTRA_ARGS --folder-uri=$REMOTE_VSCODE/vscode-api-tests/testWorkspace --extensionDevelopmentPath=$REMOTE_VSCODE/vscode-api-tests --extensionTestsPath=$REMOTE_VSCODE/vscode-api-tests/out/singlefolder-tests $API_TESTS_DEFAULT_EXTRA_ARGS $EXTRA_INTEGRATION_TEST_ARGUMENTS
after_suite

"$INTEGRATION_TEST_ELECTRON_PATH" $LINUX_EXTRA_ARGS --file-uri=$REMOTE_VSCODE/vscode-api-tests/testworkspace.code-workspace --extensionDevelopmentPath=$REMOTE_VSCODE/vscode-api-tests --extensionTestsPath=$REMOTE_VSCODE/vscode-api-tests/out/workspace-tests $API_TESTS_DEFAULT_EXTRA_ARGS $EXTRA_INTEGRATION_TEST_ARGUMENTS
after_suite

"$INTEGRATION_TEST_ELECTRON_PATH" $LINUX_EXTRA_ARGS --folder-uri=$REMOTE_VSCODE/typescript-language-features/test-workspace --enable-proposed-api=vscode.typescript-language-features --extensionDevelopmentPath=$REMOTE_VSCODE/typescript-language-features --extensionTestsPath=$REMOTE_VSCODE/typescript-language-features/out/test/unit $API_TESTS_DEFAULT_EXTRA_ARGS $EXTRA_INTEGRATION_TEST_ARGUMENTS
after_suite

"$INTEGRATION_TEST_ELECTRON_PATH" $LINUX_EXTRA_ARGS --folder-uri=$REMOTE_VSCODE/markdown-language-features/test-workspace --extensionDevelopmentPath=$REMOTE_VSCODE/markdown-language-features --extensionTestsPath=$REMOTE_VSCODE/markdown-language-features/out/test $API_TESTS_DEFAULT_EXTRA_ARGS $EXTRA_INTEGRATION_TEST_ARGUMENTS
after_suite

"$INTEGRATION_TEST_ELECTRON_PATH" $LINUX_EXTRA_ARGS --folder-uri=$REMOTE_VSCODE/emmet/test-workspace --extensionDevelopmentPath=$REMOTE_VSCODE/emmet --extensionTestsPath=$REMOTE_VSCODE/emmet/out/test $API_TESTS_DEFAULT_EXTRA_ARGS $EXTRA_INTEGRATION_TEST_ARGUMENTS
after_suite

"$INTEGRATION_TEST_ELECTRON_PATH" $LINUX_EXTRA_ARGS --folder-uri=$AUTHORITY$(mktemp -d 2>/dev/null) --extensionDevelopmentPath=$REMOTE_VSCODE/git --extensionTestsPath=$REMOTE_VSCODE/git/out/test $API_TESTS_DEFAULT_EXTRA_ARGS $EXTRA_INTEGRATION_TEST_ARGUMENTS
after_suite

# Clean up
if [[ "$3" == "" ]]; then
	rm -rf $VSCODEUSERDATADIR
fi

rm -rf $TESTRESOLVER_DATA_FOLDER
