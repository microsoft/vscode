#!/bin/sh

# Get add-apt-repository command
sudo apt update
sudo apt install software-properties-common

# Get a newer version of git
sudo add-apt-repository ppa:git-core/ppa
sudo apt update
sudo apt install git

# Do a sparse checkout. Ref https://stackoverflow.com/a/63786181
git clone --filter=blob:none --no-checkout --depth 1 --sparse https://github.com/chromium/chromium.git
cd chromium
git sparse-checkout init --cone
git sparse-checkout add third_party/dpkg-shlibdeps
git checkout
