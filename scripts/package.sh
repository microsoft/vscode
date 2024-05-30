#!/usr/bin/env bash

# Install dependencies for the submodule
./install-dependencies.sh
if [ $? -ne 0 ]; then
  echo "Failed to install dependencies"
  echo "Packaging did not succeed."
  exit 1
fi

# Run yarn gulp with input arguments
yarn gulp {input} "$1"
if [ $? -ne 0 ]; then
  echo "Failed to run yarn gulp"
  echo "Packaging did not succeed."
  exit 1
fi

# Success message
echo "Packaging Completed Successfully! ⭐"
