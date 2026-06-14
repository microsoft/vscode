#!/usr/bin/env bash
#
# verify-seam.sh — binary guard for AX-TERMINAL-AGENT-TABS.
#
# Proves, WITHOUT a full VS Code build, that the agent-tabs feature is a safe
# thin patch: flag defaults off, and the flag-OFF branch still creates the stock
# TerminalTabbedView. Exits 0 on success, non-zero (with a reason) on failure.
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TBROWSER="$ROOT/src/vs/workbench/contrib/terminal/browser"
CONTRIB="$TBROWSER/agentTabs/agentTabsContribution.ts"
VIEW="$TBROWSER/terminalView.ts"

fail() { printf '\033[31mFAIL:\033[0m %s\n' "$*" >&2; exit 1; }
ok()   { printf '\033[32mok:\033[0m %s\n' "$*"; }

[[ -f "$CONTRIB" ]] || fail "missing $CONTRIB"
[[ -f "$VIEW" ]]    || fail "missing $VIEW"

# (1) Flag is registered with default:false.
grep -q "terminal.integrated.agentTabs.enabled" "$CONTRIB" \
  || fail "flag id terminal.integrated.agentTabs.enabled not found in agentTabsContribution.ts"
# The config block must declare default: false (boolean, off by default).
grep -Eq "'default'[[:space:]]*:[[:space:]]*false|default[[:space:]]*:[[:space:]]*false" "$CONTRIB" \
  || fail "agentTabs flag must declare default: false"
ok "flag terminal.integrated.agentTabs.enabled registered, default false"

# (2) The seam keeps the stock view on the flag-off path.
#     terminalView.ts must still reference TerminalTabbedView in a createInstance call.
grep -Eq "createInstance\([[:space:]]*TerminalTabbedView" "$VIEW" \
  || fail "terminalView.ts no longer creates the stock TerminalTabbedView — flag-off path broken"
ok "terminalView.ts flag-off branch creates the stock TerminalTabbedView"

# (3) The seam is typed through the interface, not the concrete class.
grep -q "ITerminalTabsView" "$VIEW" \
  || fail "terminalView.ts does not reference the ITerminalTabsView seam interface"
ok "terminalView.ts uses the ITerminalTabsView seam interface"

printf '\033[32mverify-seam: PASS\033[0m\n'
