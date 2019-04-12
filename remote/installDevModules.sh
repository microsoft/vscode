#!/bin/bash
set -ex

# Install Node and Yarn
export NODE_VERSION=10.2.1
export YARN_VERSION=1.10.1
curl -fsSLO --compressed "https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-linux-x64.tar.xz"
curl -fsSLO --compressed "https://yarnpkg.com/downloads/$YARN_VERSION/yarn-v$YARN_VERSION.tar.gz"
tar -xJf "node-v$NODE_VERSION-linux-x64.tar.xz" -C "$HOME" --no-same-owner
tar -xzf "yarn-v$YARN_VERSION.tar.gz" -C "$HOME"
mkdir -p "$HOME/bin"
ln -s "$HOME/node-v$NODE_VERSION-linux-x64/bin/node" "$HOME/bin/node"
ln -s "$HOME/yarn-v$YARN_VERSION/bin/yarn" "$HOME/bin/yarn"
ln -s "$HOME/yarn-v$YARN_VERSION/bin/yarnpkg" "$HOME/bin/yarnpkg"
rm "node-v$NODE_VERSION-linux-x64.tar.xz" "yarn-v$YARN_VERSION.tar.gz"

# Compile native /remote node_modules
PATH="$HOME/bin:$PATH" \
PYTHON=/usr/bin/python2.7 \
yarn --ignore-optional
