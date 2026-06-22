#!/usr/bin/env bash
# install-macos.sh -- Build and install the Headroom proxy Copilot extension on macOS
# Usage: bash scripts/install-macos.sh [--port PORT]
# Default port: 8787

set -euo pipefail

HEADROOM_PORT="${HEADROOM_PORT:-8787}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="$REPO_ROOT/docker-compose.build.yml"
DIST_DIR="$REPO_ROOT/dist-vsix"

# Parse optional --port argument
while [[ $# -gt 0 ]]; do
	case "$1" in
		--port)
			HEADROOM_PORT="$2"
			shift 2
			;;
		*)
			echo "Unknown argument: $1" >&2
			echo "Usage: $0 [--port PORT]" >&2
			exit 1
			;;
	esac
done

# 1. Prerequisite checks

check_command() {
	if ! command -v "$1" &>/dev/null; then
		echo "ERROR: '$1' is not installed or not in PATH." >&2
		echo "       $2" >&2
		exit 1
	fi
}

check_command docker "Install Docker Desktop for Mac: https://docs.docker.com/desktop/mac/install/"
check_command code   "Install the 'code' CLI: open VS Code → Cmd+Shift+P → 'Shell Command: Install code in PATH'."

# 2. Kill all VS Code processes
#
# On macOS, Copilot Chat is bundled as a built-in extension inside the app.
# After a first install attempt, VS Code writes a "pending restart" state.
# If any Code Helper process is still running, the reinstall fails with:
#   "Please restart VS Code before reinstalling GitHub Copilot Chat."
# Cmd+Q alone is not enough — helper processes linger in the background.

echo ""
echo "==> Stopping all VS Code processes..."
pkill -f "Visual Studio Code" 2>/dev/null || true
pkill -f "Code Helper"        2>/dev/null || true
sleep 2
echo "    Done."

# 3. Build the VSIX via Docker

echo ""
echo "==> Building copilot-proxy.vsix with Docker..."
mkdir -p "$DIST_DIR"
docker compose -f "$COMPOSE_FILE" up --build --abort-on-container-exit
docker compose -f "$COMPOSE_FILE" down --remove-orphans 2>/dev/null || true

VSIX_FILE=$(ls "$DIST_DIR"/*.vsix 2>/dev/null | head -1)
if [[ -z "$VSIX_FILE" ]]; then
	echo "ERROR: No .vsix file found in $DIST_DIR after build." >&2
	exit 1
fi
echo "    Built: $VSIX_FILE"

# 4. Install the extension

echo ""
echo "==> Installing extension into VS Code..."
code --install-extension "$VSIX_FILE" --force
echo "    Done."

PROXY_URL="http://localhost:${HEADROOM_PORT}/v1"

# 5. Settings + auto-update warning

echo ""
echo "======================================================================"
echo " IMPORTANT: Configure the proxy URL in VS Code settings"
echo "======================================================================"
echo ""
echo " Open VS Code → Cmd+Shift+P → 'Open User Settings (JSON)' → add:"
echo ""
echo "   \"github.copilot.chat.proxy.url\": \"${PROXY_URL}\","
echo "   \"extensions.autoUpdate\": false,"
echo "   \"extensions.autoCheckUpdates\": false"
echo ""
echo " Both autoUpdate AND autoCheckUpdates must be false — one alone is"
echo " not enough to prevent VS Code from replacing the patched extension."
echo "======================================================================"
echo ""
echo "==> Installation complete."
echo "    If the extension is ever replaced, re-run: bash $0 [--port ${HEADROOM_PORT}]"
