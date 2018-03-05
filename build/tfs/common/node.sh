#!/bin/bash
set -e

# setup nvm
mv .nvmrc nvmrc-temp # Remove for init otherwise nvm init could fail
if [[ "$OSTYPE" == "darwin"* ]]; then
	export NVM_DIR=~/.nvm
	source $(brew --prefix nvm)/nvm.sh --no-use
else
	source $NVM_DIR/nvm.sh --no-use
fi
mv nvmrc-temp .nvmrc

# install node
NODE_VERSION=8.9.1
nvm install $NODE_VERSION
nvm use $NODE_VERSION

# install yarn
npm i -g yarn