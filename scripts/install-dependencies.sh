#!/usr/bin/env bash

# Install dependencies for the submodule
cd extensions/pearai-submodule
./scripts/install-dependencies.sh
if [ $? -ne 0 ]; then
  echo "Failed to install dependencies for the submodule"
  echo "Dependencies installation did not succeed."
  exit 1
fi
cd ../../

# Install dependencies using yarn
yarn install
if [ $? -ne 0 ]; then
  echo "Failed to install dependencies with yarn"
  echo "Dependencies installation did not succeed."
  exit 1
fi

# Success message
echo "Dependencies Installed Successfully! ⭐"
