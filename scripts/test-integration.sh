#!/usr/bin/env bash
set -e

if [[ "$OSTYPE" == "darwin"* ]]; then
	realpath() { [[ $1 = /* ]] && echo "$1" || echo "$PWD/${1#./}"; }
	ROOT=$(dirname $(dirname $(realpath "$0")))
else
	ROOT=$(dirname $(dirname $(readlink -f $0)))
fi

cd "$ROOT"

# Parse arguments
EXTRA_ARGS=()
RUN_FILE=""
RUN_GLOB=""
GREP_PATTERN=""
SUITE_FILTER=""
HELP=false

while [[ $# -gt 0 ]]; do
	case "$1" in
		--help|-h)
			HELP=true
			shift
			;;
		--run)
			RUN_FILE="$2"
			EXTRA_ARGS+=("$1" "$2")
			shift 2
			;;
		--grep|-g|-f)
			GREP_PATTERN="$2"
			EXTRA_ARGS+=("$1" "$2")
			shift 2
			;;
		--runGlob|--glob|--runGrep)
			RUN_GLOB="$2"
			EXTRA_ARGS+=("$1" "$2")
			shift 2
			;;
		--suite)
			SUITE_FILTER="$2"
			shift 2
			;;
		*)
			EXTRA_ARGS+=("$1")
			shift
			;;
	esac
done

# Known suite names (used for help text and validation)
KNOWN_SUITES="api-folder api-workspace colorize terminal-suggest typescript markdown emmet git git-base ipynb notebook-renderers configuration-editing github-authentication css html"

if $HELP; then
	echo "Usage: $0 [options]"
	echo ""
	echo "Runs integration tests. When no filters are given, all integration tests"
	echo "(node.js integration tests + extension host tests) are run."
	echo ""
	echo "--run and --runGlob select which node.js integration test files to load."
	echo "Extension host tests are skipped when these options are used."
	echo ""
	echo "--grep filters test cases by name across all test runners. When used alone,"
	echo "the pattern is applied to both node.js integration tests and all extension"
	echo "host suites. When combined with --suite, only the selected suites are run."
	echo ""
	echo "--suite selects which extension host test suites to run."
	echo "Node.js integration tests are skipped when this option is used."
	echo ""
	echo "Options:"
	echo "  --run <file>                  run tests from a specific file (src/ path)"
	echo "  --runGlob, --glob <pattern>   select test files by path glob (e.g. '**/editor/**/*.integrationTest.js')"
	echo "  --grep, -g, -f <pattern>      filter test cases by name (matched against test titles)"
	echo "  --suite <pattern>             run only matching extension host test suites"
	echo "                                supports comma-separated list and glob patterns"
	echo "  --help, -h                    show this help"
	echo ""
	echo "Available suites: $KNOWN_SUITES"
	echo ""
	echo "All other options are forwarded to the node.js test runner (see scripts/test.sh --help)."
	echo "Note: extra options are not forwarded to extension host suites (--suite mode)."
	echo ""
	echo "Examples:"
	echo "  $0                                         # run all integration tests"
	echo "  $0 --run src/vs/editor/test/browser/controller.integrationTest.ts"
	echo "  $0 --grep 'some test name'"
	echo "  $0 --runGlob '**/editor/**/*.integrationTest.js'"
	echo "  $0 --suite git                             # run only Git tests"
	echo "  $0 --suite 'api*'                          # run API folder + workspace tests"
	echo "  $0 --suite 'git,emmet,typescript'          # run multiple suites"
	echo "  $0 --suite api-folder --grep 'some test'     # grep within a suite"
	exit 0
fi

HAS_FILTER=false
if [[ -n "$RUN_FILE" || -n "$RUN_GLOB" ]]; then
	HAS_FILTER=true
fi

# Check whether a given suite name matches the --suite filter.
# Supports comma-separated patterns with shell globbing (e.g. "git*,api*").
should_run_suite() {
	if [[ -z "$SUITE_FILTER" ]]; then
		return 0
	fi
	IFS=',' read -ra PATTERNS <<< "$SUITE_FILTER"
	for pattern in "${PATTERNS[@]}"; do
		pattern="${pattern## }"  # trim leading spaces
		pattern="${pattern%% }"  # trim trailing spaces
		if [[ "$1" == $pattern ]]; then
			return 0
		fi
	done
	return 1
}

VSCODEUSERDATADIR=`mktemp -d 2>/dev/null`
VSCODECRASHDIR=$ROOT/.build/crashes
VSCODELOGSDIR=$ROOT/.build/logs/integration-tests

# Seed user settings to disable OS notifications (dock bounce, toast, etc.)
mkdir -p "$VSCODEUSERDATADIR/User"
cat > "$VSCODEUSERDATADIR/User/settings.json" <<EOF
{
	"chat.notifyWindowOnConfirmation": "off",
	"chat.notifyWindowOnResponseReceived": "off"
}
EOF

# Figure out which Electron to use for running tests
if [ -z "$INTEGRATION_TEST_ELECTRON_PATH" ]
then
	INTEGRATION_TEST_ELECTRON_PATH="./scripts/code.sh"

	echo "Running integration tests out of sources."
else
	export VSCODE_CLI=1
	export ELECTRON_ENABLE_LOGGING=1

	echo "Running integration tests with '$INTEGRATION_TEST_ELECTRON_PATH' as build."
fi

echo "Storing crash reports into '$VSCODECRASHDIR'."
echo "Storing log files into '$VSCODELOGSDIR'."


# Validate --suite filter matches at least one known suite
if [[ -n "$SUITE_FILTER" ]]; then
	SUITE_MATCHED=false
	for suite in $KNOWN_SUITES; do
		if should_run_suite "$suite"; then
			SUITE_MATCHED=true
			break
		fi
	done
	if [[ "$SUITE_MATCHED" == "false" ]]; then
		echo "Error: no suites match filter '$SUITE_FILTER'"
		echo "Available suites: $KNOWN_SUITES"
		rm -rf -- "$VSCODEUSERDATADIR"
		exit 1
	fi
fi


# Unit tests

if [[ -z "$SUITE_FILTER" ]]; then
	echo
	echo "### node.js integration tests"
	echo
	if [[ -z "$RUN_GLOB" && -z "$RUN_FILE" ]]; then
		./scripts/test.sh --runGlob "**/*.integrationTest.js" "${EXTRA_ARGS[@]}"
	else
		./scripts/test.sh "${EXTRA_ARGS[@]}"
	fi
fi

# Skip extension host tests when a non-suite filter is active
if [[ -z "$SUITE_FILTER" ]] && $HAS_FILTER; then
	echo ""
	echo "Filter active, skipping extension host tests."
	rm -rf -- "$VSCODEUSERDATADIR"
	exit 0
fi


# Tests in the extension host

# Forward grep pattern to extension test runners
GREP_ARGS=()
if [[ -n "$GREP_PATTERN" ]]; then
	export MOCHA_GREP="$GREP_PATTERN"
	GREP_ARGS=(--grep "$GREP_PATTERN")
fi

API_TESTS_EXTRA_ARGS="--disable-telemetry --disable-experiments --skip-welcome --skip-release-notes --crash-reporter-directory=$VSCODECRASHDIR --logsPath=$VSCODELOGSDIR --no-cached-data --disable-updates --use-inmemory-secretstorage --disable-extensions --disable-workspace-trust --user-data-dir=$VSCODEUSERDATADIR"

if [ -z "$INTEGRATION_TEST_APP_NAME" ]; then
	kill_app() { true; }
else
	kill_app() { killall $INTEGRATION_TEST_APP_NAME || true; }
fi

if should_run_suite api-folder; then
echo
echo "### API tests (folder)"
echo
"$INTEGRATION_TEST_ELECTRON_PATH" $ROOT/extensions/vscode-api-tests/testWorkspace --enable-proposed-api=vscode.vscode-api-tests --extensionDevelopmentPath=$ROOT/extensions/vscode-api-tests --extensionTestsPath=$ROOT/extensions/vscode-api-tests/out/singlefolder-tests $API_TESTS_EXTRA_ARGS
kill_app
fi

if should_run_suite api-workspace; then
echo
echo "### API tests (workspace)"
echo
"$INTEGRATION_TEST_ELECTRON_PATH" $ROOT/extensions/vscode-api-tests/testworkspace.code-workspace --enable-proposed-api=vscode.vscode-api-tests --extensionDevelopmentPath=$ROOT/extensions/vscode-api-tests --extensionTestsPath=$ROOT/extensions/vscode-api-tests/out/workspace-tests $API_TESTS_EXTRA_ARGS
kill_app
fi

if should_run_suite colorize; then
echo
echo "### Colorize tests"
echo
npm run test-extension -- -l vscode-colorize-tests "${GREP_ARGS[@]}"
kill_app
fi

if should_run_suite terminal-suggest; then
echo
echo "### Terminal Suggest tests"
echo
npm run test-extension -- -l terminal-suggest --enable-proposed-api=vscode.vscode-api-tests "${GREP_ARGS[@]}"
kill_app
fi

if should_run_suite typescript; then
echo
echo "### TypeScript tests"
echo
"$INTEGRATION_TEST_ELECTRON_PATH" $ROOT/extensions/typescript-language-features/test-workspace --extensionDevelopmentPath=$ROOT/extensions/typescript-language-features --extensionTestsPath=$ROOT/extensions/typescript-language-features/out/test/unit $API_TESTS_EXTRA_ARGS
kill_app
fi

if should_run_suite markdown; then
echo
echo "### Markdown tests"
echo
npm run test-extension -- -l markdown-language-features "${GREP_ARGS[@]}"
kill_app
fi

if should_run_suite emmet; then
echo
echo "### Emmet tests"
echo
"$INTEGRATION_TEST_ELECTRON_PATH" $ROOT/extensions/emmet/test-workspace --extensionDevelopmentPath=$ROOT/extensions/emmet --extensionTestsPath=$ROOT/extensions/emmet/out/test $API_TESTS_EXTRA_ARGS
kill_app
fi

if should_run_suite git; then
echo
echo "### Git tests"
echo
"$INTEGRATION_TEST_ELECTRON_PATH" $(mktemp -d 2>/dev/null) --extensionDevelopmentPath=$ROOT/extensions/git --extensionTestsPath=$ROOT/extensions/git/out/test $API_TESTS_EXTRA_ARGS
kill_app
fi

if should_run_suite git-base; then
echo
echo "### Git Base tests"
echo
npm run test-extension -- -l git-base "${GREP_ARGS[@]}"
kill_app
fi

if should_run_suite ipynb; then
echo
echo "### Ipynb tests"
echo
npm run test-extension -- -l ipynb "${GREP_ARGS[@]}"
kill_app
fi

if should_run_suite notebook-renderers; then
echo
echo "### Notebook Output tests"
echo
npm run test-extension -- -l notebook-renderers "${GREP_ARGS[@]}"
kill_app
fi

if should_run_suite configuration-editing; then
echo
echo "### Configuration editing tests"
echo
npm run test-extension -- -l configuration-editing "${GREP_ARGS[@]}"
kill_app
fi

if should_run_suite github-authentication; then
echo
echo "### GitHub Authentication tests"
echo
npm run test-extension -- -l github-authentication "${GREP_ARGS[@]}"
kill_app
fi

# Tests standalone (CommonJS)

if should_run_suite css; then
echo
echo "### CSS tests"
echo
cd "$ROOT/extensions/css-language-features/server" && "$ROOT/scripts/node-electron.sh" test/index.js
fi

if should_run_suite html; then
echo
echo "### HTML tests"
echo
cd "$ROOT/extensions/html-language-features/server" && "$ROOT/scripts/node-electron.sh" test/index.js
fi


# Cleanup

rm -rf -- "$VSCODEUSERDATADIR"
