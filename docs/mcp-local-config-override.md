# MCP Discovery Local Configuration Override

This document describes the local configuration override mechanism for the MCP (Model Context Protocol) discovery service.

## Overview

The MCP discovery service can now be configured using a local JSON file that takes precedence over server-pushed settings. This allows developers and QA engineers to easily enable/disable the feature and redirect it to staging or local test environments.

## Configuration File

### Location

The configuration file must be placed in the user data directory:

- **Linux/macOS**: `~/.config/Code/cline_mcp_settings.json` (or `~/.config/Code - OSS/cline_mcp_settings.json` for OSS builds)
- **Windows**: `%APPDATA%/Code/cline_mcp_settings.json` (or `%APPDATA%/Code - OSS/cline_mcp_settings.json` for OSS builds)

### Structure

The configuration file must contain a top-level `mcp_discovery` object with the following optional properties:

```json
{
  "mcp_discovery": {
    "enabled": true,
    "hostname": "staging-discovery.example.com",
    "port": 443,
    "use_tls": true,
    "timeout_ms": 5000
  }
}
```

### Supported Settings

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| `enabled` | boolean | Master switch to enable/disable the discovery service | undefined |
| `hostname` | string | The hostname or IP address of the discovery service | undefined |
| `port` | integer | The port number for the service | undefined |
| `use_tls` | boolean | Determines if the connection should be made over HTTPS/TLS | undefined |
| `timeout_ms` | integer | Connection timeout in milliseconds | undefined |

## Configuration Priority

The configuration priority order is:

1. **cline_mcp_settings.json** (Highest priority)
2. **Server-Pushed Settings**
3. **Application Hardcoded Defaults** (Lowest priority)

## Examples

### Force Enable Discovery with Custom Hostname

```json
{
  "mcp_discovery": {
    "enabled": true,
    "hostname": "staging-discovery.example.com",
    "port": 443,
    "use_tls": true,
    "timeout_ms": 5000
  }
}
```

### Force Disable Discovery

```json
{
  "mcp_discovery": {
    "enabled": false
  }
}
```

### Minimal Configuration (Enable with Defaults)

```json
{
  "mcp_discovery": {
    "enabled": true
  }
}
```

## Error Handling

The application handles the following error cases gracefully:

- **File not found**: Falls back to server configuration
- **File unreadable**: Logs warning and falls back to server configuration
- **Malformed JSON**: Logs warning and falls back to server configuration
- **Missing mcp_discovery object**: Falls back to server configuration

In all error cases, a warning is logged to the console/log file, and the application continues using the standard server-pushed configuration.

## Backward Compatibility

This feature is fully backward compatible. If the `cline_mcp_settings.json` file is not present, the application behaves exactly as it did before, respecting the existing server-side configuration.

## Development and Testing

This feature is particularly useful for:

- **Local Development**: Override discovery settings without server-side changes
- **Quality Assurance**: Test against staging environments
- **Debugging**: Force enable/disable discovery for troubleshooting
- **Environment-Specific Configuration**: Different settings per development environment

## Security Considerations

- The configuration file is read from the user data directory, which should have appropriate file permissions
- The file is parsed as JSON, so standard JSON security considerations apply
- Network settings (hostname, port, TLS) should be validated before use