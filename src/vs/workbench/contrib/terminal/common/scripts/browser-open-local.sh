#!/bin/bash
# ---------------------------------------------------------------------------------------------
#   Copyright (c) Microsoft Corporation. All rights reserved.
#   Licensed under the MIT License. See License.txt in the project root for license information.
# ---------------------------------------------------------------------------------------------

# This script is used as the BROWSER environment variable for local terminals to intercept
# browser open requests. It communicates with VS Code via the CLI.
#
# Usage: browser-open-local.sh <code_cli_path> <terminal_id> <url>
#
# Arguments:
#   code_cli_path - Path to the VS Code CLI executable
#   terminal_id   - The persistent terminal process ID
#   url           - The URL to open

CODE_CLI="$1"
TERMINAL_ID="$2"
shift 2

# If no URL provided, exit
if [ -z "$1" ]; then
	exit 0
fi

URL="$1"

# Call VS Code CLI with browser-open flag
# The --wait flag ensures we block until VS Code handles the request
"$CODE_CLI" --browser-open "$URL" --browser-terminal-id "$TERMINAL_ID" --wait
