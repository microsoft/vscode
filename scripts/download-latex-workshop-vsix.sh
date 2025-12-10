#!/bin/bash
# Download LaTeX Workshop VSIX for bundling as a built-in extension

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VSIX_DIR="$SCRIPT_DIR/../resources/extensions"
VSIX_FILE="$VSIX_DIR/latex-workshop.vsix"
VERSION="10.11.3"

# Create directory if it doesn't exist
mkdir -p "$VSIX_DIR"

# allow-any-unicode-next-line
echo "📦 Downloading LaTeX Workshop VSIX (v${VERSION})..."

# Try marketplace first
MARKETPLACE_URL="https://marketplace.visualstudio.com/_apis/public/gallery/publishers/james-yu/vsextensions/latex-workshop/${VERSION}/vspackage"

if command -v curl &> /dev/null; then
	if curl -f -L --compressed -o "$VSIX_FILE" "$MARKETPLACE_URL" 2>/dev/null; then
		# Check if file is gzip compressed and decompress if needed
		if file "$VSIX_FILE" | grep -q "gzip"; then
			gunzip -c "$VSIX_FILE" > "${VSIX_FILE}.tmp" && mv "${VSIX_FILE}.tmp" "$VSIX_FILE"
		fi
		# allow-any-unicode-next-line
		echo "✅ Downloaded from VS Code Marketplace"
		exit 0
	fi
elif command -v wget &> /dev/null; then
	if wget -q -O "$VSIX_FILE" "$MARKETPLACE_URL" 2>/dev/null; then
		# Check if file is gzip compressed and decompress if needed
		if file "$VSIX_FILE" | grep -q "gzip"; then
			gunzip -c "$VSIX_FILE" > "${VSIX_FILE}.tmp" && mv "${VSIX_FILE}.tmp" "$VSIX_FILE"
		fi
		# allow-any-unicode-next-line
		echo "✅ Downloaded from VS Code Marketplace"
		exit 0
	fi
fi

# Fallback to GitHub releases
echo "⚠️  Marketplace download failed, trying GitHub releases..."
GITHUB_URL="https://github.com/James-Yu/LaTeX-Workshop/releases/download/${VERSION}/latex-workshop-${VERSION}.vsix"

if command -v curl &> /dev/null; then
	if curl -f -L -o "$VSIX_FILE" "$GITHUB_URL" 2>/dev/null; then
		# allow-any-unicode-next-line
		echo "✅ Downloaded from GitHub releases"
		exit 0
	fi
elif command -v wget &> /dev/null; then
	if wget -q -O "$VSIX_FILE" "$GITHUB_URL" 2>/dev/null; then
		# allow-any-unicode-next-line
		echo "✅ Downloaded from GitHub releases"
		exit 0
	fi
fi

# allow-any-unicode-next-line
echo "❌ Failed to download LaTeX Workshop VSIX"
echo "   Please download manually from:"
echo "   - Marketplace: $MARKETPLACE_URL"
echo "   - GitHub: $GITHUB_URL"
echo "   And place it at: $VSIX_FILE"
exit 1

