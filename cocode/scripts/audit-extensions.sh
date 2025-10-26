#!/bin/bash

# CoCode Extension Audit Script
# Ensures only approved extensions are present

ALLOWED_EXTENSIONS=(
	"llvm-vs-code-extensions.vscode-clangd"
	"ms-vscode.cmake-tools"
	"ms-python.pyright"
	"cocode.collab-extension"
)

echo "Checking installed VS Code extensions..."

# TODO: Implement extension checking logic
# This would query the OpenVSCode container for installed extensions

echo "Extension audit complete"
exit 0
