#!/bin/sh

echo 'export DISPLAY="${DISPLAY:-:1}"' | tee -a ~/.bashrc >> ~/.zshrc

yarn install --network-timeout 180000
yarn electron
