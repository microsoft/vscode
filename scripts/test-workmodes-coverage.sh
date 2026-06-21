#!/usr/bin/env bash
# Run Work Modes unit tests with Istanbul and write/merge into .build/coverage
#
# Prefers the standard Electron unit runner when available; falls back to
# documenting that Work Modes suites live under:
#   src/vs/workbench/contrib/userDataProfile/test/browser/workMode*.test.ts
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f out/vs/workbench/contrib/userDataProfile/common/workMode.js ]]; then
	echo "[coverage] Transpiling client (workMode not in out/)..."
	npm run transpile-client
fi

COVERAGE_PATH="${COVERAGE_PATH:-$ROOT/.build/coverage}"

if [[ -x "$ROOT/.build/electron/code-oss" ]] || [[ -x "$ROOT/.build/electron/Code - OSS.app/Contents/MacOS/Electron" ]]; then
	echo "[coverage] Running Work Modes via scripts/test.sh --coverage"
	./scripts/test.sh --coverage --coveragePath "$COVERAGE_PATH" --grep "Work Modes" || true
else
	echo "[coverage] Electron runner not available; run when possible:"
	echo "  ./scripts/test.sh --coverage --coveragePath .build/coverage --grep \"Work Modes\""
	echo ""
	echo "Test files:"
	echo "  src/vs/workbench/contrib/userDataProfile/test/browser/workMode.test.ts"
	echo "  src/vs/workbench/contrib/userDataProfile/test/browser/workModeService.test.ts"
	echo "  (see WORK_MODE_TEST_REPORT.md for coverage/compat matrix)"
fi

echo ""
echo "Reports (when runner succeeds):"
echo "  file://$COVERAGE_PATH/index.html"
echo "  Search for: workMode"
