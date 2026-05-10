#!/usr/bin/env bash
# ----------------------------------------------------------------------------
# Son of Anton — end-to-end harness smoke test
#
# Exercises the agent harness without launching the IDE: the CLI's `sota run
# @anton-code "..."` command drives BaseAgent.runAgenticTurn (which is the
# same code path the IDE uses for direct specialist invocation), so this
# script gives signal on the harness end-to-end.
#
# What it covers:
#   1. Build all three packages — catches type drift across the ~30 commits
#      shipped since the last live run.
#   2. `sota --version` — basic CLI startup
#   3. `sota tools list` — confirms BUILTIN_TOOLS resolves
#   4. `sota traces` — confirms the H16 trace pane scaffolding works (cache
#      / routing summaries print, even if mostly empty for a fresh session)
#   5. `sota mcp list` — confirms MCP wiring loads
#   6. `sota init --yes --output json` in a temp dir — confirms the
#      workspace bootstrap writes AGENTS.md + config.json correctly
#   7. `sota hooks list` — confirms the hooks runtime initialises
#   8. (Optional, requires Anthropic key) `sota run @anton-code "what is
#      2+2"` — actually drives a real agent turn and surfaces signal on
#      streaming, tool calls, suggestion sentinel, todo emission, cost
#      meter accumulation
#
# Run:
#   bash scripts/harness-smoke.sh
#
# Skip the live LLM call (step 8) by passing `--no-live`:
#   bash scripts/harness-smoke.sh --no-live
# ----------------------------------------------------------------------------

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CLI_BIN="$REPO_ROOT/son-of-anton-cli/dist/cli.js"
LIVE=true
if [[ "${1:-}" == "--no-live" ]]; then
	LIVE=false
fi

ok() { printf '  \033[32m✓\033[0m  %s\n' "$1"; }
fail() { printf '  \033[31m✗\033[0m  %s\n' "$1"; exit 1; }
section() { printf '\n\033[1m▶ %s\033[0m\n' "$1"; }

section "1. Build all three packages"
(cd "$REPO_ROOT/son-of-anton-core" && npm run build >/dev/null 2>&1) && ok "core builds clean" || fail "core build failed"
(cd "$REPO_ROOT/son-of-anton-cli" && npm run build >/dev/null 2>&1) && ok "cli builds clean" || fail "cli build failed"
(cd "$REPO_ROOT/extensions/son-of-anton" && npx tsc -p tsconfig.json --noEmit >/dev/null 2>&1) && ok "extension type-checks clean" || fail "extension type-check failed"

if [[ ! -f "$CLI_BIN" ]]; then
	fail "CLI binary not found at $CLI_BIN — did the build skip?"
fi

section "2. Basic CLI surface"
node "$CLI_BIN" --version >/dev/null && ok "sota --version" || fail "sota --version exited non-zero"
node "$CLI_BIN" --help >/dev/null && ok "sota --help" || fail "sota --help exited non-zero"

section "3. Tools registry resolves"
node "$CLI_BIN" tools list 2>&1 | head -5 && ok "sota tools list" || fail "tools list failed"

section "4. H16 traces scaffolding"
node "$CLI_BIN" traces --help >/dev/null && ok "sota traces --help" || fail "traces --help failed"
node "$CLI_BIN" traces --output json 2>&1 | head -20 && ok "sota traces --output json" || fail "traces failed"

section "5. MCP wiring loads"
node "$CLI_BIN" mcp list 2>&1 | head -5 && ok "sota mcp list" || fail "mcp list failed"

section "6. Workspace bootstrap"
TMP_INIT="$(mktemp -d)"
trap "rm -rf $TMP_INIT" EXIT
echo '{"name":"smoke-test","scripts":{"build":"tsc"}}' > "$TMP_INIT/package.json"
(cd "$TMP_INIT" && node "$CLI_BIN" init --yes --output json >/dev/null 2>&1) && ok "sota init --yes" || fail "sota init failed"
[[ -f "$TMP_INIT/.son-of-anton/AGENTS.md" ]] && ok "AGENTS.md written" || fail "AGENTS.md missing"
[[ -f "$TMP_INIT/.son-of-anton/config.json" ]] && ok "config.json written" || fail "config.json missing"

section "7. Hooks runtime"
node "$CLI_BIN" hooks list 2>&1 | head -3 && ok "sota hooks list" || fail "hooks list failed"

if [[ "$LIVE" == "false" ]]; then
	echo ""
	echo "✓ All offline checks passed. Skipping live LLM call (--no-live)."
	exit 0
fi

section "8. Live agent turn (requires ANTHROPIC_API_KEY or claude/codex CLI)"
if [[ -z "${ANTHROPIC_API_KEY:-}" ]] && ! command -v claude >/dev/null 2>&1 && ! command -v codex >/dev/null 2>&1; then
	echo "  (skipped — no ANTHROPIC_API_KEY env var set and no claude / codex CLI on PATH)"
	echo ""
	echo "✓ All offline checks passed. To run the live test:"
	echo "    export ANTHROPIC_API_KEY=sk-ant-..."
	echo "  OR install the codex / claude CLI and run their login command first."
	exit 0
fi

echo "  Running: sota run @anton-code 'what is 2+2 — answer in one sentence' --output text"
echo "  (this will take ~5-10s and consume ~200 tokens)"
echo ""

if node "$CLI_BIN" run @anton-code 'what is 2+2 — answer in one sentence' --output text 2>&1 | tee /tmp/sota-smoke-output.txt; then
	ok "Live agent turn returned without throwing"
else
	fail "Live agent turn errored — check /tmp/sota-smoke-output.txt"
fi

# Signal-checks on the captured output. None are fatal individually since the
# agent has freedom to phrase its response however it wants — but the matrix
# tells us which harness features lit up vs not.
echo ""
section "9. Signal checks (non-fatal)"
if grep -q -E "4|four" /tmp/sota-smoke-output.txt; then ok "answer mentions '4' or 'four'"; else fail "answer didn't mention 4 — harness may be broken"; fi
if grep -q "<<sota:suggestions>>" /tmp/sota-smoke-output.txt; then ok "follow-up suggestion sentinel emitted"; else echo "  (note) no <<sota:suggestions>> sentinel — agent didn't opt-in this turn"; fi
if grep -q "todo_write\|todo_read" /tmp/sota-smoke-output.txt; then ok "todo tools fired"; else echo "  (note) no todo tools fired — task too simple to plan"; fi

echo ""
echo "✓ Live agent turn completed. Full output in /tmp/sota-smoke-output.txt"
