#!/usr/bin/env bash
set -e

if [[ "$OSTYPE" == "darwin"* ]]; then
	realpath() { [[ $1 = /* ]] && echo "$1" || echo "$PWD/${1#./}"; }
	ROOT=$(dirname $(dirname $(realpath "$0")))
else
	ROOT=$(dirname $(dirname $(readlink -f $0)))
fi

cd "$ROOT"

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

# Parse arguments
EXTRA_ARGS=()
BUILD_ARGS=()
RUN_FILE=""
RUN_GLOB=""
RUN_LIST=""
GREP_PATTERN=""
SUITE_FILTER=""
ONLY_NODE_TESTS=false
ONLY_EXTENSION_HOST_TESTS=false
HELP=false
AGENT_HOST_E2E_GLOB="**/agentHost/test/node/e2e/{providers/*AgentHostE2E,conformance/*}.integrationTest.js"

while [[ $# -gt 0 ]]; do
	case "$1" in
		--help|-h)
			HELP=true
			shift
			;;
		--build)
			BUILD_ARGS=(--build)
			EXTRA_ARGS+=("$1")
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
		--runList)
			RUN_LIST="$2"
			EXTRA_ARGS+=("$1" "$2")
			shift 2
			;;
		--runList=*)
			RUN_LIST="${1#--runList=}"
			EXTRA_ARGS+=("$1")
			shift
			;;
		--suite)
			SUITE_FILTER="$2"
			shift 2
			;;
		--only-node-tests)
			ONLY_NODE_TESTS=true
			shift
			;;
		--only-extension-host-tests)
			ONLY_EXTENSION_HOST_TESTS=true
			shift
			;;
		*)
			EXTRA_ARGS+=("$1")
			shift
			;;
	esac
done

# Known suite names (used for help text and validation)
KNOWN_SUITES="api-folder api-workspace colorize terminal-suggest typescript markdown emmet git git-base ipynb notebook-renderers configuration-editing github-authentication copilot css html json"

if $HELP; then
	echo "Usage: $0 [options]"
	echo ""
	echo "Runs integration tests. When no filters are given, all integration tests"
	echo "(node.js integration tests + extension host tests) are run."
	echo "Agent Host E2E suites are not included; run them with scripts/test-agent-host-e2e.sh."
	echo ""
	echo "--run and --runGlob select which node.js integration test files to load, and"
	echo "--runList runs only the files that a list names. Extension host tests are"
	echo "skipped when these options are used."
	echo ""
	echo "--grep filters test cases by name across all test runners. When used alone,"
	echo "the pattern is applied to both node.js integration tests and all extension"
	echo "host suites. When combined with --suite, only the selected suites are run."
	echo ""
	echo "--suite selects which extension host test suites to run."
	echo "Node.js integration tests are skipped when this option is used."
	echo ""
	echo "--only-node-tests and --only-extension-host-tests run one of the two parts,"
	echo "for example in separate CI steps."
	echo ""
	echo "Options:"
	echo "  --build                      use the out-build directory for node.js and JSON tests"
	echo "  --run <file>                  run tests from a specific file (src/ path)"
	echo "  --runGlob, --glob <pattern>   select test files by path glob (e.g. '**/editor/**/*.integrationTest.js')"
	echo "  --runList <file>              run only the test files listed in <file>, one per line (src/ paths)"
	echo "  --grep, -g, -f <pattern>      filter test cases by name (matched against test titles)"
	echo "  --suite <pattern>             run only matching extension host test suites"
	echo "                                supports comma-separated list and glob patterns"
	echo "  --only-node-tests             run only the node.js integration tests"
	echo "  --only-extension-host-tests   run only the extension host tests"
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
if [[ -n "$RUN_FILE" || -n "$RUN_GLOB" || -n "$RUN_LIST" ]]; then
	HAS_FILTER=true
fi

if $ONLY_NODE_TESTS && { $ONLY_EXTENSION_HOST_TESTS || [[ -n "$SUITE_FILTER" ]]; }; then
	echo "Error: --only-node-tests cannot be combined with --only-extension-host-tests or --suite"
	exit 1
fi
if $ONLY_EXTENSION_HOST_TESTS && $HAS_FILTER; then
	echo "Error: --only-extension-host-tests cannot be combined with --run, --runGlob or --runList"
	exit 1
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

if [[ -z "$SUITE_FILTER" ]] && ! $ONLY_EXTENSION_HOST_TESTS; then
	start_suite "node.js integration tests"
	node --input-type=module -e "import { getAgentHostTestProfile } from './src/vs/platform/agentHost/test/node/agentHostTestProfile.ts'; console.log('Agent Host test profile:', getAgentHostTestProfile(), '(' + (process.env.AGENT_HOST_TEST_PROFILE_REASON ?? 'default') + ')');"
	if [[ -z "$RUN_GLOB" && -z "$RUN_FILE" ]]; then
		# Agent Host E2E runs separately, in parallel isolated processes: scripts/test-agent-host-e2e.sh
		./scripts/test.sh --runGlob "**/*.integrationTest.js" --excludeRunGlob "$AGENT_HOST_E2E_GLOB" "${EXTRA_ARGS[@]}"
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

if $ONLY_NODE_TESTS; then
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

API_TESTS_BASE_ARGS="--disable-telemetry --disable-experiments --skip-welcome --skip-release-notes --crash-reporter-directory=$VSCODECRASHDIR --no-cached-data --disable-updates --use-inmemory-secretstorage --disable-extensions --disable-workspace-trust"
API_TESTS_EXTRA_ARGS="$API_TESTS_BASE_ARGS --logsPath=$VSCODELOGSDIR --user-data-dir=$VSCODEUSERDATADIR"

if [ -z "$INTEGRATION_TEST_APP_NAME" ]; then
	kill_app() { true; }
else
	kill_app() { killall $INTEGRATION_TEST_APP_NAME || true; }
fi

# Gives a suite that runs in parallel its own user data and logs folders (see integration-test-suites.sh).
prepare_suite() { # <name> <folder>
	mkdir -p "$2/User"
	cp "$VSCODEUSERDATADIR/User/settings.json" "$2/User/settings.json"
	# .vscode-test.js also reads these arguments, for the suites that `pnpm run test-extension` runs.
	export API_TESTS_EXTRA_ARGS="$API_TESTS_BASE_ARGS --logsPath=$VSCODELOGSDIR/$1 --user-data-dir=$2"
}

suite_api_folder() {
	"$INTEGRATION_TEST_ELECTRON_PATH" $ROOT/extensions/vscode-api-tests/testWorkspace --enable-proposed-api=vscode.vscode-api-tests --extensionDevelopmentPath=$ROOT/extensions/vscode-api-tests --extensionTestsPath=$ROOT/extensions/vscode-api-tests/out/singlefolder-tests $API_TESTS_EXTRA_ARGS
	kill_app
}

suite_api_workspace() {
	"$INTEGRATION_TEST_ELECTRON_PATH" $ROOT/extensions/vscode-api-tests/testworkspace.code-workspace --enable-proposed-api=vscode.vscode-api-tests --extensionDevelopmentPath=$ROOT/extensions/vscode-api-tests --extensionTestsPath=$ROOT/extensions/vscode-api-tests/out/workspace-tests $API_TESTS_EXTRA_ARGS
	kill_app
}

suite_colorize() {
	pnpm run test-extension -l vscode-colorize-tests "${GREP_ARGS[@]}"
	kill_app
}

suite_terminal_suggest() {
	pnpm run test-extension -l terminal-suggest --enable-proposed-api=vscode.vscode-api-tests "${GREP_ARGS[@]}"
	kill_app
}

suite_typescript() {
	"$INTEGRATION_TEST_ELECTRON_PATH" $ROOT/extensions/typescript-language-features/test-workspace --extensionDevelopmentPath=$ROOT/extensions/typescript-language-features --extensionTestsPath=$ROOT/extensions/typescript-language-features/out/test/unit $API_TESTS_EXTRA_ARGS
	kill_app
}

suite_markdown() {
	pnpm run test-extension -l markdown-language-features "${GREP_ARGS[@]}"
	kill_app
}

suite_emmet() {
	"$INTEGRATION_TEST_ELECTRON_PATH" $ROOT/extensions/emmet/test-workspace --extensionDevelopmentPath=$ROOT/extensions/emmet --extensionTestsPath=$ROOT/extensions/emmet/out/test $API_TESTS_EXTRA_ARGS
	kill_app
}

suite_git() {
	"$INTEGRATION_TEST_ELECTRON_PATH" $(mktemp -d 2>/dev/null) --extensionDevelopmentPath=$ROOT/extensions/git --extensionTestsPath=$ROOT/extensions/git/out/test $API_TESTS_EXTRA_ARGS
	kill_app
}

suite_git_base() {
	pnpm run test-extension -l git-base "${GREP_ARGS[@]}"
	kill_app
}

suite_ipynb() {
	pnpm run test-extension -l ipynb "${GREP_ARGS[@]}"
	kill_app
}

suite_notebook_renderers() {
	pnpm run test-extension -l notebook-renderers "${GREP_ARGS[@]}"
	kill_app
}

suite_configuration_editing() {
	pnpm run test-extension -l configuration-editing "${GREP_ARGS[@]}"
	kill_app
}

suite_github_authentication() {
	pnpm run test-extension -l github-authentication "${GREP_ARGS[@]}"
	kill_app
}

suite_copilot() {
	pnpm run test-extension -l copilot "${GREP_ARGS[@]}"
	kill_app
}

# Tests standalone (CommonJS)

suite_css() {
	(cd "$ROOT/extensions/css-language-features/server" && "$ROOT/scripts/node-electron.sh" test/index.js)
}

suite_html() {
	(cd "$ROOT/extensions/html-language-features/server" && "$ROOT/scripts/node-electron.sh" test/index.js)
}

suite_json() {
	"$ROOT/scripts/node-electron.sh" "$ROOT/extensions/json-language-features/client/out/test/index.js" "${BUILD_ARGS[@]}"
}

. "$ROOT/scripts/integration-test-suites.sh"

# The API tests of a folder and of a workspace change the same folder, so they run in one group. The
# estimated seconds, from the Linux CI runners, run the longest suites first in parallel.
should_run_suite api-folder && add_suite api api-folder 45 "API tests (folder)" suite_api_folder
should_run_suite api-workspace && add_suite api api-workspace 5 "API tests (workspace)" suite_api_workspace
# The API tests wait a fixed time for tools to register and for browser pages to respond, which
# another VS Code instance competing for the CPU delays past that time.
run_group_alone api
should_run_suite colorize && add_suite colorize colorize 30 "Colorize tests" suite_colorize
should_run_suite terminal-suggest && add_suite terminal-suggest terminal-suggest 6 "Terminal Suggest tests" suite_terminal_suggest
should_run_suite typescript && add_suite typescript typescript 5 "TypeScript tests" suite_typescript
should_run_suite markdown && add_suite markdown markdown 14 "Markdown tests" suite_markdown
should_run_suite emmet && add_suite emmet emmet 21 "Emmet tests" suite_emmet
should_run_suite git && add_suite git git 12 "Git tests" suite_git
should_run_suite git-base && add_suite git-base git-base 5 "Git Base tests" suite_git_base
should_run_suite ipynb && add_suite ipynb ipynb 5 "Ipynb tests" suite_ipynb
should_run_suite notebook-renderers && add_suite notebook-renderers notebook-renderers 6 "Notebook Output tests" suite_notebook_renderers
should_run_suite configuration-editing && add_suite configuration-editing configuration-editing 6 "Configuration editing tests" suite_configuration_editing
should_run_suite github-authentication && add_suite github-authentication github-authentication 6 "GitHub Authentication tests" suite_github_authentication
should_run_suite copilot && add_suite copilot copilot 5 "Copilot tests" suite_copilot
should_run_suite css && add_suite css css 5 "CSS tests" suite_css
should_run_suite html && add_suite html html 8 "HTML tests" suite_html
should_run_suite json && add_suite json json 5 "JSON tests" suite_json

run_suites


# Cleanup

rm -rf -- "$VSCODEUSERDATADIR"
