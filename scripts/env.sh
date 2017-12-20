#!/bin/bash
export npm_config_disturl=https://atom.io/download/electron
export npm_config_target=$(node "build/lib/electron.js")
export npm_config_runtime=electron
export npm_config_cache="$HOME/.npm-electron"
mkdir -p "$npm_config_cache"