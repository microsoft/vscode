#!/usr/bin/env bash
if [[ "$#" -ne 1 ]]; then
	echo "Usage: ./scripts/run.sh path/to/binary"
	echo "To perform data migration tests, use: ./scripts/run.sh path/to/latest_binary path/to/stable_binary"
	exit 1
fi

# Cloning sample repository for the smoke test
cd ..
if ! [ -d vscode-smoketest-express ]; then
	git clone https://github.com/Microsoft/vscode-smoketest-express.git
	cd vscode-smoketest-express
else
	cd vscode-smoketest-express
	git fetch origin master
	git reset --hard FETCH_HEAD
	git clean -fd
fi
npm install

# Install Node modules for Spectron
cd ../vscode-smoketest
test -d node_modules || npm install

# Configuration
export VSCODE_LATEST_PATH="$1"
export VSCODE_STABLE_PATH="$2"
export SMOKETEST_REPO="../vscode-smoketest-express"
mkdir -p test_data

if [[ $1 == *"Insiders"* || $1 == *"insiders"* ]]; then
	export VSCODE_EDITION="insiders"
fi

if [[ "$OSTYPE" == "darwin"* ]]; then
	curl "https://raw.githubusercontent.com/Microsoft/vscode-docs/master/scripts/keybindings/doc.keybindings.osx.json" -o "test_data/keybindings.darwin.json" # Download OS X keybindings
else
	wget https://raw.githubusercontent.com/Microsoft/vscode-docs/master/scripts/keybindings/doc.keybindings.linux.json -O test_data/keybindings.linux.json # Download Linux keybindings
fi

# Compile and launch the smoke test
tsc
exec npm test
