#!/bin/bash
command_exists() {
	command -v "$1" >/dev/null 2>&1
}

install_apt() {
	PACKAGE=$1
	if ! command_exists "$PACKAGE"; then
		echo "Installing $PACKAGE..."
		sudo apt update && sudo apt install -y "$PACKAGE"
	else
		echo "$PACKAGE is already installed."
	fi
}

install_brew() {
	PACKAGE=$1
	if ! command_exists "$PACKAGE"; then
		echo "Installing $PACKAGE..."
		brew install "$PACKAGE"
	else
		echo "$PACKAGE is already installed."
	fi
}

if [[ "$OSTYPE" == "linux-gnu"* ]]; then
	echo "Detected Linux OS."
	install_apt git
	install_apt nodejs
	install_apt npm
	install_apt build-essential
	if ! command_exists yarn; then
		echo "Installing Yarn..."
		npm install -g yarn
	else
		echo "Yarn is already installed."
	fi

elif [[ "$OSTYPE" == "darwin"* ]]; then
	echo "Detected macOS."
	if ! command_exists brew; then
		echo "Homebrew not found. Installing Homebrew..."
		/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
	fi
	install_brew git
	install_brew node
	if ! command_exists yarn; then
		echo "Installing Yarn..."
		npm install -g yarn
	else
		echo "Yarn is already installed."
	fi

else
	echo "Unsupported OS: $OSTYPE"
	exit 1
fi

echo "All prerequisites checked/installed."
