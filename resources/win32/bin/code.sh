#!/usr/bin/env bash

export VSCODE_DEV=
export ATOM_SHELL_INTERNAL_RUN_AS_NODE=1

DIRNAME=$(dirname "$0")
exec "$DIRNAME/../Code.exe" "$DIRNAME/code.js" "$@"
