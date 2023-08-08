#!/usr/bin/env bash

# This file contains the steps that should be run when building a "cache" image with contents that should be
# layered directly **on top of the source tree** once a dev container is created. This avoids having to run long
# running commands like "yarn install" from the ground up. Developers (and should) still run these commands
# after the actual dev container is created, but only differences will be processed.

# npm >= v9 removed the node-gyp finder script that is bundled with npm
# which allows to use the bundled node-gyp binary, prefer the following
# as alternative,
# Refs https://github.com/npm/cli/commit/3a7378d889707d2a4c1f8a6397dda87825e9f5a3
npm install -g node-gyp

yarn install --network-timeout 180000
yarn electron
