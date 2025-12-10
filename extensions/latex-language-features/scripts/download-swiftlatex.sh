#!/bin/bash
# Download SwiftLaTeX WASM files for LaTeX compilation

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENDORS_DIR="$SCRIPT_DIR/../vendors/swiftlatex"

# Create directory if it doesn't exist
mkdir -p "$VENDORS_DIR"

# allow-any-unicode-next-line
echo "📦 Downloading SwiftLaTeX WASM files..."

# SwiftLaTeX files (these URLs may need to be updated based on actual SwiftLaTeX releases)
# For now, we'll create placeholder instructions

echo "⚠️  SwiftLaTeX files need to be obtained from:"
echo "   1. SwiftLaTeX repository: https://github.com/SwiftLaTeX/SwiftLaTeX"
echo "   2. Or from the example implementation: https://github.com/avizcaino/vscode/tree/latex-preview"
echo ""
echo "Required files:"
echo "  - PdfTeXEngine.js"
echo "  - swiftlatexpdftex.js (Web Worker)"
echo "  - swiftlatexpdftex.wasm (WASM binary)"
echo ""
echo "Place them in: $VENDORS_DIR"

# Check if files exist
if [ -f "$VENDORS_DIR/PdfTeXEngine.js" ] && [ -f "$VENDORS_DIR/swiftlatexpdftex.js" ] && [ -f "$VENDORS_DIR/swiftlatexpdftex.wasm" ]; then
	# allow-any-unicode-next-line
	echo "✅ SwiftLaTeX files found"
	exit 0
else
	# allow-any-unicode-next-line
	echo "❌ SwiftLaTeX files not found. Please download them manually."
	exit 1
fi

