#!/usr/bin/env bash
#
# check-seams.sh - the executable re-pin gate for the merge-tax ledger's shell seams.
#
# The Abstract fork de-IDEs VS Code almost entirely through the cheap tiers (settings, theme,
# styleOverrides CSS, additive contributions), but a handful of seams DO couple to upstream core
# and a bad rebase can silently re-expose the IDE (see docs/plans/03-merge-tax-ledger.md, "Where
# the residual tax actually lives"). Most fail *soft* (cosmetic), a few fail *unsafe* (the IDE
# reappears). This script asserts each seam mechanically so the checklist is executable, not tribal
# knowledge. It exits non-zero naming the first broken seam.
#
# Run from anywhere; it resolves the repo root itself. Wire it next to valid-layers-check.
#
# Usage: ./scripts/check-seams.sh

set -u

# Resolve repo root (this script lives in <root>/scripts).
if [[ "${OSTYPE:-}" == "darwin"* ]]; then
	_abspath() { [[ $1 = /* ]] && echo "$1" || echo "$PWD/${1#./}"; }
	ROOT=$(dirname "$(dirname "$(_abspath "$0")")")
else
	ROOT=$(dirname "$(dirname "$(readlink -f "$0")")")
fi
cd "$ROOT" || { echo "check-seams: cannot cd to repo root" >&2; exit 2; }

FAILURES=0

# fail SEAM MESSAGE - record a broken seam and keep going so one run reports every break.
fail() {
	echo "  FAIL [$1] $2" >&2
	FAILURES=$((FAILURES + 1))
}

# grep_has FILE PATTERN - true when PATTERN (extended regex) is found in FILE.
grep_has() { grep -Eq -- "$2" "$1" 2>/dev/null; }

LDC="src/vs/workbench/contrib/livingDocs/browser/livingDocs.contribution.ts"
STUDIO_CSS="src/vs/workbench/contrib/styleOverrides/browser/media/studio.css"
ACTIVITYBAR="src/vs/workbench/browser/parts/activitybar/activitybarPart.ts"
BUILTIN_SCANNER="src/vs/workbench/services/extensionManagement/browser/builtinExtensionsScannerService.ts"
CMD_PALETTE="src/vs/workbench/contrib/quickaccess/browser/commandsQuickAccess.ts"
QUICK_OPEN="src/vs/workbench/browser/actions/quickAccessActions.ts"
SASH="src/vs/base/browser/ui/sash/sash.ts"

echo "check-seams: verifying the merge-tax ledger's shell seams..."

# --- Seam 1: the five deregistered IDE view containers (HIGH / fails UNSAFE - the IDE icon reappears) ---
# Each id must (a) be present in our deregister list, and (b) still be registered upstream somewhere
# OTHER than our contribution (so the deregister still targets a real container). If upstream renames
# a container, (b) fails here loudly instead of the icon silently returning to the activity bar.
CONTAINER_IDS=(workbench.view.explorer workbench.view.search workbench.view.scm workbench.view.debug workbench.view.extensions)
for id in "${CONTAINER_IDS[@]}"; do
	if ! grep_has "$LDC" "'${id}'"; then
		fail "deregister-list" "container id '${id}' is missing from IDE_VIEW_CONTAINER_IDS in $LDC"
	fi
	# "still exists upstream": the id appears in at least one core file that is NOT our contribution.
	if ! grep -Erq --include=*.ts -- "'${id}'" src/vs --exclude-dir=livingDocs; then
		fail "deregister-upstream" "container id '${id}' no longer appears upstream - the deregister may target a renamed/removed container"
	fi
done
# The deregister loop itself must still run over the list.
if ! grep_has "$LDC" "for \(const id of IDE_VIEW_CONTAINER_IDS\)"; then
	fail "deregister-loop" "the IDE_VIEW_CONTAINER_IDS deregister loop is gone from $LDC"
fi

# --- Seam 2: the 76px activity-bar width (core-patch, v2 iter 9) ---
if ! grep_has "$ACTIVITYBAR" "ACTIVITYBAR_WIDTH = 76"; then
	fail "activitybar-width" "ACTIVITYBAR_WIDTH is no longer 76 in $ACTIVITYBAR (the labeled 76px nav layout will break)"
fi

# --- Seam 3: the builtin-extension denylist (core-patch, v2 iter 6) ---
for id in vscode.emmet vscode.git-base vscode.merge-conflict; do
	if ! grep_has "$BUILTIN_SCANNER" "$id"; then
		fail "builtin-denylist" "'${id}' is missing from LIVING_DOCS_EXCLUDED_BUILTINS in $BUILTIN_SCANNER"
	fi
done
if ! grep_has "$BUILTIN_SCANNER" "bundledExtensions = bundledExtensions\.filter"; then
	fail "builtin-denylist-filter" "the LIVING_DOCS_EXCLUDED_BUILTINS filter is gone from $BUILTIN_SCANNER (excluded builtins will 404 again)"
fi

# --- Seam 4: the palette + quick-open keybindings stay REMOVED (core-patch, v3 iter 2) ---
# ShowAllCommandsAction must carry f1:false and NOT re-register a keybinding (Cmd/Ctrl+Shift+P, F1).
if ! grep_has "$CMD_PALETTE" "f1: false"; then
	fail "palette-f1" "ShowAllCommandsAction no longer sets f1:false in $CMD_PALETTE (the command palette re-lists)"
fi
# A rebase that restores keybinding wiring would add KeybindingsRegistry / a keybinding to this action's
# constructor - guard against the palette chord returning.
if grep -A12 "class ShowAllCommandsAction" "$CMD_PALETTE" | grep -Eq "keybinding:|primary:|KeyMod\."; then
	fail "palette-keybinding" "a keybinding reappeared on ShowAllCommandsAction in $CMD_PALETTE (Cmd+Shift+P / F1 back)"
fi
# Quick Open (Go to File) must keep f1:false so command mode (the '>' prefix) is unreachable.
if ! grep -A20 "id: 'workbench.action.quickOpen'," "$QUICK_OPEN" | grep -q "f1: false"; then
	fail "quickopen-f1" "workbench.action.quickOpen no longer sets f1:false in $QUICK_OPEN (Cmd+P / command mode back)"
fi

# --- Seam 5: the global sash lock (core-patch, v3 iter 2 - no user-draggable layout dividers) ---
if ! grep_has "$SASH" "export function lockAllSashes"; then
	fail "sash-lock-fn" "lockAllSashes() is gone from $SASH (layout sashes become draggable again)"
fi
if ! grep_has "$LDC" "lockAllSashes\(\)"; then
	fail "sash-lock-call" "the lockAllSashes() call site is gone from $LDC (the lock is never applied)"
fi

# --- Seam 6: the studio.css chrome-removal + labeled-nav selectors (styleOverrides, fail-soft) ---
STUDIO_SELECTORS=(
	".editor-group-watermark"
	".editor-group-container > .title"
	".part.auxiliarybar > .composite.title"
	".part.activitybar"
)
for sel in "${STUDIO_SELECTORS[@]}"; do
	if ! grep -Fq -- "$sel" "$STUDIO_CSS"; then
		fail "studio-css" "the studio.css selector '${sel}' is gone (residual IDE chrome may show through)"
	fi
done

# --- Seam 7: the shell-identity config defaults (settings, plan 33 iters 1-2, fail-soft) ---
IDENTITY_DEFAULTS=(
	"'window.commandCenter': false"
	"'workbench.layoutControl.enabled': false"
	"'workbench.editor.editorActionsLocation': 'hidden'"
)
for def in "${IDENTITY_DEFAULTS[@]}"; do
	if ! grep -Fq -- "$def" "$LDC"; then
		fail "identity-defaults" "the config default \"${def}\" is gone from $LDC (title-bar IDE chrome returns)"
	fi
done
if ! grep_has "$LDC" "'window.title':"; then
	fail "window-title" "the branded window.title default is gone from $LDC"
fi
# The project-name marker stays hidden plumbing (plan 33 iter 2).
if ! grep_has "$LDC" "\.abstract-name"; then
	fail "project-name-marker" "the .abstract-name files.exclude default is gone from $LDC (the marker leaks into the file list)"
fi

# --- Seam 8: IDE chords stay neutralised on our surfaces (additive contribution, plan 33 iter 3) ---
# The keyboard audit neutralises the leaking IDE chords via a shadowing no-op keybinding contribution.
if ! grep_has "$LDC" "NeutraliseIdeChords|neutralise.*[Cc]hord|lwd.noop|livingDocs\.noopChord"; then
	fail "ide-chord-neutralise" "the IDE-chord neutralisation (plan 33 iter 3) is gone from $LDC (Cmd+J panel / terminal chords leak again)"
fi

echo ""
if [[ $FAILURES -eq 0 ]]; then
	echo "check-seams: OK - all shell seams intact."
	exit 0
else
	echo "check-seams: ${FAILURES} broken seam(s) - re-pin per docs/plans/03-merge-tax-ledger.md before shipping." >&2
	exit 1
fi
