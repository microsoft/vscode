#!/bin/bash
# VSCode development environment setup script
# Based on .devcontainer configuration, adapted for host machine
#
# Usage:
#   bash scripts/setup-dev-env.sh           # Interactive mode
#   bash scripts/setup-dev-env.sh --yes     # Auto use China mirror
#   bash scripts/setup-dev-env.sh --no      # Do not use China mirror

set -e

USE_CHINA_MIRROR=""
if [ "$1" = "--yes" ] || [ "$1" = "-y" ]; then
	USE_CHINA_MIRROR="yes"
elif [ "$1" = "--no" ] || [ "$1" = "-n" ]; then
	USE_CHINA_MIRROR="no"
fi

echo "Setting up VSCode development environment..."

# Check Node.js version
NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 22 ]; then
	echo "Node.js version must be >= 22, current: $(node --version)"
	echo "Please install Node.js 22 or higher"
	exit 1
fi
echo "Node.js version: $(node --version)"

# Check npm
if ! command -v npm &> /dev/null; then
	echo "npm not found. Please install Node.js with npm"
	exit 1
fi
echo "npm version: $(npm --version)"

# Configure npm mirror (optional, recommended for China users)
if [ -z "$USE_CHINA_MIRROR" ]; then
	read -p "Use China npm mirror? (y/n) " -n 1 -r
	echo
	if [[ $REPLY =~ ^[Yy]$ ]]; then
		USE_CHINA_MIRROR="yes"
	fi
fi

if [ "$USE_CHINA_MIRROR" = "yes" ]; then
	npm config set registry https://registry.npmmirror.com
	echo "Configured China npm mirror"
else
	echo "Skipping China npm mirror configuration"
fi

# Install node-gyp (required for native module compilation)
if ! command -v node-gyp &> /dev/null; then
	echo "Installing node-gyp..."
	npm install -g node-gyp
fi
echo "node-gyp installed"

# Check Rust (required for VSCode CLI)
if ! command -v rustc &> /dev/null; then
	echo "Warning: Rust not found. VSCode CLI requires Rust."
	echo "Install from: https://rustup.rs/"
	echo "Or run: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
else
	echo "Rust version: $(rustc --version)"
fi

# Install project dependencies (using npm, not yarn)
echo "Installing project dependencies with npm..."
echo "This may take several minutes..."
npm install

echo ""
echo "Development environment setup complete!"
echo ""
echo "Next steps:"
echo "  1. Start compilation: npm run watch"
echo "  2. Run dev version: ./scripts/code.sh"
echo "  3. Or compile once: npm run compile"
echo ""
echo "For debugging:"
echo "  - Renderer: Open Dev Tools in running instance (Ctrl+Shift+I)"
echo "  - Extension Host: Attach debugger to port 5870"
echo ""
