# Copilot SDK Gaps vs Extension Implementation

> Comparison of the agent-host Copilot SDK integration with the extension-side implementation in [PR #3973](https://github.com/microsoft/vscode-copilot-chat/pull/3973).

## Prompt resolution and attachments

**Extension**: Uses `CopilotCLIPromptResolver` which:
- Resolves file references into SDK attachments
- Handles mode instructions (plan mode vs interactive mode via `_setMode()`)
- Calls `toSDKAttachments()` to convert to SDK format

**Agent host**: Does basic variable-to-attachment conversion but misses prompt file resolution, mode instructions, and the full reference pipeline.

**Fix**: Mode instructions can be forwarded over IPC. Full prompt resolution needs more research on what the SDK accepts.

## User input handling

**Extension**: Registers `registerUserInputHandler` on the SDK session for `ask_user` tool calls. Routes through `IUserQuestionHandler` which shows a UI prompt and returns the user's answer.

**Agent host**: No user input handler registered.

**Fix**: Add `onUserInputRequest` event to the IPC contract. When the SDK asks for user input, fire the event, renderer shows UI, and sends the response back.

## MCP server configuration

**Extension**: Loads MCP server config from the platform's MCP handler via `mcpHandler.loadMcpConfig()` and passes it to `createSession({ mcpServers })`. Also passes `customAgents` from `copilotCLIAgents.getAgents()`.

**Agent host**: Doesn't pass MCP configuration or custom agents.

**Fix**: Add IPC methods to pass MCP server config and custom agent config to the agent host before session creation.

## Edit tracking

**Extension**: Uses `ExternalEditTracker` to wait for VS Code to acknowledge file edits before approving write permissions. The permission handler calls `editTracker.trackEdit(toolCallId, [editFile], stream)` and waits.

**Agent host**: No edit tracking.

**Fix**: This is tightly coupled to the permission system. Once permission round-trips are implemented, edit tracking can be added.

## Permission refinements

Remaining work on the permission system:
- Diff previews for write permissions (extension uses `createEditConfirmation` + `formatDiffAsUnified`)
- Auto-approve writes in isolated worktrees or workspace files that don't need confirmation
