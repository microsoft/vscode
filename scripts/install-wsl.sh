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
#
# VS Code Remote WSL uses two separate extension hosts:
#   - The Windows/local host  → targeted by plain `code --install-extension`
#   - The WSL remote server   → targeted by `code --remote wsl+<distro> --install-extension`
#
# When the script runs inside WSL, the `code` shim points to the Windows binary,
# so we must install on both sides explicitly.

echo ""
echo "==> Installing extension into VS Code (local/Windows side)..."
code --install-extension "$VSIX_FILE" --force
echo "    Done."

if [[ -n "${WSL_DISTRO_NAME:-}" ]]; then
	echo ""
	echo "==> Installing extension into VS Code Remote WSL (${WSL_DISTRO_NAME})..."
	code --remote "wsl+${WSL_DISTRO_NAME}" --install-extension "$VSIX_FILE" --force
	echo "    Done."
else
	echo ""
	echo "    (WSL_DISTRO_NAME not set — skipping remote WSL install.)"
fi

echo ""
echo "----------------------------------------------------------------------"
echo " TIP: Alternative install for VS Code Remote WSL"
echo "----------------------------------------------------------------------"
echo " If the remote-side install fails or you prefer a manual approach,"
echo " open VS Code connected to your WSL remote, then run from the"
echo " built-in terminal (Ctrl+\`):"
echo ""
echo "   code --install-extension '${VSIX_FILE}' --force"
echo ""
echo " The built-in terminal in a Remote-WSL session has the correct 'code'"
echo " binary on PATH — the one pointing to the remote server — so the"
echo " extension lands on the right host without needing --remote flags."
echo "----------------------------------------------------------------------"

# 4. Detect Windows host IP (WSL2)
#
# Detection strategy (in priority order):
#   a) WSL2 mirrored-networking mode: localhost routes directly to Windows → use 127.0.0.1.
#   b) ip route default gateway (reliable in NAT mode, immune to resolv.conf variations).
#   c) /etc/resolv.conf nameserver (classic WSL2 NAT fallback, unreliable with systemd-resolved).

WINDOWS_HOST_IP=""

# a) Check for WSL mirrored networking (localhost = Windows host)
WSL_CONFIG_MIRRORED=false
if [[ -f /proc/version ]] && command -v powershell.exe &>/dev/null; then
	WSLCONFIG=$(powershell.exe -NoProfile -Command "if (Test-Path \$env:USERPROFILE\\.wslconfig) { Get-Content \$env:USERPROFILE\\.wslconfig } else { '' }" 2>/dev/null | tr -d '\r')
	if echo "$WSLCONFIG" | grep -qi 'networkingMode\s*=\s*mirrored'; then
		WSL_CONFIG_MIRRORED=true
	fi
fi
if $WSL_CONFIG_MIRRORED; then
	WINDOWS_HOST_IP="127.0.0.1"
	echo ""
	echo "==> Detected WSL mirrored networking mode: using 127.0.0.1 as Windows host."
fi

# b) ip route default gateway
if [[ -z "$WINDOWS_HOST_IP" ]]; then
	WINDOWS_HOST_IP=$(ip route show default 2>/dev/null | awk '/default via/ {print $3; exit}')
fi

# c) /etc/resolv.conf nameserver, skipping loopback addresses (127.x) set by systemd-resolved
if [[ -z "$WINDOWS_HOST_IP" ]]; then
	WINDOWS_HOST_IP=$(grep '^nameserver' /etc/resolv.conf 2>/dev/null | awk '{print $2}' | grep -v '^127\.' | head -1)
fi

# Last resort: try unfiltered resolv.conf (may be wrong in some setups)
if [[ -z "$WINDOWS_HOST_IP" ]]; then
	WINDOWS_HOST_IP=$(grep '^nameserver' /etc/resolv.conf 2>/dev/null | awk '{print $2}' | head -1)
fi

if [[ -z "$WINDOWS_HOST_IP" ]]; then
	echo "WARNING: Could not detect Windows host IP automatically." >&2
	echo "         See the VS Code setting option below — it is the recommended approach." >&2
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

# 6. Auto-update warning + VS Code setting recommendation

echo ""
echo "======================================================================"
echo " IMPORTANT: Configure the proxy URL in VS Code settings (recommended)"
echo "======================================================================"
echo ""
echo " The COPILOT_PROXY_URL has been written to your shell profile(s)."
echo " However, this only works when VS Code is launched from a WSL terminal."
echo " It will NOT work when VS Code is started from the Windows Start Menu,"
echo " a desktop shortcut, or Remote-WSL opened from File Explorer."
echo ""
echo " RECOMMENDED: also set the VS Code setting so it always takes effect:"
echo ""
echo "   Open VS Code → Ctrl+Shift+P → 'Open User Settings (JSON)' → add:"
echo ""
echo "   \"github.copilot.chat.proxy.url\": \"${PROXY_URL}\","
echo ""
echo " This setting persists regardless of how VS Code is launched."
echo ""
echo "======================================================================"
echo " IMPORTANT: VS Code Auto-Update Warning"
echo "======================================================================"
echo ""
echo " This extension uses the ID 'GitHub.copilot-chat', identical to the"
echo " official GitHub Copilot Chat extension. VS Code may silently replace"
echo " it when auto-update runs."
echo ""
echo " To prevent that, also add to your VS Code settings.json:"
echo ""
echo '   "extensions.autoUpdate": false,'
echo '   "extensions.autoCheckUpdates": false'
echo ""
echo " If VS Code ever replaces the extension, simply re-run this script:"
echo "   bash $0 [--port ${HEADROOM_PORT}]"
echo "======================================================================"
echo ""
echo "==> Installation complete."
echo "    1. Set 'github.copilot.chat.proxy.url' in VS Code settings.json (see above)."
echo "    2. Reload your shell or run:  source ~/.bashrc (or ~/.zshrc)"
echo "    3. Open VS Code and verify Copilot Chat is working."
