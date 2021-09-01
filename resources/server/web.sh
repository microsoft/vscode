#!/usr/bin/env sh
ROOT=$(dirname $(dirname "$(dirname "$0")"))

SERVER_SCRIPT="$ROOT/out/server.js"
node "$SERVER_SCRIPT" "$@"
