#!/usr/bin/env bash
set -e
docker run -e VSCODE_QUALITY -v $(pwd):/root/vscode -v ~/.netrc:/root/.netrc vscodehub.azurecr.io/vscode-linux-build-agent:alpine /root/vscode/build/azure-pipelines/linux/install-alpine-dependencies.sh
