#!/usr/bin/env bash
set -e

if [[ "$OSTYPE" == "darwin"* ]]; then
	realpath() { [[ $1 = /* ]] && echo "$1" || echo "$PWD/${1#./}"; }
	ROOT=$(dirname $(dirname $(realpath "$0")))
else
	ROOT=$(dirname $(dirname $(readlink -f $0)))
fi

VSCODEUSERDATADIR=`mktemp -d 2>/dev/null`
VSCODECRASHDIR=$ROOT/.build/crashes
VSCODELOGSDIR=$ROOT/.build/logs/integration-tests-remote
TESTRESOLVER_DATA_FOLDER=`mktemp -d 2>/dev/null`

cd $ROOT

# Names the suite that is running, so that a failure that stops the script
# (set -e) reports which suite failed and with which exit code.
CURRENT_SUITE=""
start_suite() {
	CURRENT_SUITE="$1"
	echo
	echo "### $1"
	echo
}
report_failed_suite() {
	local status=$?
	if [[ $status -ne 0 && -n "$CURRENT_SUITE" ]]; then
		echo "Integration tests failed in '$CURRENT_SUITE' with exit code $status." >&2
		if [[ "$GITHUB_ACTIONS" == "true" ]]; then
			echo "::error title=Integration tests failed::'$CURRENT_SUITE' exited with code $status"
		fi
	fi
}
trap report_failed_suite EXIT

if [[ "$1" == "" ]]; then
	AUTHORITY=vscode-remote://test+test
	EXT_PATH=$ROOT/extensions
	# Load remote node
	pnpm run gulp node
else
	AUTHORITY=$1
	EXT_PATH=$2
	VSCODEUSERDATADIR=${3:-$VSCODEUSERDATADIR}
fi

export REMOTE_VSCODE=$AUTHORITY$EXT_PATH

# Figure out which Electron to use for running tests
if [ -z "$INTEGRATION_TEST_ELECTRON_PATH" ]
then
	INTEGRATION_TEST_ELECTRON_PATH="./scripts/code.sh"

	# No extra arguments when running out of sources
	EXTRA_INTEGRATION_TEST_ARGUMENTS=""

	echo "Running remote integration tests out of sources."
else
	export VSCODE_CLI=1
	export ELECTRON_ENABLE_LOGGING=1

	# Running from a build, we need to enable the vscode-test-resolver extension
	EXTRA_INTEGRATION_TEST_ARGUMENTS="--extensions-dir=$EXT_PATH  --enable-proposed-api=vscode.vscode-test-resolver --enable-proposed-api=vscode.vscode-api-tests"

	echo "Running remote integration tests with $INTEGRATION_TEST_ELECTRON_PATH as build."
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

if [ -z "$INTEGRATION_TEST_APP_NAME" ]; then
	kill_app() { true; }
else
	kill_app() { killall $INTEGRATION_TEST_APP_NAME || true; }
fi

API_TESTS_BASE_ARGS="--disable-telemetry --disable-experiments --skip-welcome --skip-release-notes --crash-reporter-directory=$VSCODECRASHDIR --no-cached-data --disable-updates --use-inmemory-secretstorage --disable-workspace-trust"
API_TESTS_EXTRA_ARGS="$API_TESTS_BASE_ARGS --logsPath=$VSCODELOGSDIR --user-data-dir=$VSCODEUSERDATADIR"

# Gives a suite that runs in parallel its own user data, logs and server folders (see integration-test-suites.sh).
prepare_suite() { # <name> <folder>
	API_TESTS_EXTRA_ARGS="$API_TESTS_BASE_ARGS --logsPath=$VSCODELOGSDIR/$1 --user-data-dir=$2/user-data"
	export TESTRESOLVER_DATA_FOLDER=$2/server-data
	export TESTRESOLVER_LOGS_FOLDER=$VSCODELOGSDIR/$1/server
}

echo "Storing crash reports into '$VSCODECRASHDIR'."
echo "Storing log files into '$VSCODELOGSDIR'."


# Tests in the extension host

suite_api_folder() {
	"$INTEGRATION_TEST_ELECTRON_PATH" --folder-uri=$REMOTE_VSCODE/vscode-api-tests/testWorkspace --extensionDevelopmentPath=$REMOTE_VSCODE/vscode-api-tests --extensionTestsPath=$REMOTE_VSCODE/vscode-api-tests/out/singlefolder-tests $API_TESTS_EXTRA_ARGS $EXTRA_INTEGRATION_TEST_ARGUMENTS
	kill_app
}

suite_api_workspace() {
	"$INTEGRATION_TEST_ELECTRON_PATH" --file-uri=$REMOTE_VSCODE/vscode-api-tests/testworkspace.code-workspace --extensionDevelopmentPath=$REMOTE_VSCODE/vscode-api-tests --extensionTestsPath=$REMOTE_VSCODE/vscode-api-tests/out/workspace-tests $API_TESTS_EXTRA_ARGS $EXTRA_INTEGRATION_TEST_ARGUMENTS
	kill_app
}

suite_typescript() {
	"$INTEGRATION_TEST_ELECTRON_PATH" --folder-uri=$REMOTE_VSCODE/typescript-language-features/test-workspace --extensionDevelopmentPath=$REMOTE_VSCODE/typescript-language-features --extensionTestsPath=$REMOTE_VSCODE/typescript-language-features/out/test/unit $API_TESTS_EXTRA_ARGS $EXTRA_INTEGRATION_TEST_ARGUMENTS
	kill_app
}

suite_markdown() {
	"$INTEGRATION_TEST_ELECTRON_PATH" --folder-uri=$REMOTE_VSCODE/markdown-language-features/test-workspace --extensionDevelopmentPath=$REMOTE_VSCODE/markdown-language-features --extensionTestsPath=$REMOTE_VSCODE/markdown-language-features/out/test $API_TESTS_EXTRA_ARGS $EXTRA_INTEGRATION_TEST_ARGUMENTS
	kill_app
}

suite_emmet() {
	"$INTEGRATION_TEST_ELECTRON_PATH" --folder-uri=$REMOTE_VSCODE/emmet/test-workspace --extensionDevelopmentPath=$REMOTE_VSCODE/emmet --extensionTestsPath=$REMOTE_VSCODE/emmet/out/test $API_TESTS_EXTRA_ARGS $EXTRA_INTEGRATION_TEST_ARGUMENTS
	kill_app
}

suite_git() {
	"$INTEGRATION_TEST_ELECTRON_PATH" --folder-uri=$AUTHORITY$(mktemp -d 2>/dev/null) --extensionDevelopmentPath=$REMOTE_VSCODE/git --extensionTestsPath=$REMOTE_VSCODE/git/out/test $API_TESTS_EXTRA_ARGS $EXTRA_INTEGRATION_TEST_ARGUMENTS
	kill_app
}

suite_ipynb() {
	"$INTEGRATION_TEST_ELECTRON_PATH" --folder-uri=$AUTHORITY$(mktemp -d 2>/dev/null) --extensionDevelopmentPath=$REMOTE_VSCODE/ipynb --extensionTestsPath=$REMOTE_VSCODE/ipynb/out/test $API_TESTS_EXTRA_ARGS $EXTRA_INTEGRATION_TEST_ARGUMENTS
	kill_app
}

suite_configuration_editing() {
	"$INTEGRATION_TEST_ELECTRON_PATH" --folder-uri=$AUTHORITY$(mktemp -d 2>/dev/null) --extensionDevelopmentPath=$REMOTE_VSCODE/configuration-editing --extensionTestsPath=$REMOTE_VSCODE/configuration-editing/out/test $API_TESTS_EXTRA_ARGS $EXTRA_INTEGRATION_TEST_ARGUMENTS
	kill_app
}

. "$ROOT/scripts/integration-test-suites.sh"

# The API tests of a folder and of a workspace change the same folder, so they run in one group. The
# estimated seconds, from the Linux CI runners, run the longest suites first in parallel.
add_suite api api-folder 67 "API tests (folder)" suite_api_folder
add_suite api api-workspace 6 "API tests (workspace)" suite_api_workspace
# The API tests wait a fixed time for tools to register and for browser pages to respond, which
# another VS Code instance competing for the CPU delays past that time.
run_group_alone api
add_suite typescript typescript 6 "TypeScript tests" suite_typescript
add_suite markdown markdown 21 "Markdown tests" suite_markdown
add_suite emmet emmet 37 "Emmet tests" suite_emmet
add_suite git git 33 "Git tests" suite_git
add_suite ipynb ipynb 6 "Ipynb tests" suite_ipynb
add_suite configuration-editing configuration-editing 9 "Configuration editing tests" suite_configuration_editing

run_suites

# Cleanup

# The app can still write to its user data folder for a moment after the last
# suite returns, and a removal that races with it fails with "Directory not empty".
# Cleanup must not fail a run whose suites passed: retry, then warn and continue.
remove_folder() {
	local attempt
	for attempt in 1 2 3 4 5; do
		if rm -rf -- "$1"; then
			return 0
		fi
		sleep 1
	done
	echo "Warning: could not remove '$1' after $attempt attempts, continuing." >&2
	if [[ "$GITHUB_ACTIONS" == "true" ]]; then
		echo "::warning title=Integration test cleanup::Could not remove '$1'"
	elif [[ "$TF_BUILD" == "True" ]]; then
		echo "##vso[task.logissue type=warning]Integration test cleanup could not remove '$1'"
	fi
}

if [[ "$3" == "" ]]; then
	remove_folder "$VSCODEUSERDATADIR"
fi

remove_folder "$TESTRESOLVER_DATA_FOLDER"
