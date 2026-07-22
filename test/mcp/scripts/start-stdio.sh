
SCRIPT_DIR="$(dirname -- "$( readlink -f -- "$0"; )")"
# Go to mcp server project root
cd "$SCRIPT_DIR/.."

# Start mcp
npm run start-stdio -- --video --autostart
