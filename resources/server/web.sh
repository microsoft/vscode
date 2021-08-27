#!/usr/bin/env sh
ROOT=$(dirname $(dirname "$(dirname "$0")"))

# APP_NAME="gitpodcode"
# VERSION="1.59.1"
# COMMIT="3866c3553be8b268c8a7f8c0482c0c0177aa8bfa"
# EXEC_NAME="code"
CLI_SCRIPT="$ROOT/out/server.js"
#"node" "$CLI_SCRIPT" "$APP_NAME" "$VERSION" "$COMMIT" "$EXEC_NAME" "$@"
"node" "$CLI_SCRIPT" "$@"
