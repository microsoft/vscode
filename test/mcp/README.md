# Code - OSS Development MCP Server

This directory contains a Model Context Protocol (MCP) server that provides VS Code automation capabilities for Code - OSS development and testing. The MCP server exposes Code - OSS's testing infrastructure through a standardized interface, allowing AI assistants and other tools to interact with VS Code programmatically.

## What is MCP?

The [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) is an open standard that enables AI assistants to securely connect to external data sources and tools. This MCP server specifically provides VS Code automation capabilities, making it possible for AI assistants to:

- Start and stop VS Code instances
- Interact with editors, terminals, and UI elements
- Run commands and keybindings
- Navigate the explorer, search, debug, and other viewlets
- Manage extensions, settings, and keybindings
- Work with notebooks and chat features

## Quick Start - Stdio

Firstly, make sure you install all dependencies (`npm i`) at the root of the repo.

Then, open the Command Palette and run:
```
MCP: List Servers → vscode-automation-mcp → Start Server
```
or open [mcp.json](../../.vscode/mcp.json) and start it from there.

That's it! It should automatically compile everything needed.

## Arguments

Open the [mcp.json](../../.vscode/mcp.json) and modify the `args`:

* `["run", "start-stdio"]`: opens Electron window
* `["run", "start-stdio", "--", "--web"]`: opens a Chromium window
* `["run", "start-stdio", "--", "--web", "--headless"]`: opens a headless window

> *NOTE: `--web` requires running `npm run install-playwright` from root*

## Debugging the server

You can modify the mcp.json to debug the server:
```JSON
"vscode-automation-mcp": {
	"type": "stdio",
	"command": "node",
	"args": ["./out/stdio.js"],
	"cwd": "${workspaceFolder}/test/mcp",
	"dev": {
		"watch": "test/mcp/**/*.ts",
		"debug": {
			"type": "node"
		}
	}
}
```

## What the Server Provides

The MCP server exposes a comprehensive set of VS Code automation tools through the MCP protocol:

### Application Management
- Start, stop, and restart VS Code instances
- Open workspaces and folders

### Editor Tools
- Open, close, and navigate files
- Get and set editor content
- Manage selections and cursors

### Terminal Tools
- Create and manage terminal instances
- Send commands to terminals
- Read terminal output

### Debug Tools
- Start and stop debug sessions
- Manage breakpoints
- Step through code

### Search Tools
- Search for files and text
- Navigate search results

### Extension Tools
- Install and manage extensions
- View extension information

### UI Interaction
- Quick access and command palette
- Explorer and activity bar
- Source control management
- Status bar interactions
- Problems panel
- Settings and keybindings editors
- Notebook support
- Chat features

## Development

### Manual Setup (Advanced)

If you prefer to run the server manually:

```bash
# Navigate to the MCP directory
cd test/mcp

# Install dependencies
npm install

# Compile TypeScript
npm run compile # or watch

# Start the server
npm start
```

### Project Structure

```
test/mcp/
├── src/
│   ├── stdio.ts             # Entry point for stdio transport
│   ├── automation.ts        # MCP server with automation tools
│   ├── application.ts       # VS Code application lifecycle management
│   ├── options.ts           # Command-line options parsing
│   ├── utils.ts             # Utility functions
│   └── automationTools/     # Tool implementations organized by feature
│       ├── index.ts         # Tool registration
│       ├── core.ts          # Core application tools
│       ├── editor.ts        # Editor tools
│       ├── terminal.ts      # Terminal tools
│       ├── debug.ts         # Debug tools
│       └── ...              # Other feature-specific tools
├── package.json             # Dependencies and scripts
├── tsconfig.json            # TypeScript configuration
└── README.md                # This file
```

### Architecture

The server uses a simple architecture:
- **stdio.ts** - Entry point that creates the MCP server and connects via stdio transport
- **automation.ts** - Creates the MCP server and registers all automation tools
- **application.ts** - Manages VS Code application lifecycle (start, stop, restart)
- **automationTools/** - Modular tool implementations organized by VS Code feature area

## Troubleshooting

### Server Won't Start
- Ensure Code - OSS has been built and run at least once (via F5 or `code.sh`)
- Verify all dependencies are installed with `npm install`

### Automation Issues
- Ensure Code - OSS has been built and run at least once (via F5 or `code.sh`)
- Check the server logs for errors
- Verify the workspace path is correct

## Contributing

This MCP server is part of the Code - OSS development infrastructure. When making changes:

1. Follow the existing TypeScript and coding conventions
2. Test with multiple MCP clients if possible
3. Update this README if adding new capabilities
4. Ensure proper error handling and logging

## License

This project is licensed under the MIT License - see the top-level project's license file for details.
