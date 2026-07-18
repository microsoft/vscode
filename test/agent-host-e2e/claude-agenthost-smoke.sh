#!/usr/bin/env bash
#---------------------------------------------------------------------------------------------
# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License. See License.txt in the project root for license information.
#---------------------------------------------------------------------------------------------
#
# Claude Agent Host — live E2E smoke tests	 (AUTH REQUIRED)
#
# Validates the C9 immutable-pipeline / session-orchestrated-rebuild lifecycle against a REAL
# authenticated Agents window. Unlike the node unit suites (which use an SDK fake), this drives
# the real workbench + a real Claude SDK subprocess and asserts on ground truth:
#		* agenthost.log		— `startup isResume=<bool>` / `result` / abort markers
#		* `ps`						— the number of live SDK subprocesses for THIS instance
#
# Scenarios:
#		1. materialize						— first turn spawns exactly one subprocess (isResume=false)
#		2. multi-turn reuse				— more turns reuse the SAME subprocess (no new startup)
#		3. recover-rebuild				— abort → next send rebuilds in resume mode (isResume=true)
#		4. abort-churn / orphans	— rapid abort→rebuild cycles never leak a subprocess (count<=1),
#																reap on abort, hit no <id>.jsonl two-writer conflict, stay usable
#
# Requirements: an authenticated ~/.vscode-oss-dev profile, `@playwright/cli` (devDependency),
#								`jq`, and the launch skill (see --launch / $CLAUDE_LAUNCH_SH).
#
# Usage:
#		test/agent-host-e2e/claude-agenthost-smoke.sh [--cycles N] [--cdp PORT] [--keep] [-v]
#			--cycles N	 abort-churn cycles (default 4)
#			--cdp PORT	 attach to an already-running Agents window instead of launching one
#			--keep			 do not kill the launched window / leave it open on exit
#			-v					 verbose (echo every phase's counters)
#
# Exit code is the number of failed assertions (0 = all green).

set -uo pipefail

# ── config / args ────────────────────────────────────────────────────────────
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LAUNCH_SH="${CLAUDE_LAUNCH_SH:-$REPO_ROOT/.claude/skills/launch/scripts/launch.sh}"
SDKPAT="$(basename "$REPO_ROOT")/node_modules/@anthropic-ai/claude-agent-sdk"
S="claude-smoke-$$"												# unique playwright-cli daemon session
CYCLES=4 ; CDP="" ; KEEP=0 ; VERBOSE=0 ; APP_PID="" ; RUN=""

while [ $# -gt 0 ]; do
	case "$1" in
		--cycles) CYCLES="$2"; shift 2;;
		--cdp) CDP="$2"; shift 2;;
		--keep) KEEP=1; shift;;
		-v|--verbose) VERBOSE=1; shift;;
		*) echo "unknown arg: $1"; exit 2;;
	esac
done
cd "$REPO_ROOT"

# ── assertion framework ──────────────────────────────────────────────────────
PASS=0 ; FAIL=0 ; declare -a FAILURES=()
ok()	{ echo "		✓ $1"; PASS=$((PASS+1)); }
bad() { echo "		✗ $1"; FAIL=$((FAIL+1)); FAILURES+=("$1"); }
assert_eq() { if [ "$2" = "$3" ]; then ok "$1 (= $2)"; else bad "$1: expected '$3', got '$2'"; fi; }
assert_le() { if [ "$2" -le "$3" ] 2>/dev/null; then ok "$1 ($2 <= $3)"; else bad "$1: $2 > $3"; fi; }
assert_ge() { if [ "$2" -ge "$3" ] 2>/dev/null; then ok "$1 ($2 >= $3)"; else bad "$1: $2 < $3"; fi; }

# ── ground-truth getters ─────────────────────────────────────────────────────
logf()		 { find "$RUN/user-data/logs" -iname agenthost.log 2>/dev/null | head -1; }
# Only count SDK subprocesses NEW since script start, so a prior run's process still
# flushing its transcript (they linger a few seconds after the window is killed) can't
# pollute this run's orphan accounting.
BASELINE_SDK=""
_sdk_all() { pgrep -f "$SDKPAT" 2>/dev/null | sort -u; }
sdkcount() { comm -23 <(_sdk_all) <(printf '%s\n' "$BASELINE_SDK" | sort -u) | grep -c . | tr -d ' '; }
sdkpids()	 { comm -23 <(_sdk_all) <(printf '%s\n' "$BASELINE_SDK" | sort -u) | tr '\n' ' '; }
g_startups() { local L; L=$(logf); { [ -n "$L" ] && grep -c 'startup isResume=' "$L"; } 2>/dev/null | head -1; }
g_results()	 { local L; L=$(logf); { [ -n "$L" ] && grep -c 'result for sdkUuid' "$L"; } 2>/dev/null | head -1; }
g_cancels()	 { local L; L=$(logf); { [ -n "$L" ] && grep -cE 'turnCancelled|aborted by user' "$L"; } 2>/dev/null | head -1; }
g_resumes()	 { local L; L=$(logf); { [ -n "$L" ] && grep -c 'startup isResume=true' "$L"; } 2>/dev/null | head -1; }
g_conflicts(){ local L; L=$(logf); [ -z "$L" ] && { echo 0; return; }; grep -icE "EEXIST|\.jsonl.{0,15}(already|exist|lock)|failed to spawn|leaked disposable|double dispose" "$L" 2>/dev/null | head -1; }

# ── playwright primitives (eval-based DOM clicks — robust to ref churn) ───────
PW() { npx @playwright/cli -s="$S" "$@" 2>/dev/null; }
click_send() {
	PW eval '() => { const b=[...document.querySelectorAll("a,button,[role=button]")].find(x=>{const n=(x.getAttribute("aria-label")||x.textContent||"").trim(); const dis=x.getAttribute("aria-disabled")==="true"||x.disabled||x.classList.contains("disabled"); return /^send/i.test(n)&&!dis;}); if(!b)return "NO"; b.click(); return "OK"; }' 2>/dev/null | grep -oE "OK|NO" | head -1
}
click_cancel() {
	PW eval '() => { const b=[...document.querySelectorAll("a,button,[role=button]")].find(x=>/cancel/i.test((x.getAttribute("aria-label")||x.textContent||"").trim())); if(!b)return "NO"; b.click(); return "OK"; }' 2>/dev/null | grep -oE "OK|NO" | head -1
}
# focus the composer's monaco input (by its a11y label, else the lowest visible editor).
focus_editor() {
	PW eval '() => {
		const all=[...document.querySelectorAll("textarea, .native-edit-context, [contenteditable=true]")].filter(e=>e.offsetParent!==null);
		let el=all.find(e=>/editor is not accessible/i.test(e.getAttribute("aria-label")||""));
		if(!el && all.length){ all.sort((a,b)=>b.getBoundingClientRect().top-a.getBoundingClientRect().top); el=all[0]; }
		if(!el) return "NO"; el.focus(); return "OK";
	}' 2>/dev/null | grep -oE "OK|NO" | head -1
}
# send <text>: focus + clear + real-clipboard paste, then click Send (retry the whole thing).
send() {
	local i
	printf '%s' "$1" | pbcopy
	for i in $(seq 1 8); do
		focus_editor >/dev/null
		PW press Meta+a >/dev/null 2>&1 ; PW press Backspace >/dev/null 2>&1	 # clear any stale text
		PW press Meta+v >/dev/null 2>&1
		sleep 0.5
		[ "$(click_send)" = "OK" ] && return 0
		sleep 0.3
	done
	return 1
}
# wait_inc <getter-fn> <baseline> <timeout-s>: succeed when getter exceeds baseline.
wait_inc() { local g="$1" base="$2" t="$3" i; for i in $(seq 1 $((t*2))); do [ "$($g)" -gt "$base" ] 2>/dev/null && return 0; sleep 0.5; done; return 1; }

MAX_SDK=0
track() { [ "$1" -gt "$MAX_SDK" ] 2>/dev/null && MAX_SDK="$1"; [ "$VERBOSE" = 1 ] && echo "			 · sdk=$1 startups=$(g_startups) results=$(g_results) cancels=$(g_cancels)" >&2; return 0; }

LONG='List every integer from 1 to 500, one number on each line, and output nothing else.'

# ── lifecycle ────────────────────────────────────────────────────────────────
cleanup() {
	PW close >/dev/null 2>&1 || true
	if [ "$KEEP" = 0 ] && [ -n "$APP_PID" ]; then kill "$APP_PID" 2>/dev/null || true; fi
}
trap cleanup EXIT

launch_or_attach() {
	if [ -n "$CDP" ]; then
		echo "▸ attaching to existing Agents window on CDP $CDP"
		# caller must also export RUN via $SMOKE_RUN when attaching
		RUN="${SMOKE_RUN:?--cdp requires SMOKE_RUN=<runDir> so the log can be found}"
	else
		echo "▸ launching authenticated Agents window …"
		local json; json="$("$LAUNCH_SH" --agents 2>/dev/null | tail -n1)"
		CDP="$(jq -r .cdpPort <<<"$json")"; APP_PID="$(jq -r .pid <<<"$json")"; RUN="$(jq -r .runDir <<<"$json")"
		[ -n "$CDP" ] && [ "$CDP" != null ] || { echo "launch failed"; exit 3; }
		echo "	cdp=$CDP pid=$APP_PID"
	fi
	PW attach --cdp="http://127.0.0.1:$CDP" >/dev/null 2>&1
	sleep 1
}

# ── scenarios ────────────────────────────────────────────────────────────────
scenario_materialize() {
	echo "▸ [1] materialize"
	send 'Reply with exactly one word: ready' || { bad "materialize: could not submit prompt"; return; }
	wait_inc g_results 0 40 || { bad "materialize: no result within 40s"; return; }
	assert_eq	 "one startup"							"$(g_startups)" "1"
	assert_ge	 "at least one result"			"$(g_results)"	"1"
	assert_eq	 "exactly one subprocess"		"$(sdkcount)"		"1"
	local L; L=$(logf)
	assert_eq	 "first startup is fresh (isResume=false)" "$(grep -m1 -oE 'isResume=(true|false)' "$L")" "isResume=false"
}

scenario_reuse() {
	echo "▸ [2] multi-turn reuse (warm subprocess reused when nothing changed)"
	# The workbench can push a background client-tool / customization sync mid-session, which
	# legitimately dirties the diff and rebuilds on the next send (a correct C9 trigger). So we
	# don't assert "startup never grows" — we prove reuse is achievable: at least one turn runs
	# with NO new startup and the SAME subprocess PID.
	local proven=0 attempt
	for attempt in 1 2 3 4; do
		local st0 pid0 r0; st0="$(g_startups)"; pid0="$(sdkpids)"; r0="$(g_results)"
		send "Reply with exactly one word: reuse$attempt" || { bad "reuse: submit failed"; return; }
		wait_inc g_results "$r0" 40 || { bad "reuse: no result on turn $attempt"; return; }
		if [ "$(g_startups)" = "$st0" ] && [ "$(sdkpids)" = "$pid0" ]; then proven=1; break; fi
	done
	if [ "$proven" = 1 ]; then ok "a turn reused the warm subprocess (no new startup, same PID)"
	else bad "no clean reuse observed across 4 turns"; fi
	assert_le "still at most one subprocess" "$(sdkcount)" "1"
}

# hold a turn open, abort it (retry until a cancel is logged or the turn completes).
_abort_inflight() {
	local c0; c0="$(g_cancels)"; local r0="$1" a
	for a in $(seq 1 6); do
		click_cancel >/dev/null
		sleep 1.5
		[ "$(g_cancels)" -gt "$c0" ] 2>/dev/null && return 0		# abort landed
		[ "$(g_results)" -gt "$r0" ] 2>/dev/null && return 1		# model finished first
	done
	return 2
}

scenario_recover_rebuild() {
	echo "▸ [3] recover-rebuild (abort → resume-mode rebuild)"
	local st0 res0 r0; st0="$(g_startups)"; res0="$(g_resumes)"; r0="$(g_results)"
	send "$LONG" || { bad "recover: submit failed"; return; }
	sleep 2; track "$(sdkcount)"
	_abort_inflight "$r0"
	case $? in
		0) ok "abort landed (cancel logged)";;
		1) echo "		 ~ model completed before abort — retrying once with a longer hold";
				r0="$(g_results)"; send "$LONG" && { sleep 1; _abort_inflight "$r0" && ok "abort landed on retry" || bad "recover: could not abort a turn"; } || bad "recover: resend failed";;
		*) bad "recover: no cancel button appeared";;
	esac
	sleep 2
	# next send must rebuild in resume mode
	local rr0; rr0="$(g_results)"
	send 'Reply with exactly one word: recovered' || { bad "recover: post-abort submit failed"; return; }
	wait_inc g_results "$rr0" 40 || { bad "recover: session not usable after abort"; return; }
	assert_ge "a new startup happened (rebuild)"		 "$(g_startups)" "$((st0+1))"
	assert_ge "the rebuild used resume mode (isResume=true)" "$(g_resumes)" "$((res0+1))"
	assert_eq "one subprocess after recovery"				 "$(sdkcount)"	 "1"
}

scenario_abort_churn() {
	echo "▸ [4] abort-churn × $CYCLES (orphan / two-writer invariants)"
	local res0 n; res0="$(g_resumes)"
	for n in $(seq 1 "$CYCLES"); do
		[ "$VERBOSE" = 1 ] && echo "		cycle $n"
		local r0; r0="$(g_results)"
		send "$LONG" || { echo "		~ cycle $n submit failed, skipping"; continue; }
		sleep 1.5
		local cif; cif="$(sdkcount)"; track "$cif"
		assert_le "cycle $n in-flight: subprocess count" "$cif" "1"
		_abort_inflight "$r0" >/dev/null
		sleep 3
		local cpa; cpa="$(sdkcount)"; track "$cpa"
		assert_le "cycle $n post-abort: subprocess count" "$cpa" "1"
	done
	# final invariants across the whole churn
	assert_le "peak concurrent subprocesses never exceeded 1" "$MAX_SDK" "1"
	assert_eq "zero <id>.jsonl / spawn-conflict / leak errors" "$(g_conflicts)" "0"
	# Recover-rebuilds under churn are informational: whether a given cycle's abort wins the
	# race with the model is timing-dependent, and scenario [3] already proves resume-mode
	# rebuild deterministically. Here we just report how many the churn happened to exercise.
	echo "		· recover-rebuilds exercised during churn: $(( $(g_resumes) - res0 ))"
	# session still usable
	local r0; r0="$(g_results)"
	send 'Reply with exactly one word: survived' && wait_inc g_results "$r0" 40 \
		&& ok "session still usable after churn" || bad "session unusable after churn"
}

# ── run ──────────────────────────────────────────────────────────────────────
echo "=== Claude Agent Host — live E2E smoke ($(date +%H:%M:%S)) ==="
BASELINE_SDK="$(_sdk_all)"				# exclude any pre-existing (other-run) SDK subprocesses
launch_or_attach
scenario_materialize
scenario_reuse
scenario_recover_rebuild
scenario_abort_churn

echo ""
echo "=== summary: $PASS passed, $FAIL failed	 (peak subprocs=$MAX_SDK) ==="
if [ "$FAIL" -gt 0 ]; then printf '	 FAILED: %s\n' "${FAILURES[@]}"; fi
exit "$FAIL"
