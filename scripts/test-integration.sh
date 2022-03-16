#!/usr/bin/env bash
set -e

if [[ "$OSTYPE" == "darwin"* ]]; then
	realpath() { [[ $1 = /* ]] && echo "$1" || echo "$PWD/${1#./}"; }
	ROOT=$(dirname $(dirname $(realpath "$0")))
else
	ROOT=$(dirname $(dirname $(readlink -f $0)))
	# --disable-dev-shm-usage: when run on docker containers where size of /dev/shm
	# partition < 64MB which causes OOM failure for chromium compositor that uses the partition for shared memory
	LINUX_EXTRA_ARGS="--disable-dev-shm-usage"
fi

VSCODEUSERDATADIR=`mktemp -d 2>/dev/null`
VSCODECRASHDIR=$ROOT/.build/crashes
VSCODELOGSDIR=$ROOT/.build/logs/integration-tests

cd $ROOT

# Figure out which Electron to use for running tests
if [ -z "$INTEGRATION_TEST_ELECTRON_PATH" ]
then
	# Run out of sources: no need to compile as code.sh takes care of it
	INTEGRATION_TEST_ELECTRON_PATH="./scripts/code.sh"

	echo "Storing crash reports into '$VSCODECRASHDIR'."
	echo "Storing log files into '$VSCODELOGSDIR'."
	echo "Running integration tests out of sources."
else
	# Run from a built: need to compile all test extensions
	# because we run extension tests from their source folders
	# and the build bundles extensions into .build webpacked
	yarn gulp 	compile-extension:vscode-api-tests \
				compile-extension:vscode-colorize-tests \
				compile-extension:vscode-custom-editor-tests \
				compile-extension:vscode-notebook-tests \
				compile-extension:markdown-language-features \
				compile-extension:typescript-language-features \
				compile-extension:emmet \
				compile-extension:css-language-features-server \
				compile-extension:html-language-features-server \
				compile-extension:json-language-features-server \
				compile-extension:git \
				compile-extension:ipynb \
				compile-extension-media

	# Configuration for more verbose output
	export VSCODE_CLI=1
	export ELECTRON_ENABLE_LOGGING=1

	echo "Storing crash reports into '$VSCODECRASHDIR'."
	echo "Storing log files into '$VSCODELOGSDIR'."
	echo "Running integration tests with '$INTEGRATION_TEST_ELECTRON_PATH' as build."
fi

# Tests in the extension host

API_TESTS_EXTRA_ARGS="--disable-telemetry --skip-welcome --skip-release-notes --crash-reporter-directory=$VSCODECRASHDIR --logsPath=$VSCODELOGSDIR --no-cached-data --disable-updates --disable-keytar --disable-extensions --disable-workspace-trust --user-data-dir=$VSCODEUSERDATADIR"

if [ -z "$INTEGRATION_TEST_APP_NAME" ]; then
	kill_app() { true; }
else
	kill_app() { killall $INTEGRATION_TEST_APP_NAME || true; }
fi

echo
echo "### Markdown tests"
echo
"$INTEGRATION_TEST_ELECTRON_PATH" $LINUX_EXTRA_ARGS $ROOT/extensions/markdown-language-features/test-workspace --extensionDevelopmentPath=$ROOT/extensions/markdown-language-features --extensionTestsPath=$ROOT/extensions/markdown-language-features/out/test $API_TESTS_EXTRA_ARGS
kill_app

# Cleanup

rm -rf $VSCODEUSERDATADIR
