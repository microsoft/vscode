#!/bin/sh
unset NODE_OPTIONS
ELECTRON_RUN_AS_NODE=1 "/application/code" "/storage/copilotCLIShim.js" "$@"
