#!/usr/bin/env bash
export npm_config_disturl=https://atom.io/download/electron
npm_config_target=$(node -p "require('./build/lib/electron').getElectronVersion();")
export npm_config_target
export npm_config_runtime=electron
export npm_config_cache="$HOME/.npm-electron"
mkdir -p "$npm_config_cache"
