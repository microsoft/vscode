## Summary
Implements support for `cline_mcp_settings.json` local configuration file to override `chat.mcp.discovery.enabled` setting as requested in #268701.

## Changes
- ✅ Added `McpLocalConfigReader` service for reading local configuration files
- ✅ Enhanced MCP discovery to prioritize local config over server settings  
- ✅ Supports multiple file locations with graceful fallback
- ✅ Fixed TypeScript compilation issues

## Implementation Details
- **New Service**: `IMcpLocalConfigReader` with dependency injection
- **File Locations**: Searches `~/`, `./`, and `~/.config/` for `cline_mcp_settings.json`
- **Priority System**: Local file > Server configuration
- **Error Handling**: Graceful handling of missing files, invalid JSON, permissions

## Testing
- [x] Local override enables discovery when server disables it
- [x] Local override disables discovery when server enables it
- [x] Graceful fallback to server config when no local file exists
- [x] Handles invalid JSON and missing files properly

## Breaking Changes
None - fully backward compatible with existing behavior.

Fixes #268701