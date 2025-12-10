#!/bin/bash
# Download PDF.js for PDF rendering

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENDORS_DIR="$SCRIPT_DIR/../vendors/pdfjs"
PDFJS_VERSION="4.0.379"

# Create directory if it doesn't exist
mkdir -p "$VENDORS_DIR"

# allow-any-unicode-next-line
echo "📦 Downloading PDF.js v${PDFJS_VERSION}..."

BASE_URL="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}"

# Download PDF.js files
if command -v curl &> /dev/null; then
	curl -L -o "$VENDORS_DIR/pdf.min.mjs" "${BASE_URL}/pdf.min.mjs"
	curl -L -o "$VENDORS_DIR/pdf.worker.min.mjs" "${BASE_URL}/pdf.worker.min.mjs"
	curl -L -o "$VENDORS_DIR/pdf_viewer.css" "${BASE_URL}/pdf_viewer.css"
elif command -v wget &> /dev/null; then
	wget -q -O "$VENDORS_DIR/pdf.min.mjs" "${BASE_URL}/pdf.min.mjs"
	wget -q -O "$VENDORS_DIR/pdf.worker.min.mjs" "${BASE_URL}/pdf.worker.min.mjs"
	wget -q -O "$VENDORS_DIR/pdf_viewer.css" "${BASE_URL}/pdf_viewer.css"
else
	# allow-any-unicode-next-line
	echo "❌ Neither curl nor wget found. Please install one to download PDF.js."
	exit 1
fi

# allow-any-unicode-next-line
echo "✅ PDF.js downloaded successfully"
ls -lh "$VENDORS_DIR/"

