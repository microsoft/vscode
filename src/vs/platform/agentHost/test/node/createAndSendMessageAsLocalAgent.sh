#!/usr/bin/env bash
# --------------------------------------------------------------------------------------------
# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License. See License.txt in the project root for license information.
# --------------------------------------------------------------------------------------------

# Launches Code OSS, switches to Local Agent mode, sends a chat message,
# waits for the response, and prints it to stdout.
#
# Usage:
#   ./createAndSendMessageAsLocalAgent.sh "Hello, what can you do?"
#   ./createAndSendMessageAsLocalAgent.sh --port 9225 "Explain this code"
#
# Options:
#   --port <N>       CDP debugging port (default: 9224)
#   --timeout <N>    Seconds to wait for response (default: 30)
#   --no-kill        Don't kill Code OSS after the test
#   --skip-launch    Assume Code OSS is already running on the given port
#
# Requires: agent-browser (npm install -g agent-browser, or use npx)

set -e

ROOT="$(cd "$(dirname "$0")/../../../../../.." && pwd)"
CDP_PORT=9224
RESPONSE_TIMEOUT=30
KILL_AFTER=true
SKIP_LAUNCH=false
MESSAGE=""

# Parse arguments
while [[ $# -gt 0 ]]; do
	case "$1" in
		--port)
			CDP_PORT="$2"
			shift 2
			;;
		--timeout)
			RESPONSE_TIMEOUT="$2"
			shift 2
			;;
		--no-kill)
			KILL_AFTER=false
			shift
			;;
		--skip-launch)
			SKIP_LAUNCH=true
			shift
			;;
		-*)
			echo "Unknown option: $1" >&2
			exit 1
			;;
		*)
			MESSAGE="$1"
			shift
			;;
	esac
done

if [ -z "$MESSAGE" ]; then
	echo "Usage: $0 [--port <N>] [--timeout <N>] [--no-kill] [--skip-launch] <message>" >&2
	exit 1
fi

AB="npx agent-browser"

cleanup() {
	if [ "$KILL_AFTER" = true ] && [ "$SKIP_LAUNCH" = false ]; then
		$AB close 2>/dev/null || true
		local PID
		PID=$(lsof -t -i :"$CDP_PORT" 2>/dev/null || true)
		if [ -n "$PID" ]; then
			kill "$PID" 2>/dev/null || true
		fi
	fi
}
trap cleanup EXIT

# ---- Step 1: Launch Code OSS ------------------------------------------------

if [ "$SKIP_LAUNCH" = false ]; then
	# Check if already running
	if lsof -i :"$CDP_PORT" >/dev/null 2>&1; then
		echo "ERROR: Port $CDP_PORT already in use. Use --skip-launch or --port <other>" >&2
		exit 1
	fi

	echo "Launching Code OSS on CDP port $CDP_PORT..." >&2
	cd "$ROOT"
	VSCODE_SKIP_PRELAUNCH=1 ./scripts/code.sh --remote-debugging-port="$CDP_PORT" &>/dev/null &

	# Wait for it to start
	echo "Waiting for Code OSS to start..." >&2
	for i in $(seq 1 20); do
		if $AB connect "$CDP_PORT" 2>/dev/null; then
			break
		fi
		sleep 2
		if [ "$i" -eq 20 ]; then
			echo "ERROR: Code OSS did not start within 40 seconds" >&2
			exit 1
		fi
	done
else
	echo "Connecting to existing Code OSS on port $CDP_PORT..." >&2
	$AB connect "$CDP_PORT" 2>/dev/null || {
		echo "ERROR: Cannot connect to Code OSS on port $CDP_PORT" >&2
		exit 1
	}
fi

echo "Connected to Code OSS" >&2

# ---- Step 2: Switch to Local Agent mode -------------------------------------

# Check current session target
CURRENT_TARGET=$($AB snapshot -i 2>&1 | grep "Set Session Target" | head -1)

if ! echo "$CURRENT_TARGET" | grep -q "Local Agent"; then
	echo "Switching to Local Agent mode..." >&2

	# Find and click the session target button
	TARGET_REF=$($AB snapshot -i 2>&1 | grep "Set Session Target" | head -1 | grep -o 'ref=e[0-9]*' | head -1 | sed 's/ref=//')
	if [ -z "$TARGET_REF" ]; then
		echo "ERROR: Cannot find session target button" >&2
		exit 1
	fi
	$AB click "@$TARGET_REF" 2>/dev/null
	sleep 0.5

	# Navigate to Local Agent via arrow keys
	# Menu items: Local (checked), Copilot CLI, Cloud, Local Agent, ...
	$AB press ArrowDown 2>/dev/null  # Copilot CLI
	$AB press ArrowDown 2>/dev/null  # Cloud
	$AB press ArrowDown 2>/dev/null  # Local Agent
	$AB press Enter 2>/dev/null
	sleep 0.5

	# Verify
	VERIFY=$($AB snapshot -i 2>&1 | grep "Set Session Target" | head -1)
	if echo "$VERIFY" | grep -q "Local Agent"; then
		echo "Switched to Local Agent mode" >&2
	else
		echo "WARNING: Could not confirm Local Agent mode. Current: $VERIFY" >&2
	fi
else
	echo "Already in Local Agent mode" >&2
fi

# ---- Step 3: Focus chat input and type message ------------------------------

echo "Sending message: $MESSAGE" >&2

# Focus chat input via JavaScript mouse events (universal approach)
$AB eval '
(() => {
	const sidebar = document.querySelector(".part.auxiliarybar");
	if (!sidebar) return "no sidebar";
	const inputPart = sidebar.querySelector(".interactive-input-part");
	if (!inputPart) return "no input part";
	const editor = inputPart.querySelector(".monaco-editor");
	if (!editor) return "no editor";
	const rect = editor.getBoundingClientRect();
	const x = rect.x + rect.width / 2;
	const y = rect.y + rect.height / 2;
	editor.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: x, clientY: y }));
	editor.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, clientX: x, clientY: y }));
	editor.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: x, clientY: y }));
	return "focused";
})()' >/dev/null 2>&1

sleep 0.3

# Clear any existing text
$AB press Meta+a 2>/dev/null
$AB press Backspace 2>/dev/null

# Type message character by character
for (( i=0; i<${#MESSAGE}; i++ )); do
	CHAR="${MESSAGE:$i:1}"
	case "$CHAR" in
		" ") $AB press Space 2>/dev/null ;;
		"?") $AB press Shift+/ 2>/dev/null ;;
		"!") $AB press Shift+1 2>/dev/null ;;
		",") $AB press , 2>/dev/null ;;
		".") $AB press . 2>/dev/null ;;
		"'") $AB press "'" 2>/dev/null ;;
		'"') $AB press 'Shift+'"'" 2>/dev/null ;;
		*)   $AB press "$CHAR" 2>/dev/null ;;
	esac
done

# Verify text entered
ENTERED=$($AB eval '
(() => {
	const sidebar = document.querySelector(".part.auxiliarybar");
	const viewLines = sidebar?.querySelectorAll(".interactive-input-editor .view-line");
	return Array.from(viewLines || []).map(vl => vl.textContent).join("");
})()' 2>&1 | tr -d '"')

echo "Entered text: $ENTERED" >&2

# Send the message
$AB press Enter 2>/dev/null

# ---- Step 4: Wait for response ----------------------------------------------

echo "Waiting for response (timeout: ${RESPONSE_TIMEOUT}s)..." >&2

RESPONSE=""
for i in $(seq 1 "$RESPONSE_TIMEOUT"); do
	sleep 1
	RESPONSE=$($AB eval '
(() => {
	const sidebar = document.querySelector(".part.auxiliarybar");
	if (!sidebar) return "";
	const items = sidebar.querySelectorAll(".interactive-item-container");
	if (items.length < 2) return "";
	// Last item is the response
	const lastItem = items[items.length - 1];
	const text = lastItem.textContent || "";
	// Check if it looks like a complete response (has content beyond the header)
	if (text.length > 20) return text;
	return "";
})()' 2>&1 | sed 's/^"//;s/"$//')

	if [ -n "$RESPONSE" ]; then
		break
	fi
done

if [ -z "$RESPONSE" ]; then
	echo "ERROR: No response received within ${RESPONSE_TIMEOUT}s" >&2
	exit 1
fi

# ---- Step 5: Output response ------------------------------------------------

echo "---" >&2
echo "$RESPONSE"
