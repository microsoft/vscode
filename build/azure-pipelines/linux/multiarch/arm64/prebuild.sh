#!/usr/bin/env bash
set -e
docker run --rm --privileged multiarch/qemu-user-static:register --reset
docker run -e VSCODE_QUALITY -e CHILD_CONCURRENCY=1 -v $(pwd):/root/vscode -v ~/.netrc:/root/.netrc vscodehub.azurecr.io/vscode-linux-build-agent:arm64 /root/vscode/build/azure-pipelines/linux/multiarch/arm64/install-dependencies.sh
