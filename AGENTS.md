# VS Code Agents Instructions

This file provides instructions for AI coding agents working with the VS Code codebase.

For detailed project overview, architecture, coding guidelines, and validation steps, see the [Copilot Instructions](.github/copilot-instructions.md).

## Cloud Agent

Agent shells put `/exec-daemon/node` (Node 22) ahead of the Node version pinned in `.nvmrc`. That toolchain lives in `/usr/local/bin`. Run `export PATH="/usr/local/bin:$PATH"` and check `node -v` before `npm` commands.

`npm run compile` reserves an 8GB heap. Environment install creates a 16G `/swapfile` and boot enables it. Launch the dev build with `./scripts/code.sh`.
