#!/bin/bash

# Test script for Copilot proxy interception
# This script starts the test proxy and VS Code with proxy interception enabled

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROXY_PORT=${PROXY_PORT:-8787}
PROXY_BASE_URL="http://localhost:${PROXY_PORT}"
PROXY_SCRIPT="${SCRIPT_DIR}/test-proxy.js"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}===================================================${NC}"
echo -e "${BLUE}Copilot Proxy Interception Test${NC}"
echo -e "${BLUE}===================================================${NC}"

# Check if Node.js is available
if ! command -v node &> /dev/null; then
    echo -e "${RED}Node.js is not installed${NC}"
    exit 1
fi

# Start the test proxy in background
echo -e "${GREEN}Starting test proxy on ${PROXY_BASE_URL}...${NC}"
node "${PROXY_SCRIPT}" "${PROXY_PORT}" &
PROXY_PID=$!

echo -e "${GREEN}Proxy started with PID ${PROXY_PID}${NC}"

# Wait for proxy to be ready
sleep 2

# Check if proxy is running
if ! kill -0 "${PROXY_PID}" 2>/dev/null; then
    echo -e "${RED}Proxy failed to start${NC}"
    exit 1
fi

# Trap to cleanup proxy on exit
cleanup() {
    echo -e "${YELLOW}Cleaning up...${NC}"
    kill "${PROXY_PID}" 2>/dev/null || true
    wait "${PROXY_PID}" 2>/dev/null || true
    echo -e "${GREEN}Proxy stopped${NC}"
}

trap cleanup EXIT

# Launch VS Code with proxy enabled
echo -e "${BLUE}===================================================${NC}"
echo -e "${GREEN}Launching VS Code with proxy enabled...${NC}"
echo -e "${YELLOW}Proxy URL: ${PROXY_BASE_URL}/v1${NC}"
echo -e "${BLUE}===================================================${NC}"
echo ""
echo -e "${YELLOW}Instructions:${NC}"
echo "1. Wait for VS Code to start"
echo "2. Open the Copilot Chat panel (Ctrl+K Ctrl+L or Cmd+K Cmd+L on macOS)"
echo "3. Send a message to trigger a request"
echo "4. Check the proxy logs above to see the intercepted request"
echo ""
echo -e "${YELLOW}Expected proxy output:${NC}"
echo "  - X-Original-Url header with the real endpoint"
echo "  - Request body with messages"
echo "  - Response forwarding to the original endpoint"
echo ""

# Export proxy URL and launch VS Code
export COPILOT_PROXY_URL="${PROXY_BASE_URL}/v1"
export NODE_DEBUG=''

# Launch VS Code (using the OSS build)
cd "${SCRIPT_DIR}/../../../../.."
./scripts/code.sh
