# NuGet MCP Server
Contains an [Model Context Protocol](https://modelcontextprotocol.io/introduction) (MCP) server for NuGet, enabling advanced tooling and automation scenarios for NuGet package management.

## Capabilities
- Uses your configured NuGet feeds to get real time information about packages.
- Provides the ability to update packages with known vulnerabilities, including transitive dependencies.
- Provides advanced tooling for updating packages which provides the best updates based on a projects unique package graph and target frameworks.

## Requirements
To run the MCP server, you must have **[.NET 10 Preview 6 or later](https://dotnet.microsoft.com/en-us/download/dotnet/10.0)** installed.
This version of .NET adds a command, `dnx`, which is used to download, install, and run the MCP server from [nuget.org](https://nuget.org).

To verify your .NET version, run the following command in your terminal:
```bash
dotnet --info
```

## Configuration
To configure the MCP server for use with Visual Studio or VS Code, use the following snippet and include it in your `mcp.json`:

```jsonc
{
  "servers": {
    "nuget": {
      "type": "stdio",
      "command": "dnx",
      "args": [
        "NuGet.Mcp.Server",
        "--source",
        "https://api.nuget.org/v3/index.json",
        "--prerelease",
        "--yes"
      ]
    }
  }
}
```

**NOTE:** The `--prerelease` flag is required to use the MCP server from NuGet.org, as it is currently in preview and will cause new versions to be downloaded automatically.
If you'd like to use a specific version of the MCP server, you can specify it with the `--version` argument, like so:
```jsonc
{
  "servers": {
    "nuget": {
      "type": "stdio",
      "command": "dnx",
      "args": [
        "NuGet.Mcp.Server",
        "--source",
        "https://api.nuget.org/v3/index.json",
        "--version",
        "0.1.0-preview",
        "--yes"
      ]
    }
  }
}
```

When configured this way, you will need to update the version as new release become available.

The format of the configuration file can differ for different environments. Below is a table with a link to documentation on how to configure it.

| Environment | Documentation |
|-------------|--------------|
| Visual Studio | [File locations for automatic discovery of MCP configuration](https://learn.microsoft.com/visualstudio/ide/mcp-servers?view=vs-2022#file-locations-for-automatic-discovery-of-mcp-configuration) |
| VS Code | [MCP configuration in VS Code](https://code.visualstudio.com/docs/copilot/chat/mcp-servers#_add-an-mcp-server) |
| GitHub Copilot Coding Agent | [Setting up MCP servers in a repository](https://docs.github.com/en/copilot/how-tos/agents/copilot-coding-agent/extending-copilot-coding-agent-with-mcp#setting-up-mcp-servers-in-a-repository)

## Support

If you experience an issue with the NuGet MCP server or have any other feedback, please open an issue on the [NuGet GitHub repository](https://github.com/NuGet/Home/issues/new?template=MCPSERVER.yml).
Please provide the requested information in the issue template so that we can better understand and address your issue or suggestion.
