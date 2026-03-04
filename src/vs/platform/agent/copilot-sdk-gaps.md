# Copilot SDK Gaps vs Extension Implementation

> Comparison of the agent-host Copilot SDK integration with the extension-side implementation in [PR #3973](https://github.com/microsoft/vscode-copilot-chat/pull/3973).

## ~~Permission handling~~ (done)

Permission IPC round-trip implemented. The agent host fires `permission_request` events and awaits renderer response via `respondToPermissionRequest`. The renderer shows ChatToolInvocation confirmation UI with WaitingForConfirmation state. Shell commands show terminal-style confirmation, write/mcp show generic confirmation dialogs.

Remaining: auto-approve reads inside workspace, diff previews for writes.

## Prompt resolution and attachments

**Extension**: Uses `CopilotCLIPromptResolver` which:
- Resolves file references into SDK attachments
- Handles mode instructions (plan mode vs interactive mode via `_setMode()`)
- Calls `toSDKAttachments()` to convert to SDK format

**Agent host**: Does basic variable-to-attachment conversion but misses prompt file resolution, mode instructions, and the full reference pipeline.

**Fix**: Mode instructions can be forwarded over IPC. Full prompt resolution needs more research on what the SDK accepts.

## ~~Session events not forwarded~~ (done)

`session.error`, `assistant.usage`, and `assistant.reasoning_delta` are forwarded. Error events terminate the request. Reasoning events render as thinking blocks. `title_changed` is in the IPC contract but the Copilot SDK does not emit it.

## User input handling

**Extension**: Registers `registerUserInputHandler` on the SDK session for `ask_user` tool calls. Routes through `IUserQuestionHandler` which shows a UI prompt and returns the user's answer.

**Agent host**: No user input handler registered.

**Fix**: Add `onUserInputRequest` event to the IPC contract. When the SDK asks for user input, fire the event, renderer shows UI, and sends the response back.

## ~~Client environment sanitization~~ (done)

Stripped `VSCODE_*`, `ELECTRON_*` env vars. Set `useStdio: true` and `autoStart: true`.

## MCP server configuration

**Extension**: Loads MCP server config from the platform's MCP handler via `mcpHandler.loadMcpConfig()` and passes it to `createSession({ mcpServers })`. Also passes `customAgents` from `copilotCLIAgents.getAgents()`.

**Agent host**: Doesn't pass MCP configuration or custom agents.

**Fix**: Add IPC methods to pass MCP server config and custom agent config to the agent host before session creation.

## Edit tracking

**Extension**: Uses `ExternalEditTracker` to wait for VS Code to acknowledge file edits before approving write permissions. The permission handler calls `editTracker.trackEdit(toolCallId, [editFile], stream)` and waits.

**Agent host**: No edit tracking.

**Fix**: This is tightly coupled to the permission system. Once permission round-trips are implemented, edit tracking can be added.

## ~~Cancellation / abort~~ (done)

`abortSession(session)` IPC method added. Cancellation requests in the session handler call `abortSession` before finishing. CopilotAgent calls `session.abort()`.
