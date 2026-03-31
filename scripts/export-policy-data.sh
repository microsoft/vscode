#!/usr/bin/env bash
# Exports policy data including extension configuration policies from the distro.
# This script sets up the environment (GITHUB_TOKEN) and runs --export-policy-data.
#
# Usage:
#   ./scripts/export-policy-data.sh
#
# Prerequisites:
#   - GitHub CLI (gh) authenticated with access to microsoft/vscode-distro, OR
#   - .build/distro/ checked out locally

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Ensure sources are transpiled
npm run transpile-client

# Set up GITHUB_TOKEN if not already set and .build/distro is not available
if [[ -z "${GITHUB_TOKEN:-}" ]] && [[ ! -f ".build/distro/mixin/stable/product.json" ]]; then
	if command -v gh &>/dev/null; then
		echo "Setting GITHUB_TOKEN from gh CLI..."
		GITHUB_TOKEN="$(gh auth token)"
		export GITHUB_TOKEN
	else
		echo "Error: GITHUB_TOKEN is not set, .build/distro is not available, and gh CLI is not installed."
		echo ""
		echo "Please do one of the following:"
		echo "  1. Install and authenticate the GitHub CLI: https://cli.github.com"
		echo "  2. Set GITHUB_TOKEN manually: export GITHUB_TOKEN=<your-token>"
		echo "  3. Download the distro: npm run update-distro"
		exit 1
	fi
fi

# Run the export
./scripts/code.sh --export-policy-data

echo ""
echo "Policy data exported to build/lib/policies/policyData.jsonc"
