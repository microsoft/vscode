#!/bin/bash
# Install Rust toolchain
# VSCode CLI requires Rust for compilation

set -e

echo "Installing Rust toolchain..."
echo ""
echo "This will install Rust via rustup (the official Rust installer)"
echo "Installation location: ~/.cargo and ~/.rustup"
echo ""

# Check if already installed
if command -v rustc &> /dev/null; then
	echo "Rust is already installed: $(rustc --version)"
	echo "Cargo version: $(cargo --version)"
	exit 0
fi

# Optional: Use China mirror
read -p "Use China mirror for Rust installation? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
	export RUSTUP_DIST_SERVER="https://rsproxy.cn"
	export RUSTUP_UPDATE_ROOT="https://rsproxy.cn/rustup"
	echo "Using China mirror"
fi

# Download and run rustup installer
echo "Downloading rustup installer..."
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y

# Load Rust environment
echo ""
echo "Loading Rust environment..."
source "$HOME/.cargo/env"

# Verify installation
if command -v rustc &> /dev/null; then
	echo ""
	echo "Rust installed successfully!"
	echo "Rust version: $(rustc --version)"
	echo "Cargo version: $(cargo --version)"
	echo ""
	echo "Note: Rust has been added to your PATH in ~/.cargo/env"
	echo "For current shell: source ~/.cargo/env"
	echo "New shells will automatically have Rust in PATH"
else
	echo ""
	echo "Rust installation failed"
	exit 1
fi

# Configure China mirror if selected
if [[ $REPLY =~ ^[Yy]$ ]]; then
	echo ""
	echo "Configuring Cargo to use China mirror..."
	mkdir -p ~/.cargo
	cat > ~/.cargo/config.toml << 'EOF'
[source.crates-io]
replace-with = 'rsproxy-sparse'

[source.rsproxy]
registry = "https://rsproxy.cn/crates.io-index"

[source.rsproxy-sparse]
registry = "sparse+https://rsproxy.cn/index/"

[registries.rsproxy]
index = "https://rsproxy.cn/crates.io-index"

[net]
git-fetch-with-cli = true
EOF
	echo "Cargo mirror configured"
fi

echo ""
echo "Setup complete! You can now compile VSCode CLI."
