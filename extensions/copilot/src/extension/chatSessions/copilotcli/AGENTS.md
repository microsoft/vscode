# Copilot CLI Integration

This folder contains the Copilot CLI integration for VS Code Chat. It enables users to open a new Chat window and interact with a Copilot CLI agent instance directly within VS Code. **VS Code provides the UI, Copilot CLI SDK provides the smarts.**

> **Important:** The Copilot CLI agent functionality is powered by the `@github/copilot/sdk` package. See the SDK package for full type definitions.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         VS Code Chat UI                          │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                   CopilotCLISessionService                       │
│  (node/copilotcliSessionService.ts)                              │
│  - Manages SDK LocalSessionManager lifecycle                     │
│  - Creates, retrieves, and caches CopilotCLISession instances    │
│  - Handles session persistence, discovery, and forking           │
│  - Monitors session files on disk for external changes           │
│  - Installs OTel bridge span processor for debug panel           │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                      CopilotCLISession                           │
│  (node/copilotcliSession.ts)                                     │
│  - Wraps a single SDK Session for one conversation               │
│  - Processes SDK events (messages, tools, permissions, errors)   │
│  - Handles tool confirmation and permission requests              │
│  - Supports steering (injecting messages into running sessions)  │
│  - Manages model switching and reasoning effort                  │
│  - Tracks OTel spans for observability                           │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                 Copilot CLI SDK (@github/copilot/sdk)            │
│  - Manages the agentic conversation loop                         │
│  - Executes tools and reports results via events                 │
│  - Handles permissions (read, write, shell, MCP)                 │
│  - Provides session persistence as events.jsonl files            │
│  - Supports fleet mode and plan mode                             │
└─────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                    MCP Server (In-Process)                        │
│  (vscode-node/contribution.ts, vscode-node/inProcHttpServer.ts)  │
│  - Provides VS Code-specific tools to the SDK via MCP protocol   │
│  - Runs as an in-process HTTP server (InProcHttpServer)           │
│  - Exposes diff, diagnostics, selection, and session tools        │
│  - Discoverable by CLI via lock files in ~/.copilot/ide/          │
└─────────────────────────────────────────────────────────────────┘
```

## Folder Structure

The integration follows VS Code's platform layering pattern with three layers:

```
copilotcli/
├── common/                     # Platform-agnostic (NO Node.js or VS Code API imports)
│   ├── copilotCLITools.ts      # Tool type definitions and processing helpers
│   ├── copilotCLIPrompt.ts     # Prompt reference extraction and parsing
│   ├── customSessionTitleService.ts
│   ├── delegationSummaryService.ts
│   ├── utils.ts                # SessionIdForCLI namespace (URI scheme: 'copilotcli')
│   └── test/
│
├── node/                       # Node.js-specific (SDK integration, filesystem, permissions)
│   ├── copilotCli.ts           # ICopilotCLISDK, CopilotCLIModels, CopilotCLIAgents
│   ├── copilotcliSession.ts    # CopilotCLISession — main session wrapper
│   ├── copilotcliSessionService.ts  # Session lifecycle management
│   ├── permissionHelpers.ts    # Permission request handlers
│   ├── copilotcliPromptResolver.ts  # Resolves prompts with variables and attachments
│   ├── copilotCLISkills.ts     # Skills location resolution
│   ├── copilotCLIImageSupport.ts    # Image attachment handling
│   ├── mcpHandler.ts           # MCP server configuration for SDK sessions
│   ├── nodePtyShim.ts          # Copies VS Code's node-pty for SDK use
│   ├── userInputHelpers.ts     # User question/input handling interface
│   ├── exitPlanModeHandler.ts  # Plan mode exit flow with user choice
│   ├── ripgrepShim.ts          # Copies VS Code's ripgrep for SDK use
│   └── test/
│
└── vscode-node/                # VS Code API-dependent (commands, MCP tools, UI)
    ├── copilotCLIFolderMru.ts  # Folder MRU (most-recently-used) service
    └── test/
```

## Layering Rules

Strict import dependency rules — violations will cause build failures:

| Layer | Can import from | Cannot import from |
|-------|----------------|--------------------|
| `common/` | `src/util/common/`, `src/platform/`, sibling `../common/` | `node/`, `vscode-node/`, `vscode` module |
| `node/` | `common/`, `src/util/`, `src/platform/`, Node.js builtins | `vscode-node/`, `vscode` module |
| `vscode-node/` | `common/`, `node/`, `src/util/`, `src/platform/`, `vscode` module | (top layer — no restrictions) |


## Key Components
### `node/copilotCli.ts`

**ICopilotCLISDK / CopilotCLISDK**
- Service interface wrapping the dynamic `import('@github/copilot/sdk')` for dependency injection and testability

**ICopilotCLIModels / CopilotCLIModels**
- Fetches and caches available AI models from the SDK via `getAvailableModels()`
- Registers a `LanguageModelChatProvider` with `targetChatSessionType: 'copilotcli'` so VS Code's model picker shows CLI models
- Exposes model capabilities: vision support, reasoning effort levels, token limits, billing multiplier
- Rebuilds model list on authentication changes
- Builds configuration schema for reasoning effort per model (low/medium/high/xhigh)

**ICopilotCLIAgents / CopilotCLIAgents**
- Discovers custom agents

### `node/copilotcliSession.ts`

**CopilotCLISession**
- Wraps a single `Session` object from the `@github/copilot/sdk`
- Entry point for every chat request via `handleRequest()`
- Listens to SDK events and translates them to VS Code chat UI parts
- Manages permission flow
- Tracks external edits via `ExternalEditTracker` for proper diff display
- Supports CLI commands: `compact`, `plan`, `fleet`
- Built-in slash commands: `/commit`, `/sync`, `/merge`, `/create-pr`, `/create-draft-pr`, `/update-pr`
- Captures pull request URLs from `create_pull_request` tool results

### `node/copilotcliSessionService.ts`

**ICopilotCLISessionService / CopilotCLISessionService**
- Central service managing the lifecycle of all Copilot CLI sessions

### `common/copilotCLITools.ts`

Defines all tool type interfaces used by the Copilot CLI agent:

* File Operations
* Shell Operations
* Search Operations
* Agent & Task Operations
* User Interaction
* Code Review & Git
* Data, Memory & MCP
* Security


### `common/copilotCLIPrompt.ts`

Parses raw user prompts and extracts structured chat prompt references (files, locations, diagnostics)

### `node/copilotcliPromptResolver.ts`

**CopilotCLIPromptResolver**
- Resolves chat request prompts by processing variable references and building attachments
- Extracts prompt variables from `ChatVariablesCollection` (files, locations, diagnostics, custom instructions)
- Converts image attachments
- Generates the final user prompt
- Handles workspace folder path translation for multi-folder isolation

### `node/permissionHelpers.ts`

Handles permission requests from the SDK. Each permission kind has a dedicated handler:

* handleReadPermission
* handleWritePermission
* handleShellPermission
* handleMcpPermission
* showInteractivePermissionPrompt

### `node/mcpHandler.ts`

**ICopilotCLIMCPHandler / CopilotCLIMCPHandler**
- Loads MCP server configuration for SDK sessions
- Proxies all VS Code-configured MCP servers through a gateway URL with `type: 'http'` config per server

### `node/copilotCLIImageSupport.ts`

**ICopilotCLIImageSupport / CopilotCLIImageSupport**
- Stores image data as files in extension global storage (`copilot-cli-images/`)
- Tracks trusted image URIs to auto-approve read permissions
- Supports PNG, JPEG, GIF, WebP, and BMP formats via `isImageMimeType()`

### `node/exitPlanModeHandler.ts`

**`handleExitPlanMode()`**
- Presents exit options when the SDK finishes plan generation: Autopilot, Interactive, Exit Only, Autopilot Fleet
- Syncs saved plan changes back to the SDK session

### `node/cliHelpers.ts`

Path helpers for Copilot CLI directories.

## Message Flow

1. **User sends message** in VS Code Chat
2. **CopilotCLISessionService** creates or retrieves an existing session wrapper
3. **CopilotCLISession.handleRequest()** is called:
   - If session is idle → normal request via `send()`
   - If session is busy → steering request via `send({ mode: 'immediate' })`
4. **SDK Session** processes the request and emits events:
   - `assistant.message_delta` → streamed markdown to chat UI
   - `tool.execution_start` / `tool.execution_complete` → tool invocation UI parts
   - `permission.requested` → routed to permission handler (auto-approve or interactive)
   - `user_input.requested` → question carousel shown to user
   - `exit_plan_mode.requested` → plan mode exit choices
   - `session.title_changed` → session title updated
   - `subagent.started/completed/failed` → subagent metadata enriches tool invocations
   - `hook.start/end` → forwarded to OTel bridge for debug panel
5. **Session completes** — status set to `Completed`, usage reported

## Permission System

The SDK emits `permission.requested` events with a `kind` field.

When `autopilot` / `autoApprove` permission level is set, all permissions are auto-approved without user interaction.

Tool invocation messages are intentionally held in a queue (`toolCallWaitingForPermissions`) until the permission resolves, preventing a flash of "Running..." immediately followed by "Permission requested...".

## Session Persistence

Copilot CLI sessions are persisted to `~/.copilot/session-state/<sessionId>/` directories containing:
- `events.jsonl` — Ordered event stream (messages, tool calls, results)
- `workspace.yaml` — Workspace configuration

### `IWorkspaceInfo` (`../common/workspaceInfo.ts`)

Central type representing all workspace/repository/worktree state for a session:

### `IChatSessionMetadataStore` (`../common/chatSessionMetadataStore.ts`)

Persists VS Code-specific metadata that sits alongside the SDK's own session data. This metadata is **not part of the SDK's `events.jsonl`** — it tracks VS Code concepts like worktree properties, request-to-tool mappings, mode instructions, and checkpoint refs.

**Key Types:**

**`ChatSessionMetadataFile`** — The full metadata shape per session:

**`RequestDetails`** — Per-request metadata:

**`RepositoryProperties`** — Git repository metadata:

### `IChatSessionWorktreeService` (`../common/chatSessionWorktreeService.ts`)

Manages Git worktree lifecycle for session isolation. When isolation is enabled, each session gets its own Git worktree so the agent can make changes without affecting the user's working copy.

### `IChatSessionWorktreeCheckpointService` (`../common/chatSessionWorktreeCheckpointService.ts`)

Creates Git checkpoints (lightweight commits or refs) at the start and end of each request turn. These checkpoints enable the **undo/revert** feature — users can roll back to any previous turn's state.

### `IChatSessionWorkspaceFolderService` (`../common/chatSessionWorkspaceFolderService.ts`)

Handles workspace folder tracking for sessions **without** Git worktree isolation — i.e., when the agent works directly in the user's workspace. Used in multi-root workspaces where some folders may not have Git repositories.

### `IFolderRepositoryManager` (`../common/folderRepositoryManager.ts`)

Orchestrates the full folder/repository initialization flow for a session. This is the high-level coordinator that brings together worktree creation, trust verification, uncommitted change handling, and folder tracking.

### `ISessionRequestLifecycle` (`../vscode-node/sessionRequestLifecycle.ts`)

Orchestrates the start and end of each chat request turn, coordinating worktree commits, checkpoint creation, PR detection, and metadata updates. Handles the complexity of **steering** — where multiple requests can be in-flight for the same session simultaneously.

## Architecture Diagram: Shared Services

```
┌──────────────────────────────────────────────────────────────────────┐
│                    SessionRequestLifecycle                            │
│  Orchestrates start/end of each request turn                         │
│  Handles steering (multiple concurrent requests per session)         │
└──────┬──────────┬──────────────┬─────────────┬──────────────────────┘
       │          │              │             │
       ▼          ▼              ▼             ▼
┌────────────┐ ┌───────────┐ ┌─────────────┐ ┌──────────────────────┐
│  Worktree  │ │ Workspace │ │ Checkpoint  │ │  MetadataStore       │
│  Service   │ │  Folder   │ │  Service    │ │                      │
│            │ │  Service  │ │             │ │ - Request details     │
│ - Create   │ │           │ │ - Baseline  │ │ - Worktree props     │
│ - Commit   │ │ - Track   │ │   checkpts  │ │ - Workspace folder   │
│ - Cleanup  │ │ - Stage   │ │ - Post-turn │ │ - Repo properties    │
│ - Archive  │ │ - Changes │ │   checkpts  │ │ - Mode instructions  │
│ - Unarchive│ │ - Clear   │ │ - Multi-root│ │ - Checkpoint refs    │
└────────────┘ └───────────┘ └─────────────┘ └──────────────────────┘
       │          │              │             │
       └──────────┴──────────────┴─────────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │ FolderRepositoryMgr  │
              │                      │
              │ - Init flow          │
              │ - Trust verification │
              │ - Multi-root batch   │
              │ - MRU tracking       │
              │ - Isolation mode     │
              └──────────────────────┘
```


## How to Add New Features

### Adding a new permission handler

1. Add `handle<Kind>Permission()` in `node/permissionHelpers.ts` following the existing pattern
2. Add a `case '<kind>':` in the permission switch in `node/copilotcliSession.ts` (~line 468)
3. Handler should return a `PermissionRequestResult` with `kind: 'approved' | 'denied-interactively-by-user' | ...`

### Handling a new SDK event

1. Add a listener in `node/copilotcliSession.ts` using `this._sdkSession.on(eventName, handler)`
2. Wrap with `toDisposable()` and add to the `DisposableStore` for proper cleanup
3. Use `this._stream?.markdown()` / `this._stream?.push()` to output to the chat UI

## Critical Pitfalls

- **Shims before SDK import**: `ensureNodePtyShim()` and `ensureRipgrepShim()` in `node/nodePtyShim.ts` / `node/ripgrepShim.ts` MUST be called before any `import('@github/copilot/sdk')`. They copy VS Code's bundled native binaries to the SDK's expected locations. See `node/copilotCli.ts` for the initialization order.

- **Delayed permission UI**: Tool invocation messages are held in `toolCallWaitingForPermissions` until permission resolves. `flushPendingInvocationMessageForToolCallId()` flushes only the specific approved tool, not all pending tools. This is intentional — don't bypass it.

- **Steering mode**: When a session is already busy (`InProgress` or `NeedsInput`), use `send({ mode: 'immediate' })` to inject messages into the running conversation instead of starting a new request.

## Commands & Slash Commands

**Copilot CLI  commands** (user-facing, sent programmatically):
- `compact` — compress conversation history to reduce tokens
- `plan` — enter plan mode (SDK generates plan before executing)
- `fleet` — start fleet mode for multi-agent parallel execution

**Built-in custom slash commands** (user-facing):
`/commit`, `/sync`, `/merge`, `/create-pr`, `/create-draft-pr`, `/update-pr`

**VS Code Session commands** (registered via `registerCLIChatCommands` in `vscode-node/copilotCLIChatSessions.ts`):

## Configuration

The integration respects these VS Code settings (all under `github.copilot.chat.cli.*`):

| Setting | Default | Description |
|---------|---------|-------------|
| `mcp.enabled` | `true` | Enable MCP server proxying for CLI sessions |
| `branchSupport.enabled` | `false` | Enable Git branch support features |
| `showExternalSessions` | `false` | Show sessions created outside VS Code (e.g., terminal CLI) |
| `planExitMode.enabled` | `true` | Show plan exit mode choices (Autopilot/Interactive/Exit) |
| `planCommand.enabled` | `true` | Enable the `/plan` command |
| `aiGenerateBranchNames.enabled` | `true` | AI-generated branch names for worktrees |
| `forkSessions.enabled` | `true` | Allow forking sessions into new conversations |
| `isolationOption.enabled` | `true` | Show worktree isolation option in session UI |
| `autoCommit.enabled` | `true` | Auto-commit worktree changes at end of each turn |
| `sessionController.enabled` | `false` | Use session controller API (V2) |
| `thinkingEffort.enabled` | `true` | Show thinking effort control per model |
| `sessionControllerForSessionsApp.enabled` | `false` | Use session controller for Sessions window |
| `terminalLinks.enabled` | `true` | Enable terminal link detection |

## Dependencies

- `@github/copilot/sdk`: Official Copilot CLI SDK (session management, tools, permissions, events)

## Deprecated Code

V1 registration in `../vscode-node/copilotCLIChatSessionsContribution.ts` and `registerCopilotCLIServicesV1` are deprecated. All new development should use `CopilotCLISessionService` and the controller-based V2 API.
