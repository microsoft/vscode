# Copilot SDK Gaps vs Extension Implementation

> Comparison of the agent-host Copilot SDK integration with the extension-side implementation in [PR #3973](https://github.com/microsoft/vscode-copilot-chat/pull/3973).

## Permission handling

**Extension**: Uses `permissionHelpers2.ts` with a `requestPermission()` function that maps SDK `PermissionRequest.kind` to VS Code tool invocations:
- `shell` → `CoreTerminalConfirmationTool` (shows command for user approval)
- `write` → `CoreConfirmationTool` with diff preview via `createEditConfirmation` + `formatDiffAsUnified`
- `mcp` → `CoreConfirmationTool` showing server name + JSON args
- `read` with intention → `CoreConfirmationTool`
- Fallback → generic confirmation dialog

Auto-approves:
- Reads inside workspace or working directory
- Writes in isolated worktrees or workspace files that don't need confirmation

Uses `toolInvocationToken` from the per-request context to invoke confirmation tools. Permission handler is registered once via `registerPermissionHandler` on the SDK session, with mutable per-request context fields.

**Agent host**: Hardcodes `{ kind: 'approved' }` for all permission requests. No safety confirmation UI.

**Fix**: Add a new IPC method so the agent host can request permission from the renderer. The renderer implements it by invoking the appropriate confirmation tools. For now, a reasonable intermediate step is to auto-approve reads and shell commands inside the working directory, and deny writes until the full round-trip is implemented.

## Prompt resolution and attachments

**Extension**: Uses `CopilotCLIPromptResolver` which:
- Resolves file references into SDK attachments
- Handles mode instructions (plan mode vs interactive mode via `_setMode()`)
- Calls `toSDKAttachments()` to convert to SDK format

**Agent host**: Does basic variable-to-attachment conversion but misses prompt file resolution, mode instructions, and the full reference pipeline.

**Fix**: Mode instructions can be forwarded over IPC. Full prompt resolution needs more research on what the SDK accepts.

## Session events not forwarded

**Extension** handles these events that the agent host does not:

| Event | Extension behavior | Agent host |
|---|---|---|
| `session.title_changed` | Updates UI title | Not handled |
| `session.error` | Shows error in stream + request logger | Not handled |
| `assistant.usage` | Reports token usage via `stream.usage()` | Not handled |
| `assistant.reasoning` / `reasoning_delta` | Renders as thinking blocks | Not handled |
| `tool.user_requested` | Routes through user question handler | Not handled |

**Fix**: Forward these events over IPC. `session.title_changed` and `session.error` are simple additions. `assistant.usage` needs a new event type in the IPC contract. Reasoning events need a new progress event type.

## User input handling

**Extension**: Registers `registerUserInputHandler` on the SDK session for `ask_user` tool calls. Routes through `IUserQuestionHandler` which shows a UI prompt and returns the user's answer.

**Agent host**: No user input handler registered.

**Fix**: Add `onUserInputRequest` event to the IPC contract. When the SDK asks for user input, fire the event, renderer shows UI, and sends the response back.

## Client environment sanitization

**Extension**: Carefully strips `VSCODE_*`, `ELECTRON_*` env vars (keeping `ELECTRON_RUN_AS_NODE`), sets `useStdio: true`, and configures `cliPath`.

**Agent host**: No environment sanitization for the Copilot client. The utility process inherits the full Electron environment which may interfere with the CLI subprocess.

**Fix**: Strip problematic env vars in the `CopilotClient` constructor options. This is a small, safe change.

## MCP server configuration

**Extension**: Loads MCP server config from the platform's MCP handler via `mcpHandler.loadMcpConfig()` and passes it to `createSession({ mcpServers })`. Also passes `customAgents` from `copilotCLIAgents.getAgents()`.

**Agent host**: Doesn't pass MCP configuration or custom agents.

**Fix**: Add IPC methods to pass MCP server config and custom agent config to the agent host before session creation.

## Edit tracking

**Extension**: Uses `ExternalEditTracker` to wait for VS Code to acknowledge file edits before approving write permissions. The permission handler calls `editTracker.trackEdit(toolCallId, [editFile], stream)` and waits.

**Agent host**: No edit tracking.

**Fix**: This is tightly coupled to the permission system. Once permission round-trips are implemented, edit tracking can be added.

## Cancellation / abort

**Extension**: Calls `this._sdkSession.abort()` on cancellation, which actually stops the SDK's processing loop.

**Agent host**: Cancellation disposes the event listener but doesn't call `session.abort()` on the SDK.

**Fix**: Call `session.abort()` when cancellation is requested. Small change.
