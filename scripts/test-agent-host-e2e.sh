#!/usr/bin/env bash
set -e

if [[ "$OSTYPE" == "darwin"* ]]; then
	realpath() { [[ $1 = /* ]] && echo "$1" || echo "$PWD/${1#./}"; }
	ROOT=$(dirname $(dirname $(realpath "$0")))
else
	ROOT=$(dirname $(dirname $(readlink -f $0)))
fi

cd "$ROOT"

if [[ "$1" == "--help" || "$1" == "-h" ]]; then
	echo "Usage: $0 [options]"
	echo ""
	echo "Runs the deterministic Agent Host E2E suites, one isolated test process per"
	echo "entrypoint, in parallel. scripts/test-integration.sh does not run them."
	echo ""
	echo "Options:"
	echo "  --jobs <n>                    maximum number of suites to run in parallel"
	echo "  --storage <disk|tmpfs|split>  temporary storage for the suites (tmpfs and split require Linux)"
	echo "  --runList <file>              run only the suites whose files are listed in <file>, one per line"
	echo "  --grep, -g, -f <pattern>      filter test cases by name"
	echo "  --build                       use the out-build directory"
	echo "  --help, -h                    show this help"
	echo ""
	echo "All other options are forwarded to scripts/test.sh."
	echo "Set VSCODE_SKIP_AGENT_HOST_E2E=1 to skip the suites, for example when no relevant files changed."
	echo "See src/vs/platform/agentHost/test/node/e2e/README.md."
	exit 0
fi

if [[ "$VSCODE_SKIP_AGENT_HOST_E2E" == "1" ]]; then
	echo "Skipping Agent Host E2E tests because VSCODE_SKIP_AGENT_HOST_E2E is set."
	exit 0
fi

exec node ./test/integration/agentHost/runner.ts "$@"
