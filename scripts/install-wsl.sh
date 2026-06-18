#!/usr/bin/env bash
# install-wsl.sh -- Build and install the Headroom proxy Copilot extension in WSL
# Usage: bash scripts/install-wsl.sh [--port PORT]
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

check_command docker "Install Docker Desktop and enable WSL integration: https://docs.docker.com/desktop/windows/wsl/"
check_command code   "Install the 'code' CLI: open VS Code, run 'Shell Command: Install code in PATH' from the Command Palette."

# 2. Build the VSIX via Docker

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

# 3. Install the extension

echo ""
echo "==> Installing extension into VS Code..."
code --install-extension "$VSIX_FILE" --force
echo "    Done."

# 4. Detect Windows host IP (WSL2)

WINDOWS_HOST_IP=$(grep nameserver /etc/resolv.conf 2>/dev/null | awk '{print $2}' | head -1)
if [[ -z "$WINDOWS_HOST_IP" ]]; then
	echo "WARNING: Could not detect Windows host IP from /etc/resolv.conf." >&2
	echo "         Set COPILOT_PROXY_URL manually in your shell profile." >&2
	WINDOWS_HOST_IP="<windows-host-ip>"
fi
PROXY_URL="http://${WINDOWS_HOST_IP}:${HEADROOM_PORT}/v1"
echo ""
echo "==> Detected Windows host IP: ${WINDOWS_HOST_IP}"
echo "    Proxy URL: ${PROXY_URL}"

# 5. Write env variable to shell profile

write_env() {
	local profile="$1"
	local marker="# headroom-proxy"
	if [[ -f "$profile" ]] && grep -q "$marker" "$profile"; then
		sed -i "s|^export COPILOT_PROXY_URL=.*|export COPILOT_PROXY_URL=${PROXY_URL}  ${marker}|" "$profile"
		echo "    Updated COPILOT_PROXY_URL in $profile"
	else
		echo "" >> "$profile"
		echo "export COPILOT_PROXY_URL=${PROXY_URL}  ${marker}" >> "$profile"
		echo "    Added COPILOT_PROXY_URL to $profile"
	fi
}

echo ""
echo "==> Configuring COPILOT_PROXY_URL in shell profile(s)..."
WROTE=0
if [[ -f "$HOME/.bashrc" ]]; then
	write_env "$HOME/.bashrc"
	WROTE=1
fi
if [[ -f "$HOME/.zshrc" ]]; then
	write_env "$HOME/.zshrc"
	WROTE=1
fi
if [[ $WROTE -eq 0 ]]; then
	write_env "$HOME/.bashrc"
fi

# 6. Auto-update warning

echo ""
echo "======================================================================"
echo " IMPORTANT: VS Code Auto-Update Warning"
echo "======================================================================"
echo ""
echo " This extension uses the ID 'GitHub.copilot-chat', identical to the"
echo " official GitHub Copilot Chat extension. VS Code may silently replace"
echo " it when auto-update runs."
echo ""
echo " To prevent that, add the following to your VS Code settings.json:"
echo ""
echo '   "extensions.autoUpdate": false'
echo ""
echo " Open settings with: Ctrl+Shift+P -> 'Open User Settings (JSON)'"
echo ""
echo " If VS Code ever replaces the extension, simply re-run this script:"
echo "   bash $0 [--port ${HEADROOM_PORT}]"
echo "======================================================================"
echo ""
echo "==> Installation complete."
echo "    Reload your shell or run:  source ~/.bashrc (or ~/.zshrc)"
echo "    Then open VS Code in WSL and verify Copilot Chat is working."
