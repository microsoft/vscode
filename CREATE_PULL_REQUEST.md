# Create Pull Request - MCP Discovery Enhancement

## Current Status
✅ **Branch Created**: `feature/mcp-discovery-local-config-override`
✅ **Changes Committed**: All MCP enhancement files committed
✅ **Ready for PR**: Implementation complete and tested

## Step 1: Push Branch to Your Fork

You need to authenticate with GitHub first. Choose one option:

### Option A: Using GitHub CLI (Recommended)
```bash
# Install GitHub CLI if not installed
# Then authenticate
gh auth login

# Push the branch
git push -u origin feature/mcp-discovery-local-config-override

# Create PR directly
gh pr create --title "feat: Add cline_mcp_settings.json support for MCP discovery override" --body-file PR_DESCRIPTION.md --base main --head feature/mcp-discovery-local-config-override
```

### Option B: Using Personal Access Token
```bash
# Set up git credentials with your GitHub token
git config credential.helper store

# Push (will prompt for username/token)
git push -u origin feature/mcp-discovery-local-config-override
```

### Option C: Using SSH (if configured)
```bash
# Change remote to SSH
git remote set-url origin git@github.com:balaraj74/vscode.git

# Push the branch
git push -u origin feature/mcp-discovery-local-config-override
```

## Step 2: Create Pull Request on GitHub

1. Go to: https://github.com/balaraj74/vscode
2. Click "Compare & pull request" for the new branch
3. **Base repository**: `microsoft/vscode` (base: `main`)
4. **Head repository**: `balaraj74/vscode` (compare: `feature/mcp-discovery-local-config-override`)

## Step 3: Fill PR Details

### Title
```
feat: Add cline_mcp_settings.json support for MCP discovery override
```

### Description
```markdown
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
```

## Files Changed Summary
- `src/vs/workbench/contrib/mcp/common/mcpLocalConfigReader.ts` (new)
- `src/vs/workbench/contrib/mcp/browser/mcpDiscovery.ts` (modified)
- `src/vs/workbench/contrib/mcp/browser/mcp.contribution.ts` (modified)
- `src/tsconfig.json` (modified)

## Next Steps After PR Creation
1. **Sign CLA**: Microsoft will require Contributor License Agreement
2. **CI Checks**: Wait for automated tests to pass
3. **Code Review**: Respond to reviewer feedback
4. **Documentation**: Add to `docs/mcp-local-config-override.md` if requested

## Current Commit
```
commit 050a84ebf08
feat: Add cline_mcp_settings.json support for MCP discovery override

- Add McpLocalConfigReader service for local config file reading
- Enhance MCP discovery to prioritize local config over server settings
- Support multiple file locations with graceful fallback
- Fix TypeScript compilation issues

Fixes #268701
```

The implementation is complete and ready for submission!