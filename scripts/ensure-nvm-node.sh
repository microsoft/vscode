#!/usr/bin/env bash
# Source from other scripts in this directory to put the Node version from .nvmrc first on PATH.
# Not meant to be executed directly.

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
	echo "source scripts/ensure-nvm-node.sh (do not execute)" >&2
	exit 1
fi

export ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NVMRC="$ROOT/.nvmrc"

if [[ ! -f "$NVMRC" ]]; then
	echo "Missing $NVMRC" >&2
	return 1
fi

NODE_VER="$(tr -d ' \r\n\t' <"$NVMRC")"
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [[ -s "$NVM_DIR/nvm.sh" ]]; then
	# shellcheck source=/dev/null
	. "$NVM_DIR/nvm.sh"
	nvm install "$NODE_VER" >/dev/null 2>&1 || true
	nvm use "$NODE_VER"
fi

NVM_NODE_BIN="$NVM_DIR/versions/node/$NODE_VER/bin"
if [[ -d "$NVM_NODE_BIN" ]]; then
	export PATH="$NVM_NODE_BIN:$PATH"
fi
