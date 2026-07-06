#!/bin/bash

set -e

echo "🔧 Starting VS Code Codespace setup for ARM64/aarch64..."

# Print system architecture
echo "📋 System Architecture:"
uname -m
dpkg --print-architecture
echo "BUILDARCH: ${BUILDARCH:-not set}"
echo "TARGETARCH: ${TARGETARCH:-not set}"

# Install dependencies
echo "📦 Installing npm dependencies..."
npm i

# Build VS Code
echo "🏗️  Building VS Code..."
npm run electron

# Setup development environment
echo "🛠️  Configuring development environment..."

# Create development directories
mkdir -p /workspace/build
mkdir -p /workspace/.vscode-test

# Display completion message
echo ""
echo "✅ VS Code Codespace setup complete!"
echo ""
echo "📝 Available commands:"
echo "   - npm start          : Start VS Code"
echo "   - npm run watch      : Watch for changes"
echo "   - npm test           : Run tests"
echo "   - npm run compile    : Compile TypeScript"
echo ""
echo "🏗️  Architecture Info:"
echo "   - Platform: linux/arm64"
echo "   - Build Architecture: arm64"
echo "   - Target Architecture: arm64"
echo ""
echo "🌐 Compatible with:"
echo "   - vscode.dev"
echo "   - github.dev"
echo "   - GitHub Codespaces"
echo ""
