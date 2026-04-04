# ToolPipe MCP Server Extension

This VS Code extension provides seamless integration with **ToolPipe MCP Server**, giving you access to 120+ developer utilities through the Model Context Protocol (MCP).

## Features

### ✨ 120+ Developer Utilities

ToolPipe MCP Server provides comprehensive developer tools organized into five categories:

#### 🔧 Code Tools
- JavaScript/TypeScript: Formatting, minification, code review, AST analysis
- Python: Code formatting, linting, syntax checking
- SQL: Query formatting, optimization, validation
- CSS/SCSS/LESS: Formatting, minification, validation
- HTML: Formatting, validation, optimization

#### 📊 Data Tools
- JSON: Formatting, validation, transformation, schema analysis
- CSV: Parsing, formatting, conversion to JSON/XML
- XML: Formatting, validation, transformation
- YAML: Formatting, validation, conversion
- Encoding: Base64 encode/decode, hex conversion, URL encoding
- Generators: UUID generation, random data generation

#### 🔒 Security Tools
- Hash Generation: MD5, SHA-1, SHA-256, SHA-512, HMAC
- JWT: Decode and validate JWT tokens
- SSL/TLS: Certificate validation and analysis
- Security Headers: Analysis and validation
- Password Generation: Secure password creation

#### 🌐 API Tools
- HTTP Client: Make HTTP requests with custom headers
- OpenAPI: Spec generation and documentation
- Webhook Testing: Webhook URL generation and testing
- API Documentation: Auto-generate from code comments
- REST Builder: Interactive REST API builder

#### 🚀 DevOps Tools
- Docker: Docker Compose generation, container commands
- GitHub Actions: Workflow generation and validation
- Nginx: Configuration generation and validation
- Kubernetes: YAML generation and validation
- Environment: System information and diagnostics

## Installation

1. Install this extension from the VS Code Marketplace
2. Reload VS Code
3. The extension will be automatically activated

## Configuration

### Quick Start (Remote Mode)

To use ToolPipe with a remote server, configure the URL of your MCP server:

```json
{
  "toolpipeMcpServer.enabled": true,
  "toolpipeMcpServer.mode": "remote",
  "toolpipeMcpServer.remoteUrl": "https://example.com/mcp"
}
```

Replace `https://example.com/mcp` with your actual ToolPipe server URL.

### Advanced Configuration

#### Using Local Server

To run ToolPipe locally (requires Node.js and npm):

```bash
npm install -g @cosai-labs/toolpipe-mcp-server
```

Then configure VS Code:

```json
{
  "toolpipeMcpServer.enabled": true,
  "toolpipeMcpServer.mode": "local",
  "toolpipeMcpServer.localCommand": "npx",
  "toolpipeMcpServer.localArgs": ["@cosai-labs/toolpipe-mcp-server"]
}
```

#### Disabling the Extension

To disable ToolPipe integration:

```json
{
  "toolpipeMcpServer.enabled": false
}
```

## Usage with AI Assistants

Once configured, ToolPipe tools are automatically available to:
- **Copilot Chat**: Use `/explain` or chat tools to access utilities
- **Claude Desktop**: Via MCP server connection
- **Cursor/Windsurf**: Integrated through MCP protocol
- **Cline**: Via MCP server endpoints

## Configuration Reference

### Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `toolpipeMcpServer.enabled` | boolean | `true` | Enable/disable the extension |
| `toolpipeMcpServer.mode` | string | `remote` | Connection mode: `remote` or `local` |
| `toolpipeMcpServer.remoteUrl` | string | `https://troops-submission-what-stays.trycloudflare.com/mcp` | Remote server URL |
| `toolpipeMcpServer.localCommand` | string | `npx` | Command for local server |
| `toolpipeMcpServer.localArgs` | array | `["@cosai-labs/toolpipe-mcp-server"]` | Arguments for local server |

## Direct MCP Configuration

You can also configure ToolPipe directly in your `.vscode/mcp.json`:

### Remote Server (HTTP)
```json
{
  "mcp": {
    "servers": {
      "toolpipe": {
        "type": "http",
        "url": "https://troops-submission-what-stays.trycloudflare.com/mcp"
      }
    }
  }
}
```

### Local Server (Stdio)
```json
{
  "mcp": {
    "servers": {
      "toolpipe": {
        "type": "stdio",
        "command": "npx",
        "args": ["@cosai-labs/toolpipe-mcp-server"]
      }
    }
  }
}
```

## Examples

### JSON Formatting with Copilot Chat
```
@copilot Format this JSON:
{
  "name":"John",
  "age":30
}
```
Copilot will use ToolPipe's JSON formatting tool automatically.

### Code Review
```
@copilot Can you review this TypeScript code?
[paste code]
```
ToolPipe's code review tools will be available in the context.

### Hash Generation
```
@copilot Generate SHA-256 hash of "my-password"
```
ToolPipe provides instant hash generation.

## Troubleshooting

### Server not connecting
1. Check if the extension is enabled in settings
2. For remote mode: verify internet connection
3. For local mode: ensure Node.js and npm are installed
4. Check VS Code's output panel for error messages

### Tools not appearing in chat
1. Reload VS Code window (Cmd+Shift+P → "Developer: Reload Window")
2. Verify the MCP server started successfully (check Output → "ToolPipe MCP Server")
3. Restart Copilot Chat

### Local server not starting
```bash
# Test if the package is installed
npx @cosai-labs/toolpipe-mcp-server --help

# Install globally if needed
npm install -g @cosai-labs/toolpipe-mcp-server
```

## Links

- **npm**: https://www.npmjs.com/package/@cosai-labs/toolpipe-mcp-server
- **GitHub**: https://github.com/COSAI-Labs/make-money-30day-challenge/tree/master/products/mcp-server
- **MCP Protocol**: https://modelcontextprotocol.io/
- **VS Code Docs**: https://code.visualstudio.com/docs

## License

MIT - See LICENSE file for details

## Contributing

Contributions are welcome! Please submit issues and pull requests to the VS Code repository.

## Support

For issues with:
- **ToolPipe Server**: https://github.com/COSAI-Labs/make-money-30day-challenge/issues
- **VS Code Integration**: https://github.com/microsoft/vscode/issues
- **MCP Protocol**: https://github.com/modelcontextprotocol/specification/issues
