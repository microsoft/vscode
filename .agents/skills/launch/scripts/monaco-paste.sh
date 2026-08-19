#!/usr/bin/env bash
# monaco-paste.sh — insert text into the Code OSS chat input (Monaco) via
# the currently-attached @playwright/cli connection. Synthesizes a
# ClipboardEvent('paste') with a DataTransfer payload — no system
# clipboard involved, so safe to use against multiple parallel Code OSS
# instances (each subagent's @playwright/cli attaches to its own CDP).
#
# Why this exists: VS Code Monaco's `native-edit-context` element doesn't
# react to `@playwright/cli`'s `fill` or `type`. The pbcopy+press alternative
# works for one instance but `pbcopy` writes the system-wide NSPasteboard,
# so two parallel callers can stomp each other's clipboards.
#
# Usage:
#   echo "the prompt text" | scripts/monaco-paste.sh
#   scripts/monaco-paste.sh "the prompt text"
#   scripts/monaco-paste.sh --append "additional text"   # don't clear first
#   scripts/monaco-paste.sh --no-verify "..."            # skip read-back check
#   scripts/monaco-paste.sh --session NAME "..."         # use a named @playwright/cli session
#                                                        # (also honored via $PW_SESSION env var;
#                                                        #  required for parallel multi-instance runs
#                                                        #  — see SKILL.md "Typing into Monaco")
#
# Stdout: a single JSON line, e.g.
#   {"ok":true,"actualLength":47,"expectedLength":47,"viewLineCount":1,"firstViewLine":"..."}
# Stderr: diagnostic noise from @playwright/cli (suppressed unless caller wants it).
# Exit code:
#   0  success
#   1  paste verify failed, eval failed, or the page had no native-edit-context
#   2  argument/usage error (empty input, missing tools)
#
# Required tools on PATH: npx (with @playwright/cli reachable), node, jq.
#
# Assumes:
#   - You have already run `npx @playwright/cli [-s=NAME] attach --cdp=http://127.0.0.1:$CDP`
#     in the same session this script reads (--session arg, $PW_SESSION env, or "default").
#   - The Agents window is open and a new-chat / chat view with a Monaco
#     editor is on screen. The script auto-focuses the first
#     `.new-chat-input-area .native-edit-context`, falling back to any
#     `.native-edit-context`.

set -u
umask 077

APPEND=0
VERIFY=1
TEXT_ARG=""
PW_SESSION_OVERRIDE=""
while [[ $# -gt 0 ]]; do
	case "$1" in
		--append) APPEND=1; shift ;;
		--no-verify) VERIFY=0; shift ;;
		--session) PW_SESSION_OVERRIDE="$2"; shift 2 ;;
		--session=*) PW_SESSION_OVERRIDE="${1#--session=}"; shift ;;
		-h|--help)
			sed -n '2,40p' "$0" | sed 's/^# \{0,1\}//'
			exit 0 ;;
		--) shift; TEXT_ARG="${*-}"; break ;;
		-*) echo "monaco-paste.sh: unknown flag $1" >&2; exit 2 ;;
		*) TEXT_ARG="$1"; shift ;;
	esac
done

# Resolve session: --session arg wins, then $PW_SESSION, then empty (cli default).
SESSION="${PW_SESSION_OVERRIDE:-${PW_SESSION:-}}"
PW_ARGS=()
[[ -n "$SESSION" ]] && PW_ARGS=("-s=$SESSION")

# Text: prefer the positional arg; otherwise read all of stdin.
# Stdin is preferred for arbitrary text because it avoids any shell
# quoting issues with backticks, $, ", newlines, etc.
if [[ -n "${TEXT_ARG:-}" ]]; then
	TEXT="$TEXT_ARG"
else
	TEXT=$(cat)
fi

if [[ -z "$TEXT" ]]; then
	echo '{"ok":false,"error":"empty input"}' >&2
	exit 2
fi

# Sanity: required tools on PATH.
for tool in npx node jq; do
	if ! command -v "$tool" >/dev/null 2>&1; then
		printf '{"ok":false,"error":"%s not on PATH"}\n' "$tool"
		echo "monaco-paste.sh: required tool '$tool' not on PATH" >&2
		exit 2
	fi
done

# Pick the platform-appropriate "select all" modifier. macOS uses Cmd
# (Meta), everything else uses Ctrl. Done in the host shell so it
# applies to the `press` calls below — Monaco itself respects both
# bindings, but @playwright/cli only sends what we ask it to.
case "${OSTYPE:-$(uname -s)}" in
	darwin*|Darwin*) SELECT_ALL_MOD="Meta" ;;
	*)               SELECT_ALL_MOD="Control" ;;
esac

# Step 1 (optional): clear the focused Monaco editor by select-all + delete.
# Done via the CLI's `press` so the keys flow through Monaco's real key
# handler. Stays inside the CDP connection — no system clipboard.
if [[ "$APPEND" != "1" ]]; then
	npx @playwright/cli ${PW_ARGS[@]+"${PW_ARGS[@]}"} press "${SELECT_ALL_MOD}+a" >/dev/null 2>&1 || true
	npx @playwright/cli ${PW_ARGS[@]+"${PW_ARGS[@]}"} press Backspace >/dev/null 2>&1 || true
fi

# Step 2: build the eval payload via node so JSON escaping is automatic.
# The async IIFE waits two requestAnimationFrames after dispatch — Monaco
# updates its view-line DOM asynchronously, so a same-tick read-back
# returns stale state. Two rAFs = full paint cycle.
JS=$(node -e '
	const text = process.argv[1];
	const verify = process.argv[2] === "1";
	console.log(`(async () => {
		const root = document.querySelector(".new-chat-input-area .native-edit-context")
				  || document.querySelector(".sessions-chat-editor .native-edit-context")
				  || document.querySelector(".native-edit-context");
		if (!root) return JSON.stringify({ ok: false, error: "no native-edit-context found on page" });
		root.focus();
		const dt = new DataTransfer();
		dt.setData("text/plain", ${JSON.stringify(text)});
		root.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
		await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
		const editor = root.closest(".monaco-editor");
		const viewLines = Array.from(editor.querySelectorAll(".view-line")).map(l => l.textContent);
		// Monaco renders regular ASCII spaces as U+00A0 (NBSP) in view-lines for
		// visual fidelity. Also, joining view-lines drops the logical newlines
		// between them. Normalize both sides before comparing.
		// (Note: \\u00A0 and \\r\\n are double-escaped because this string lives
		// inside a node template literal that would otherwise resolve them.)
		const norm = s => s.replace(/\\u00A0/g, " ").replace(/\\r?\\n/g, "");
		const joined = norm(viewLines.join(""));
		const actualLength = joined.length;
		const expectedFull = norm(${JSON.stringify(text)});
		const expectedPrefix = expectedFull.slice(0, Math.min(40, expectedFull.length));
		const prefixMatched = joined.startsWith(expectedPrefix) || joined.includes(expectedPrefix.slice(0, 20));
		const verifyEnabled = ${verify ? "true" : "false"};
		return JSON.stringify({
			ok: !verifyEnabled || prefixMatched,
			actualLength,
			expectedLength: ${JSON.stringify(text)}.length,
			viewLineCount: viewLines.length,
			firstViewLine: (viewLines[0] || "").slice(0, 80),
			error: (!verifyEnabled || prefixMatched) ? undefined : "paste read-back did not match expected prefix"
		});
	})()`);
' "$TEXT" "$VERIFY")

# Step 3: run the eval. The CLI prints "### Result" then a JSON-encoded
# string on the next line, followed by "### Ran Playwright code" noise.
RAW=$(npx @playwright/cli ${PW_ARGS[@]+"${PW_ARGS[@]}"} eval "$JS" 2>&1) || {
	echo "{\"ok\":false,\"error\":\"@playwright/cli eval failed\"}"
	echo "$RAW" >&2
	exit 1
}

RESULT_LINE=$(echo "$RAW" | grep -A 1 '### Result' | tail -n1)
if [[ -z "$RESULT_LINE" ]]; then
	echo '{"ok":false,"error":"no ### Result section in eval output"}'
	echo "$RAW" >&2
	exit 1
fi

# RESULT_LINE is a JSON-encoded string containing our inner JSON.
# Unwrap once with jq.
CLEAN=$(echo "$RESULT_LINE" | jq -r 'fromjson' 2>/dev/null) || {
	echo "{\"ok\":false,\"error\":\"failed to parse result line\",\"raw\":$(echo "$RESULT_LINE" | jq -Rs .)}"
	exit 1
}

echo "$CLEAN"
OK=$(echo "$CLEAN" | jq -r '.ok')
[[ "$OK" == "true" ]]
