#!/usr/bin/env bash
# --------------------------------------------------------------------------------------------
# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License. See License.txt in the project root for license information.
# --------------------------------------------------------------------------------------------

# End-to-end smoke test for the remote agent host feature.
#
# Launches a standalone agent host server, starts the Sessions app with
# `chat.remoteAgentHosts` pre-configured to connect to it, validates that
# the Sessions app discovers the remote, and sends a chat message via the
# remote session target.
#
# Usage:
#   ./testRemoteAgentHost.sh
#   ./testRemoteAgentHost.sh "Hello, what can you do?"
#   ./testRemoteAgentHost.sh --server-port 9090 --cdp-port 9225 "Explain this"
#
# Options:
#   --server-port <N>   Agent host WebSocket port (default: 8081)
#   --cdp-port <N>      CDP debugging port for Sessions app (default: 9224)
#   --timeout <N>       Seconds to wait for response (default: 60)
#   --no-kill           Don't kill processes after the test
#   --skip-message      Only validate connection, don't send a message
#
# Requires: agent-browser (npm install -g agent-browser, or use npx)

set -e

ROOT="$(cd "$(dirname "$0")/../../../../../.." && pwd)"
SERVER_PORT=8081
CDP_PORT=9224
RESPONSE_TIMEOUT=60
KILL_AFTER=true
SKIP_MESSAGE=false
MESSAGE=""

# Parse arguments
while [[ $# -gt 0 ]]; do
	case "$1" in
		--server-port)
			SERVER_PORT="$2"
			shift 2
			;;
		--cdp-port)
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
		--skip-message)
			SKIP_MESSAGE=true
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

if [ -z "$MESSAGE" ] && [ "$SKIP_MESSAGE" = false ]; then
	MESSAGE="Hello, what can you do?"
fi

AB="npx agent-browser"
SERVER_PID=""
USERDATA_DIR=""

cleanup() {
	echo "" >&2
	echo "=== Cleanup ===" >&2

	$AB close 2>/dev/null || true

	if [ "$KILL_AFTER" = true ]; then
		# Kill Sessions app
		local CDP_PIDS
		CDP_PIDS=$(lsof -t -i :"$CDP_PORT" 2>/dev/null || true)
		if [ -n "$CDP_PIDS" ]; then
			echo "Killing Sessions app (CDP port $CDP_PORT)..." >&2
			kill $CDP_PIDS 2>/dev/null || true
		fi

		# Kill agent host server
		if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
			echo "Killing agent host server (PID $SERVER_PID)..." >&2
			kill "$SERVER_PID" 2>/dev/null || true
			# Give it a moment, then force-kill if still alive
			sleep 0.5
			if kill -0 "$SERVER_PID" 2>/dev/null; then
				kill -9 "$SERVER_PID" 2>/dev/null || true
			fi
		fi

		# Kill the sleep process that was keeping the server's stdin open.
		# It was started via process substitution and is a child of this shell.
		local SLEEP_PIDS
		SLEEP_PIDS=$(pgrep -P $$ -f "sleep 86400" 2>/dev/null || true)
		if [ -n "$SLEEP_PIDS" ]; then
			kill $SLEEP_PIDS 2>/dev/null || true
		fi

		# Also kill by port in case PID tracking missed it
		local SERVER_PIDS
		SERVER_PIDS=$(lsof -t -i :"$SERVER_PORT" 2>/dev/null || true)
		if [ -n "$SERVER_PIDS" ]; then
			kill $SERVER_PIDS 2>/dev/null || true
		fi
	fi

	# Clean up temp user data dir
	if [ -n "$USERDATA_DIR" ] && [ -d "$USERDATA_DIR" ]; then
		echo "Cleaning up temp user data dir: $USERDATA_DIR" >&2
		rm -rf "$USERDATA_DIR"
	fi
}
trap cleanup EXIT

# ---- Step 1: Start the agent host server ------------------------------------

echo "=== Step 1: Starting agent host server on port $SERVER_PORT ===" >&2

# Ensure port is free
if lsof -i :"$SERVER_PORT" >/dev/null 2>&1; then
	echo "ERROR: Port $SERVER_PORT already in use" >&2
	exit 1
fi
if lsof -i :"$CDP_PORT" >/dev/null 2>&1; then
	echo "ERROR: CDP port $CDP_PORT already in use" >&2
	exit 1
fi

cd "$ROOT"

# Start the server directly using Node (not via code-agent-host.sh which
# spawns a subprocess tree that's harder to manage in background mode).
# Use system node rather than the VS Code-managed node binary which may
# not have been downloaded yet.
SERVER_ENTRY="$ROOT/out/vs/platform/agentHost/node/agentHostServerMain.js"

if [ ! -f "$SERVER_ENTRY" ]; then
	echo "ERROR: Server entry point not found: $SERVER_ENTRY" >&2
	echo "       Run the build first (npm run compile or the watch task)" >&2
	exit 1
fi

# Use a temp file for output and poll for READY.
# The server stays alive until stdin closes (process.stdin.on('end', shutdown)),
# so we keep stdin open using a process substitution with a long sleep.
# This avoids FIFOs and leaked file descriptors that caused cleanup hangs.
SERVER_READY_FILE=$(mktemp)

node "$SERVER_ENTRY" --port "$SERVER_PORT" --quiet --enable-mock-agent \
	< <(sleep 86400) > "$SERVER_READY_FILE" 2>/dev/null &
SERVER_PID=$!

echo "Server PID: $SERVER_PID" >&2

# Poll the output file for the READY line
echo "Waiting for server to start..." >&2
SERVER_ADDR=""
for i in $(seq 1 30); do
	READY_MATCH=$(grep -o 'READY:[0-9]*' "$SERVER_READY_FILE" 2>/dev/null || true)
	if [ -n "$READY_MATCH" ]; then
		READY_PORT=$(echo "$READY_MATCH" | cut -d: -f2)
		SERVER_ADDR="ws://127.0.0.1:${READY_PORT}"
		break
	fi
	sleep 1
done
rm -f "$SERVER_READY_FILE"

if [ -z "$SERVER_ADDR" ]; then
	echo "ERROR: Server did not start within 30 seconds" >&2
	exit 1
fi

echo "Agent host server ready at $SERVER_ADDR" >&2

# ---- Step 2: Prepare user data with remote agent host setting ---------------

echo "=== Step 2: Configuring Sessions app settings ===" >&2

# We use 127.0.0.1:<PORT> as the address (strip ws:// prefix)
REMOTE_ADDR=$(echo "$SERVER_ADDR" | sed 's|^ws://||')

USERDATA_DIR=$(mktemp -d)
SETTINGS_DIR="$USERDATA_DIR/User"
mkdir -p "$SETTINGS_DIR"

cat > "$SETTINGS_DIR/settings.json" << EOF
{
	"chat.remoteAgentHosts": [
		{
			"address": "$REMOTE_ADDR",
			"name": "Test Remote Agent"
		}
	],
	"window.titleBarStyle": "custom"
}
EOF

echo "Settings configured: $SETTINGS_DIR/settings.json" >&2
echo "  Remote address: $REMOTE_ADDR" >&2

# ---- Step 3: Launch Sessions app --------------------------------------------

echo "=== Step 3: Launching Sessions app ===" >&2

cd "$ROOT"
# Unset ELECTRON_RUN_AS_NODE to ensure the app launches as Electron, not Node.
VSCODE_SKIP_PRELAUNCH=1 ELECTRON_RUN_AS_NODE= ./scripts/code.sh \
	--sessions \
	--skip-sessions-welcome \
	--remote-debugging-port="$CDP_PORT" \
	--user-data-dir="$USERDATA_DIR" \
	&>/dev/null &

echo "Waiting for Sessions app to start..." >&2
for i in $(seq 1 30); do
	if $AB connect "$CDP_PORT" 2>/dev/null; then
		break
	fi
	sleep 2
	if [ "$i" -eq 30 ]; then
		echo "ERROR: Sessions app did not start within 60 seconds" >&2
		exit 1
	fi
done

echo "Connected to Sessions app via CDP" >&2

# Give the app a moment to initialize fully
sleep 3

# ---- Step 4: Validate the remote connection appeared -------------------------

echo "=== Step 4: Validating remote agent host connection ===" >&2

# Wait for the remote to appear as a session target
REMOTE_FOUND=false
for i in $(seq 1 20); do
	SNAPSHOT=$($AB snapshot -i 2>&1 || true)

	# Look for the remote in the session target picker or any UI element
	if echo "$SNAPSHOT" | grep -qi "Test Remote Agent\|remote.*agent"; then
		REMOTE_FOUND=true
		break
	fi

	# Also check via DOM for the session target radio containing our remote name
	REMOTE_CHECK=$($AB eval '
(() => {
	const text = document.body.innerText || "";
	if (text.includes("Test Remote Agent")) return "found";
	// Check radio buttons in the session target picker
	const buttons = document.querySelectorAll(".monaco-custom-radio > .monaco-button");
	for (const btn of buttons) {
		if (btn.textContent?.includes("Test Remote Agent")) return "found";
	}
	return "not found";
})()' 2>&1 || true)

	if echo "$REMOTE_CHECK" | grep -q "found"; then
		REMOTE_FOUND=true
		break
	fi

	sleep 2
done

if [ "$REMOTE_FOUND" = true ]; then
	echo "SUCCESS: Remote agent host 'Test Remote Agent' is visible in the Sessions app" >&2
else
	echo "ERROR: Could not find remote agent host 'Test Remote Agent' in the Sessions app UI" >&2
	echo "Snapshot excerpt:" >&2
	echo "$SNAPSHOT" | head -30 >&2
	exit 1
fi

# ---- Step 5: Send a message (optional) --------------------------------------

if [ "$SKIP_MESSAGE" = true ]; then
	echo "=== Skipping message send (--skip-message) ===" >&2
	echo "Remote agent host test completed successfully." >&2
	exit 0
fi

echo "=== Step 5: Switching to remote session target and sending message ===" >&2

# Take a screenshot before interaction
SCREENSHOT_DIR="/tmp/remote-agent-test-$(date +%Y-%m-%dT%H-%M-%S)"
mkdir -p "$SCREENSHOT_DIR"
$AB screenshot "$SCREENSHOT_DIR/01-before-interaction.png" 2>/dev/null || true

# Click the session target radio button for the remote agent host
CLICK_RESULT=$($AB eval '
(() => {
	const buttons = document.querySelectorAll(".monaco-custom-radio > .monaco-button");
	for (const btn of buttons) {
		if (btn.textContent?.includes("Test Remote Agent")) {
			btn.click();
			return "clicked";
		}
	}
	return "not found";
})()' 2>&1 || true)

if echo "$CLICK_RESULT" | grep -q "not found"; then
	echo "ERROR: Could not find 'Test Remote Agent' radio button to click" >&2
	$AB screenshot "$SCREENSHOT_DIR/02-click-failed.png" 2>/dev/null || true
	exit 1
fi
echo "Switched to remote session target" >&2

sleep 1

$AB screenshot "$SCREENSHOT_DIR/02-after-target-switch.png" 2>/dev/null || true

# Fill in the remote folder path input (required for remote sessions)
echo "Setting remote folder path..." >&2
FOLDER_SET=$($AB eval '
(() => {
	const input = document.querySelector("input.sessions-chat-remote-folder-text");
	if (!input) return "no input";
	input.focus();
	return "focused";
})()' 2>&1 || true)

if echo "$FOLDER_SET" | grep -q "no input"; then
	echo "WARNING: Could not find remote folder input, continuing anyway..." >&2
else
	# Type a folder path using clipboard paste for speed
	echo "/tmp" | pbcopy
	$AB press Meta+a 2>/dev/null || true
	$AB press Meta+v 2>/dev/null || true
	sleep 0.3
	# Press Enter to confirm the folder path
	$AB press Enter 2>/dev/null || true
	sleep 0.5
	echo "Remote folder path set to /tmp" >&2
fi

$AB screenshot "$SCREENSHOT_DIR/03-after-folder.png" 2>/dev/null || true

# Type the message into the chat editor using clipboard paste for speed
echo "Typing message: $MESSAGE" >&2
$AB eval '
(() => {
	// Focus the chat editor textarea
	const textarea = document.querySelector(".new-chat-widget .monaco-editor textarea");
	if (textarea) { textarea.focus(); return "focused editor"; }
	return "editor not found";
})()' 2>/dev/null || true

sleep 0.3
echo -n "$MESSAGE" | pbcopy
$AB press Meta+v 2>/dev/null || true
sleep 0.5

$AB screenshot "$SCREENSHOT_DIR/04-after-type.png" 2>/dev/null || true

# Send the message via the send button or keyboard
$AB eval '
(() => {
	// Try clicking the send button directly
	const sendBtn = document.querySelector(".new-chat-widget .codicon-send");
	if (sendBtn) {
		const btn = sendBtn.closest("a, button, .monaco-button");
		if (btn) { btn.click(); return "clicked send"; }
	}
	return "send button not found";
})()' 2>/dev/null || true

$AB screenshot "$SCREENSHOT_DIR/05-after-send.png" 2>/dev/null || true

# ---- Step 6: Wait for response ----------------------------------------------

echo "Waiting for response (timeout: ${RESPONSE_TIMEOUT}s)..." >&2

RESPONSE=""
for i in $(seq 1 "$RESPONSE_TIMEOUT"); do
	sleep 1

	# Check for response content in the chat area
	RESPONSE=$($AB eval '
(() => {
	// Sessions app uses the main chat area (not sidebar)
	const items = document.querySelectorAll(".interactive-item-container");
	if (items.length < 2) return "";
	const lastItem = items[items.length - 1];
	const text = lastItem.textContent || "";
	if (text.length > 20) return text;
	return "";
})()' 2>&1 | sed 's/^"//;s/"$//')

	if [ -n "$RESPONSE" ]; then
		break
	fi

	# Progress indicator
	if (( i % 10 == 0 )); then
		echo "  Still waiting... (${i}s)" >&2
	fi
done

$AB screenshot "$SCREENSHOT_DIR/04-response.png" 2>/dev/null || true

if [ -z "$RESPONSE" ]; then
	echo "WARNING: No response received within ${RESPONSE_TIMEOUT}s" >&2
	echo "Screenshots saved to: $SCREENSHOT_DIR" >&2
	exit 1
fi

echo "=== Response ===" >&2
echo "$RESPONSE"

echo "" >&2
echo "Screenshots saved to: $SCREENSHOT_DIR" >&2
echo "Remote agent host test completed successfully." >&2
