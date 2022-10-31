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

vscodeuserdatadir=$(mktemp -d 2>/dev/null)
vscodecrashdir=$root/.build/crashes
vscodelogsdir=$root/.build/logs/integration-tests

cd "$root" || exit

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

echo "Storing crash reports into '$vscodecrashdir'."
echo "Storing log files into '$vscodelogsdir'."


# Tests standalone (AMD)

echo
echo "### node.js integration tests"
echo
./scripts/test.sh --runGlob ./**/*.integrationTest.js "$@"


# Tests in the extension host

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
		--disable-extensions --disable-workspace-trust \
		--user-data-dir="$vscodeuserdatadir"
	kill_app
}


echo
echo "### API tests (folder)"
echo
run_test \
	"$root"/extensions/vscode-api-tests/testWorkspace \
	--enable-proposed-api=vscode.vscode-api-tests \
	--extensionDevelopmentPath="$root"/extensions/vscode-api-tests \
	--extensionTestsPath="$root"/extensions/vscode-api-tests/out/singlefolder-tests

echo
echo "### API tests (workspace)"
echo
run_test \
	"$root"/extensions/vscode-api-tests/testworkspace.code-workspace \
	--enable-proposed-api=vscode.vscode-api-tests \
	--extensionDevelopmentPath="$root"/extensions/vscode-api-tests \
	--extensionTestsPath="$root"/extensions/vscode-api-tests/out/workspace-tests

echo
echo "### Colorize tests"
echo
run_test \
	"$root"/extensions/vscode-colorize-tests/test \
	--extensionDevelopmentPath="$root"/extensions/vscode-colorize-tests \
	--extensionTestsPath="$root"/extensions/vscode-colorize-tests/out

echo
echo "### TypeScript tests"
echo
run_test \
	"$root"/extensions/typescript-language-features/test-workspace \
	--extensionDevelopmentPath="$root"/extensions/typescript-language-features \
	--extensionTestsPath="$root"/extensions/typescript-language-features/out/test/unit

echo
echo "### Markdown tests"
echo
run_test \
	"$root"/extensions/markdown-language-features/test-workspace \
	--extensionDevelopmentPath="$root"/extensions/markdown-language-features \
	--extensionTestsPath="$root"/extensions/markdown-language-features/out/test

echo
echo "### Emmet tests"
echo
run_test \
	"$root"/extensions/emmet/test-workspace \
	--extensionDevelopmentPath="$root"/extensions/emmet \
	--extensionTestsPath="$root"/extensions/emmet/out/test

echo
echo "### Git tests"
echo
run_test "$(mktemp -d 2>/dev/null)" \
	--extensionDevelopmentPath="$root"/extensions/git \
	--extensionTestsPath="$root"/extensions/git/out/test

echo
echo "### Ipynb tests"
echo
run_test "$(mktemp -d 2>/dev/null)" \
	--extensionDevelopmentPath="$root"/extensions/ipynb \
	--extensionTestsPath="$root"/extensions/ipynb/out/test

echo
echo "### Configuration editing tests"
echo
run_test "$(mktemp -d 2>/dev/null)" \
	--extensionDevelopmentPath="$root"/extensions/configuration-editing \
	--extensionTestsPath="$root"/extensions/configuration-editing/out/test


# Tests standalone (CommonJS)

echo
echo "### CSS tests"
echo
cd "$root"/extensions/css-language-features/server &&
"$root"/scripts/node-electron.sh test/index.js

echo
echo "### HTML tests"
echo
cd "$root"/extensions/html-language-features/server &&
"$root"/scripts/node-electron.sh test/index.js


# Cleanup

rm -rf "$vscodeuserdatadir"
