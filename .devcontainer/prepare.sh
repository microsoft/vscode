#!/usr/bin/env bash

# This file contains the steps that should be run when building a "cache" image with contents that should be
# layered directly **on top of the source tree** once a dev container is created. This avoids having to run long
# running commands like "yarn install" from the ground up. Developers (and should) still run these commands
# after the actual dev container is created, but only differences will be processed.

yarn install
yarn electron
