# ---------------------------------------------------------------------------------------------
#   Copyright (c) Microsoft Corporation. All rights reserved.
#   Licensed under the MIT License. See License.txt in the project root for license information.
# ---------------------------------------------------------------------------------------------

# This script is used as the BROWSER environment variable to intercept browser open requests
# from terminal processes. It communicates with VS Code via IPC to notify about URLs being opened.
#
# Usage: browser-open.sh <ipc_path> <url>
#
# Arguments:
#   ipc_path - Path to the VS Code CLI IPC socket
#   url      - The URL to open

IPC_PATH="$1"
shift

# If no URL provided, exit
if [ -z "$1" ]; then
	exit 0
fi

URL="$1"

# Create a wait marker file
WAIT_MARKER=$(mktemp)

# Build JSON payload
JSON_PAYLOAD="{\"type\":\"browserOpen\",\"url\":\"$URL\",\"waitMarkerFilePath\":\"$WAIT_MARKER\"}"

# Send request to IPC socket using curl
# The IPC socket is an HTTP server listening on a Unix socket
curl -s --unix-socket "$IPC_PATH" \
	-X POST \
	-H "Content-Type: application/json" \
	-H "Accept: application/json" \
	-d "$JSON_PAYLOAD" \
	"http://localhost/" > /dev/null 2>&1

# Wait for the marker file to be deleted (indicates VS Code has handled the request)
while [ -f "$WAIT_MARKER" ]; do
	sleep 0.1
done

exit 0
