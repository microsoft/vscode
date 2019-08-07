#!/usr/bin/env bash
set -e
docker run -e VSCODE_QUALITY -e CHILD_CONCURRENCY=1 -v $(pwd):/root/vscode -v ~/.netrc:/root/.netrc vscodehub.azurecr.io/vscode-linux-build-agent:alpine /root/vscode/build/azure-pipelines/linux/multiarch/alpine/install-dependencies.sh
