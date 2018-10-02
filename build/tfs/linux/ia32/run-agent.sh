#!/bin/bash

if [ ! -f pat ]; then
	echo "Error: file pat not found"
	exit 1
fi

docker run \
  -e VSTS_ACCOUNT="monacotools" \
  -e VSTS_TOKEN="$(cat pat)" \
  -e VSTS_AGENT="tb-lnx-ia32-local" \
  -e VSTS_POOL="linux-ia32" \
  -e VSTS_WORK="/var/vsts/work" \
  --name "tb-lnx-ia32-local" \
  -it joaomoreno/vscode-vso-agent-ia32:latest