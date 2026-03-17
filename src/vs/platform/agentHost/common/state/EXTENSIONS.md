# VS Code Extensions to the Agent Host Protocol

This file tracks VS Code-specific additions to the canonical Agent Host Protocol
types. Each extension is annotated with the file where it lives and a brief
rationale. When upstreaming to the protocol, delete the entry here and update
the sync script to pull from the protocol instead.

## State Types (`sessionState.ts`)

### `IRootState.activeSessions: number`
Counter of active sessions used for UI display. Not in the protocol because the
protocol's root state only tracks agents/models.

### `ISessionSummary.resource: URI` (class, not string)
The protocol uses `resource: string`. VS Code re-declares it as the VS Code
`URI` class for use in the rest of the codebase. Conversion happens at the
JSON-RPC boundary in `protocolServerHandler.ts`.

### `IToolCallBase.toolKind?: 'terminal'`
Rendering hint that tells the chat UI to display the tool call as a terminal
command. The protocol's `IToolCallBase` does not have this field.

### `IToolCallBase.language?: string`
Language identifier for syntax highlighting (e.g. `'shellscript'`, `'powershell'`).
Used alongside `toolKind`. Not in the protocol.

### `IToolCallResult.toolOutput?: string`
Simplified string output for the tool. The protocol uses
`content?: IToolResultContent[]` and `structuredContent?: Record<string, unknown>`
instead, matching the MCP `CallToolResult` shape.

### Const enums: `SessionStatus`, `SessionLifecycle`, `TurnState`, `ResponsePartKind`
The protocol uses plain string literals (`'idle'`, `'creating'`, `'complete'`,
`'markdown'`, etc.). VS Code wraps these in `const enum` for ergonomics. The
enum values are identical to the protocol strings.

## Action Types (`sessionActions.ts`)

### `IActiveSessionsChangedAction`
Root action tracking active session count. (`type: 'root/activeSessionsChanged'`)
Not in the protocol.

### `IToolCallStartAction.toolKind?: 'terminal'`
### `IToolCallStartAction.language?: string`
Rendering hints on the tool call start action, corresponding to the state
extensions above.

### `IActionOrigin` (extracted interface)
The protocol inlines `{ clientId: string; clientSeq: number }` in the envelope.
VS Code extracts it as a named interface.

### Naming: VS Code drops the `ISession*` prefix
Protocol uses `ISessionTurnStartedAction`, etc. VS Code uses `ITurnStartedAction`.
The mapping is in `sessionActions.ts` header comment.

## Command Types (`sessionProtocol.ts`)

### `IInitializeResult.defaultDirectory?: URI`
Default working directory hint returned by the server.

### `ICreateSessionParams.workingDirectory?: string`
Session working directory specification.

### `ISetAuthTokenParams`
Authentication token management. Not in the protocol.

### `IBrowseDirectoryParams`, `IBrowseDirectoryResult`, `IDirectoryEntry`
Filesystem browsing for remote folder picker. Not in the protocol.

### JSON-RPC 2.0 framing types
`IProtocolNotification`, `IProtocolRequest`, `IJsonRpcSuccessResponse`,
`IJsonRpcErrorResponse`, `IProtocolMessage`, and type guards.
These are VS Code's transport layer, not part of the AHP type definitions.

## Version Registry (`versions/versionRegistry.ts`)

### `NOTIFICATION_INTRODUCED_IN`
Maps notification types to protocol versions. The protocol's `registry.ts`
only has `ACTION_INTRODUCED_IN`.

### `isNotificationKnownToVersion()`
Companion to the protocol's `isActionKnownToVersion()`.

## Version 1 Wire Types (`versions/v1.ts`)

### `IV1_ActiveSessionsChangedAction`
Wire type for the VS Code-only `IActiveSessionsChangedAction`.

### `IV1_ToolCallBase.toolKind` / `IV1_ToolCallBase.language`
Frozen wire format for the VS Code rendering hint extensions.

### `IV1_ToolCallResult.toolOutput`
Frozen wire format for the VS Code simplified tool output.
