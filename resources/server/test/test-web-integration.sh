#!/usr/bin/env bash
set -e

if [[ "$OSTYPE" == "darwin"* ]]; then
	realpath() { [[ $1 = /* ]] && echo "$1" || echo "$PWD/${1#./}"; }
	ROOT=$(dirname $(dirname $(dirname $(dirname $(realpath "$0")))))
else
	ROOT=$(dirname $(dirname $(dirname $(dirname $(readlink -f $0)))))
fi

cd $ROOT

if [[ -z "$VSCODE_REMOTE_SERVER_PATH" ]]; then
	echo "Running Web integration tests out of sources."
else
	# Run from a built: need to compile all test extensions
	# because we run extension tests from their source folders
	# and the build bundles extensions into .build webpacked
	yarn gulp 	compile-extension:vscode-api-tests \
				compile-extension:vscode-colorize-tests \
				compile-extension:vscode-custom-editor-tests \
				compile-extension:markdown-language-features \
				compile-extension:typescript-language-features \
				compile-extension:emmet \
				compile-extension:css-language-features-server \
				compile-extension:html-language-features-server \
				compile-extension:json-language-features-server \
				compile-extension:git \
				compile-extension:ipynb \
				compile-extension-media

	echo "Running Web integration tests with '$VSCODE_REMOTE_SERVER_PATH' as build."
fi

# Tests in the extension host
TEST_SCRIPT="$ROOT/test/integration/browser/out/index.js"

/usr/bin/env node "$TEST_SCRIPT" --workspacePath=$ROOT/extensions/vscode-api-tests/testWorkspace --enable-proposed-api=vscode.vscode-api-tests --extensionDevelopmentPath=$ROOT/extensions/vscode-api-tests --extensionTestsPath=$ROOT/extensions/vscode-api-tests/out/singlefolder-tests "$@"

/usr/bin/env node "$TEST_SCRIPT" --workspacePath=$ROOT/extensions/vscode-api-tests/testworkspace.code-workspace --enable-proposed-api=vscode.vscode-api-tests --extensionDevelopmentPath=$ROOT/extensions/vscode-api-tests --extensionTestsPath=$ROOT/extensions/vscode-api-tests/out/workspace-tests "$@"

# This seems it's electron only?
# /usr/bin/env node "$TEST_SCRIPT" --workspacePath=$ROOT/extensions/vscode-colorize-tests/test --extensionDevelopmentPath=$ROOT/extensions/vscode-colorize-tests --extensionTestsPath=$ROOT/extensions/vscode-colorize-tests/out "$@"

/usr/bin/env node "$TEST_SCRIPT" --workspacePath=$ROOT/extensions/typescript-language-features/test-workspace --extensionDevelopmentPath=$ROOT/extensions/typescript-language-features --extensionTestsPath=$ROOT/extensions/typescript-language-features/out/test/unit "$@"

/usr/bin/env node "$TEST_SCRIPT" --workspacePath=$ROOT/extensions/markdown-language-features/test-workspace --extensionDevelopmentPath=$ROOT/extensions/markdown-language-features --extensionTestsPath=$ROOT/extensions/markdown-language-features/out/test "$@"

/usr/bin/env node "$TEST_SCRIPT" --workspacePath=$ROOT/extensions/emmet/test-workspace --extensionDevelopmentPath=$ROOT/extensions/emmet --extensionTestsPath=$ROOT/extensions/emmet/out/test "$@"

/usr/bin/env node "$TEST_SCRIPT" --workspacePath=$(mktemp -d 2>/dev/null) --enable-proposed-api=vscode.git --extensionDevelopmentPath=$ROOT/extensions/git --extensionTestsPath=$ROOT/extensions/git/out/test "$@"

/usr/bin/env node "$TEST_SCRIPT" --workspacePath=$(mktemp -d 2>/dev/null) --extensionDevelopmentPath=$ROOT/extensions/ipynb --extensionTestsPath=$ROOT/extensions/ipynb/out/test "$@"
