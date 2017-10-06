#!/bin/bash
set -e

# setup nvm
if [[ "$OSTYPE" == "darwin"* ]]; then
	export NVM_DIR=~/.nvm
	source $(brew --prefix nvm)/nvm.sh
else
	source $NVM_DIR/nvm.sh
fi

# install node
NODE_VERSION=7.10.0
nvm install $NODE_VERSION
nvm use $NODE_VERSION