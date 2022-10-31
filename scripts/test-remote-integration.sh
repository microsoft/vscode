#!/usr/bin/env bash
set -e

if [[ "$OSTYPE" == "darwin"* ]]; then
	realpath() { [[ "$1" = /* ]] && echo "$1" || echo "$PWD/${1#./}"; }
	root=$(dirname "$(dirname "$(realpath "$0")")")
else
	root=$(dirname "$(dirname "$(readlink -f "$0")")")
	# --disable-dev-shm-usage: when run on docker containers where size of /dev/shm
	# partition < 64MB which causes OOM failure for chromium compositor that uses the partition for shared memory
	linux_extra_args="--disable-dev-shm-usage"
fi

vscodeuserdatadir=$(mktemp -d 2>/dev/null) || exit
vscodecrashdir=$root/.build/crashes
vscodelogsdir=$root/.build/logs/integration-tests-remote
TESTRESOLVER_DATA_FOLDER=$(mktemp -d 2>/dev/null) || exit

cd "$root" || exit

if [[ "$1" == "" ]]; then
	AUTHORITY=vscode-remote://test+test
	EXT_PATH=$root/extensions
	# Load remote node
	yarn gulp node
else
	AUTHORITY=$1
	EXT_PATH=$2
	vscodeuserdatadir=${3:-$vscodeuserdatadir}
fi

export REMOTE_VSCODE=$AUTHORITY$EXT_PATH

# Figure out which Electron to use for running tests
if [ -z "$INTEGRATION_TEST_ELECTRON_PATH" ]
then
	INTEGRATION_TEST_ELECTRON_PATH="./scripts/code.sh"

	# No extra arguments when running out of sources
	extra_integration_test_arguments=""

	echo "Running remote integration tests out of sources."
else
	export VSCODE_CLI=1
	export ELECTRON_ENABLE_LOGGING=1

	# Running from a build, we need to enable the vscode-test-resolver extension
	extra_integration_test_arguments="--extensions-dir=$EXT_PATH  --enable-proposed-api=vscode.vscode-test-resolver --enable-proposed-api=vscode.vscode-api-tests"

	echo "Running remote integration tests with $INTEGRATION_TEST_ELECTRON_PATH as build."
fi

export TESTRESOLVER_DATA_FOLDER=$TESTRESOLVER_DATA_FOLDER
export TESTRESOLVER_LOGS_FOLDER=$vscodelogsdir/server

# Figure out which remote server to use for running tests
if [ -z "$VSCODE_REMOTE_SERVER_PATH" ]
then
	echo "Using remote server out of sources for integration tests"
else
	echo "Using $VSCODE_REMOTE_SERVER_PATH as server path for integration tests"
	export TESTRESOLVER_INSTALL_BUILTIN_EXTENSION='ms-vscode.vscode-smoketest-check'
fi

if [ -z "$INTEGRATION_TEST_APP_NAME" ]; then
	kill_app() { true; }
else
	kill_app() { killall "$INTEGRATION_TEST_APP_NAME" || true; }
fi

run_test () {
	"$INTEGRATION_TEST_ELECTRON_PATH" $linux_extra_args "$@" \
		--disable-telemetry --skip-welcome --skip-release-notes \
		--crash-reporter-directory="$vscodecrashdir" \
		--logsPath="$vscodelogsdir" \
		--no-cached-data --disable-updates --disable-keytar \
		--disable-workspace-trust --user-data-dir="$vscodeuserdatadir" \
		$extra_integration_test_arguments
	kill_app
}

echo "Storing crash reports into '$vscodecrashdir'."
echo "Storing log files into '$vscodelogsdir'."


# Tests in the extension host

echo
echo "### API tests (folder)"
echo
run_test \
	--folder-uri="$REMOTE_VSCODE"/vscode-api-tests/testWorkspace \
	--extensionDevelopmentPath="$REMOTE_VSCODE"/vscode-api-tests \
	--extensionTestsPath="$REMOTE_VSCODE"/vscode-api-tests/out/singlefolder-tests

echo
echo "### API tests (workspace)"
echo
run_test \
	--file-uri="$REMOTE_VSCODE"/vscode-api-tests/testworkspace.code-workspace \
	--extensionDevelopmentPath="$REMOTE_VSCODE"/vscode-api-tests \
	--extensionTestsPath="$REMOTE_VSCODE"/vscode-api-tests/out/workspace-tests

echo
echo "### TypeScript tests"
echo
run_test \
	--folder-uri="$REMOTE_VSCODE"/typescript-language-features/test-workspace \
	--extensionDevelopmentPath="$REMOTE_VSCODE"/typescript-language-features \
	--extensionTestsPath="$REMOTE_VSCODE"/typescript-language-features/out/test/unit

echo
echo "### Markdown tests"
echo
run_test \
	--folder-uri="$REMOTE_VSCODE"/markdown-language-features/test-workspace \
	--extensionDevelopmentPath="$REMOTE_VSCODE"/markdown-language-features \
	--extensionTestsPath="$REMOTE_VSCODE"/markdown-language-features/out/test

echo
echo "### Emmet tests"
echo
run_test \
	--folder-uri="$REMOTE_VSCODE"/emmet/test-workspace \
	--extensionDevelopmentPath="$REMOTE_VSCODE"/emmet \
	--extensionTestsPath="$REMOTE_VSCODE"/emmet/out/test

echo
echo "### Git tests"
echo
run_test \
	--folder-uri="$AUTHORITY$(mktemp -d 2>/dev/null)" \
	--extensionDevelopmentPath="$REMOTE_VSCODE"/git \
	--extensionTestsPath="$REMOTE_VSCODE"/git/out/test

echo
echo "### Ipynb tests"
echo
run_test \
	--folder-uri="$AUTHORITY$(mktemp -d 2>/dev/null)" \
	--extensionDevelopmentPath="$REMOTE_VSCODE/"ipynb \
	--extensionTestsPath="$REMOTE_VSCODE"/ipynb/out/test

echo
echo "### Configuration editing tests"
echo
run_test \
	--folder-uri="$AUTHORITY$(mktemp -d 2>/dev/null)" \
	--extensionDevelopmentPath="$REMOTE_VSCODE"/configuration-editing \
	--extensionTestsPath="$REMOTE_VSCODE"/configuration-editing/out/test

# Cleanup

if [[ "$3" == "" ]]; then
	rm -rf "$vscodeuserdatadir"
fi

rm -rf "$TESTRESOLVER_DATA_FOLDER"
