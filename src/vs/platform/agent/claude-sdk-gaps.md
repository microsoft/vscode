# Claude Agent Host Gaps vs Extension Implementation

> Comparison of the agent-host Claude SDK integration with the extension-side `ClaudeCodeSession` in `vscode-copilot-chat`.

## Language model proxy server

**Extension**: Runs a **local HTTP proxy server** (`ClaudeLanguageModelServer`) that intercepts Anthropic API calls:
- Sets `ANTHROPIC_BASE_URL=http://localhost:<port>` in the SDK's env
- Sets `ANTHROPIC_API_KEY=<nonce>.<sessionId>` for auth
- The proxy forwards requests through CAPI (Copilot API) via `IEndpointProvider`
- CAPI handles auth, billing, rate limiting, and model routing

**Agent host**: Calls `query()` directly with no proxy. Relies on the user having `ANTHROPIC_API_KEY` in their environment. No CAPI routing.

**Fix**: The simplest path is to have the renderer (extension) start the proxy server and pass `{ port, nonce }` to the agent host over IPC. The `ClaudeSession` sets these as env vars when calling `query()`. The proxy server code already exists in the extension.

## Permission handling

**Extension**: Uses `canUseTool` callback in SDK options with `IClaudeToolPermissionService`. Supports three modes (`bypassPermissions`, `default`, and named modes). Per-tool decisions with `toolInvocationToken`.

**Agent host**: Uses `permissionMode: 'bypassPermissions'` and `allowDangerouslySkipPermissions: true`. All tools auto-approved.

**Fix**: Once the copilot permission IPC round-trip is implemented, reuse the same mechanism for Claude. The `canUseTool` callback would call back to the renderer over IPC.

## Hooks

**Extension**: Builds hooks from `buildHooksFromRegistry()` for pre-tool-use and post-tool-use. Supports edit tool hooks that track file changes.

**Agent host**: No hooks configured.

**Fix**: Forward hook configuration from the renderer to the agent host. The extension's `buildHooksFromRegistry` could be called in the renderer and the resulting config passed over IPC.

## MCP servers

**Extension**: Calls `buildMcpServersFromRegistry()` and passes the result as `mcpServers` in SDK options.

**Agent host**: No MCP servers passed.

**Fix**: Same approach as copilot - pass MCP config over IPC.

## Session state management

**Extension** uses `IClaudeSessionStateService` for:
- Model ID per session (with live `setModel()` calls via `session.rpc.model.switchTo()`)
- Permission mode per session (with live `setPermissionMode()` via `session.setPermissionMode()`)
- Folder info (cwd, additional directories)

**Agent host**: Model passed once at session creation. No permission mode management. No folder info.

**Fix**: Pass initial config at session creation, add IPC methods for live updates.

## Settings change tracking

**Extension**: Uses `ClaudeSettingsChangeTracker` to detect changes to CLAUDE.md, settings.json, hooks, and agent files. Restarts the session (with resume) when settings change.

**Agent host**: No settings tracking.

**Fix**: Lower priority. Could be added once the proxy server is working.

## Edit tracking

**Extension**: Uses `ExternalEditTracker` to track file edits and wait for VS Code to acknowledge them.

**Agent host**: No edit tracking.

**Fix**: Coupled to permission system. Add after permissions are wired up.

## Tool set change detection

**Extension**: Detects when the set of VS Code tools changes between requests (e.g., installing a Python extension). Restarts the session with resume to pick up new tools.

**Agent host**: No tool change detection.

**Fix**: Lower priority.

## Environment configuration

**Extension**: Sets up `PATH` to include ripgrep from the extension, sets `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`, `USE_BUILTIN_RIPGREP=0`.

**Agent host**: No special env configuration.

**Fix**: Add the same env vars to the Claude session options. Small change.

## Prompt resolution

**Extension**: Converts chat references (files, images, locations) into Anthropic content blocks (text, image with base64). Handles binary image data with `ChatReferenceBinaryData`.

**Agent host**: Only passes plain text prompt. No image support, no structured reference handling.

**Fix**: Add IPC for rich content blocks, or convert references to text descriptions.

## Summary: Minimum viable path

1. **Proxy server** (required for API calls to work through CAPI)
2. **Permission round-trip** (shared with copilot)
3. **Env configuration** (small)
4. Everything else is incremental
