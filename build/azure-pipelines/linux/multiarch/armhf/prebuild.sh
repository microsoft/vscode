#!/usr/bin/env bash
set -e
docker run --rm --privileged multiarch/qemu-user-static:register --reset
docker run -e VSCODE_QUALITY -v $(pwd):/root/vscode -v ~/.netrc:/root/.netrc vscodehub.azurecr.io/vscode-linux-build-agent:armhf /root/vscode/build/azure-pipelines/linux/multiarch/armhf/install-dependencies.sh
