# Code - OSS Development MCP Server

This directory contains a Model Context Protocol (MCP) server that provides Playwright browser automation capabilities for Code - OSS development and testing. The MCP server exposes Code - OSS's Playwright testing infrastructure through a standardized interface, allowing AI assistants and other tools to interact with browsers programmatically.

## What is MCP?

The [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) is an open standard that enables AI assistants to securely connect to external data sources and tools. This MCP server specifically provides browser automation capabilities using Playwright, making it possible for AI assistants to:

- Navigate web pages
- Interact with UI elements (click, type, hover, etc.)
- Take screenshots and capture page content
- Evaluate JavaScript in browser contexts
- Handle file uploads and downloads
- Manage browser tabs and windows

## Quick Start - Stdio

Firstly, make sure you install all dependencies (`npm i`) at the root of the repo.

Then, open the Command Palette and run:
```
MCP: List Servers → vscode-playwright-mcp → Start Server
```
or open [mcp.json](../../.vscode/mcp.json) and start it from there.

That's it! It should automatically compile everything needed.

Then you can use `/playwright` to ask specific questions.

## Arguments

Open the [mcp.json](../../.vscode/mcp.json) and modify the `args`:

* `["run", "start-stdio"]`: opens Electron window
* `["run", "start-stdio", "--", "--web"]`: opens a Chromium window
* `["run", "start-stdio", "--", "--web", "--headless"]`: opens a headless window

> *NOTE: `--web` requires running `npm run install-playwright` from root*

## Debugging the server

You can modify the mcp.json to debug the server:
```JSON
"vscode-playwright-mcp": {
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

The MCP server exposes a comprehensive set of browser automation tools through the MCP protocol:

### Element Interaction
- Click on elements (single, double, right-click)
- Type text into input fields
- Hover over elements
- Drag and drop between elements
- Select options in dropdowns

### Content Capture & Analysis
- Take screenshots (full page or specific elements)
- Capture accessibility snapshots for better element targeting
- Get page console messages
- Monitor network requests

### Advanced Features
- Evaluate JavaScript code in browser contexts
- Handle file uploads
- Wait for specific content or time delays
- Handle browser dialogs and alerts

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
│   ├── main.ts              # Express server and MCP endpoint handlers
│   ├── playwright.ts        # Code - OSS Playwright integration
│   ├── inMemoryEventStore.ts # Session management for resumability
│   └── utils.ts             # Utility functions
├── package.json             # Dependencies and scripts
├── tsconfig.json           # TypeScript configuration
└── README.md              # This file
```

### Key Features

- **Session Management**: Supports multiple concurrent MCP sessions with proper cleanup
- **Resumability**: Built-in event store for connection resumption
- **Code - OSS Integration**: Uses Code - OSS's existing Playwright test infrastructure
- **CORS Support**: Configured for cross-origin requests
- **Error Handling**: Comprehensive error handling and logging

## Troubleshooting

### Server Won't Start
- Ensure Code - OSS has been built and run at least once (via F5 or `code.sh`)
- Verify all dependencies are installed with `npm install`

### Browser Automation Issues
- Ensure Code - OSS has been built and run at least once (via F5 or `code.sh`)
- Check the server logs for Playwright-related errors
- Verify the test repository is properly cloned

## Contributing

This MCP server is part of the Code - OSS development infrastructure. When making changes:

1. Follow the existing TypeScript and coding conventions
2. Test with multiple MCP clients if possible
3. Update this README if adding new capabilities
4. Ensure proper error handling and logging

## License

This project is licensed under the MIT License - see the top-level project's license file for details.
