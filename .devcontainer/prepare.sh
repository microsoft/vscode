#!/usr/bin/env bash

# This file contains the steps that should be run when building a "cache" image with contents that should be
# layered directly **on top of the source tree** once a dev container is created. This avoids having to run long
# running commands like "yarn install" from the ground up. Developers (and should) still run these commands
# after the actual dev container is created, but only differences will be processed.

# Fix permissions for chrome sandboxing
mkdir -p .build/electron/chrome-sandbox
chmod 4755  .build/electron/chrome-sandbox
chown root .build/electron/chrome-sandbox

yarn install
yarn electron

# Improve command line lag by disabling git portion of theme
git config --global codespaces-theme.hide-status 1
