#!/usr/bin/env bash

# Update submodules
git submodule init
git submodule update --recursive
if [ $? -ne 0 ]; then
  echo "Failed to update submodules"
  echo "Fresh installation did not succeed."
  exit 1
fi

# Navigate to the submodule directory and update it
cd extensions/pearai-submodule
if [ $? -ne 0 ]; then
  echo "Failed to change directory to extensions/pearai-submodule"
  echo "Fresh installation did not succeed."
  exit 1
fi

git pull origin main
if [ $? -ne 0 ]; then
  echo "Failed to pull latest changes from origin/main"
  echo "Fresh installation did not succeed."
  exit 1
fi

git checkout main
if [ $? -ne 0 ]; then
  echo "Failed to checkout main branch"
  echo "Fresh installation did not succeed."
  exit 1
fi

cd ../../
if [ $? -ne 0 ]; then
  echo "Failed to change directory back to the root"
  echo "Fresh installation did not succeed."
  exit 1
fi

pwd
# Run the install dependencies script
./scripts/install-dependencies.sh
if [ $? -ne 0 ]; then
  echo "Failed to install dependencies"
  echo "Fresh installation did not succeed."
  exit 1
fi

# Success message
echo "Fresh Install Completed Successfully! ⭐"
