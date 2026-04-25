# Claude Code Integration

This folder contains the Claude Code integration for VS Code Chat. It enables users to open a new Chat window and interact with a Claude Code instance directly within VS Code. **VS Code provides the UI, Claude Code provides the smarts.**

> 📖 **New to the Claude session target?** See the **[User Guide](./CLAUDE_SESSION_USER_GUIDE.md)** for a comprehensive walkthrough of features, slash commands, permission modes, and best practices.

## Official Claude Agent SDK Documentation

> **Important:** For the most up-to-date information on the Claude Agent SDK, always refer to the official documentation:
>
> - **[Agent SDK Overview](https://platform.claude.com/docs/en/agent-sdk/overview)** - General SDK concepts, capabilities, and getting started guide
> - **[Agent SDK Quickstart](https://platform.claude.com/docs/en/agent-sdk/quickstart)** - Step-by-step guide to building your first agent
> - **[TypeScript SDK Reference](https://platform.claude.com/docs/en/agent-sdk/typescript)** - Complete API reference for the TypeScript SDK including all functions, types, and interfaces
> - **[TypeScript V2 Preview](https://platform.claude.com/docs/en/agent-sdk/typescript-v2-preview)** - Preview of the simplified V2 interface with session-based send/stream patterns
>
> The SDK package is `@anthropic-ai/claude-agent-sdk`. The official documentation covers tools, hooks, subagents, MCP integration, permissions, sessions, and more.

### Core SDK Features

**Getting Started:**
- [Overview](https://platform.claude.com/docs/en/agent-sdk/overview) - Learn about the Agent SDK architecture and core concepts
- [Quickstart](https://platform.claude.com/docs/en/agent-sdk/quickstart) - Get up and running with your first agent in minutes

**Core SDK Implementation:**
- [TypeScript](https://platform.claude.com/docs/en/agent-sdk/typescript) - Main TypeScript SDK reference for building agents
- [TypeScript v2 Preview](https://platform.claude.com/docs/en/agent-sdk/typescript-v2-preview) - Preview of upcoming v2 API with enhanced features
- [Streaming vs Single Mode](https://platform.claude.com/docs/en/agent-sdk/streaming-vs-single-mode) - Choose between streaming responses or single-turn completions

**User Interaction & Control:**
- [Permissions](https://platform.claude.com/docs/en/agent-sdk/permissions) - Control what actions Claude can take with user approval flows
- [User Input](https://platform.claude.com/docs/en/agent-sdk/user-input) - Collect clarifications and decisions from users during execution
- [Hooks](https://platform.claude.com/docs/en/agent-sdk/hooks) - Execute custom logic at key points in the agent lifecycle

**State & Session Management:**
- [Sessions](https://platform.claude.com/docs/en/agent-sdk/sessions) - Manage conversation history and context across interactions
- [File Checkpointing](https://platform.claude.com/docs/en/agent-sdk/file-checkpointing) - Save and restore file states for undo/redo functionality

**Advanced Features:**
- [Structured Outputs](https://platform.claude.com/docs/en/agent-sdk/structured-outputs) - Get reliable JSON responses with schema validation
- [Modifying System Prompts](https://platform.claude.com/docs/en/agent-sdk/modifying-system-prompts) - Customize Claude's behavior and instructions
- [MCP](https://platform.claude.com/docs/en/agent-sdk/mcp) - Connect to Model Context Protocol servers for extended capabilities
- [Custom Tools](https://platform.claude.com/docs/en/agent-sdk/custom-tools) - Build your own tools to extend Claude's functionality

**Agent Composition & UX:**
- [Subagents](https://platform.claude.com/docs/en/agent-sdk/subagents) - Compose complex workflows by delegating to specialized agents
- [Slash Commands](https://platform.claude.com/docs/en/agent-sdk/slash-commands) - Add custom `/commands` for quick actions
- [Skills](https://platform.claude.com/docs/en/agent-sdk/skills) - Package reusable agent capabilities as installable modules
- [Todo Tracking](https://platform.claude.com/docs/en/agent-sdk/todo-tracking) - Help Claude manage and display task progress
- [Plugins](https://platform.claude.com/docs/en/agent-sdk/plugins) - Extend the SDK with community-built integrations

## Overview

The Claude Code integration allows VS Code's chat interface to communicate with Claude Code, Anthropic's agentic coding assistant. When a user sends a message in a VS Code Chat window using this integration, the message is routed to a Claude Code session that can:

- Read and analyze code
- Execute shell commands
- Edit files
- Search the workspace
- Manage tasks and todos

All interactions are displayed through VS Code's native chat UI, providing a seamless experience.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         VS Code Chat UI                          │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                     ClaudeAgentManager                           │
│  - Manages language model server lifecycle                       │
│  - Routes requests to appropriate sessions                       │
│  - Resolves prompts with file references                         │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                      ClaudeCodeSession                           │
│  - Maintains a single Claude Code conversation                   │
│  - Processes messages (assistant, user, result)                  │
│  - Handles tool invocation and confirmation                      │
│  - Queues multiple requests for sequential processing            │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Claude Code SDK (@anthropic-ai)                 │
│  - Communicates with Claude Code                                 │
│  - Manages tool hooks (pre/post tool use)                        │
│  - Handles message streaming                                     │
└─────────────────────────────────────────────────────────────────┘
```

## Key Components

### `node/claudeCodeAgent.ts`

**ClaudeAgentManager**
- Entry point for handling chat requests from VS Code
- Starts and manages the language model server (`LanguageModelServer`)
- Creates and caches `ClaudeCodeSession` instances by session ID
- Resolves prompts by replacing VS Code references (files, locations) with actual paths

**ClaudeCodeSession**
- Represents a single Claude Code conversation session
- Manages a queue of incoming requests from VS Code Chat
- Uses an async iterable to feed prompts to Claude Code SDK
- Processes three message types:
  - **Assistant messages**: Text responses and tool use requests
  - **User messages**: Tool results from executed tools
  - **Result messages**: Session completion or error states
- Handles tool confirmation dialogs via VS Code's chat API
- Auto-approves safe operations (file edits in workspace)
- Tracks external edits to show proper diffs

### `node/claudeCodeSdkService.ts`

**IClaudeCodeSdkService / ClaudeCodeSdkService**
- Thin wrapper around the `@anthropic-ai/claude-agent-sdk`
- Provides dependency injection for testability
- Enables mocking in unit tests

### `node/sessionParser/claudeCodeSessionService.ts`

**IClaudeCodeSessionService / ClaudeCodeSessionService**
- Loads and manages persisted Claude Code sessions from disk
- Reads `.jsonl` session files from `~/.claude/projects/<workspace-slug>/`
- Builds message chains from leaf nodes to reconstruct full conversations
- Loads subagent sessions via SDK APIs (`listSubagents` + `getSubagentMessages`) and correlates them with their spawning tool use via `parent_tool_use_id` (stored as `ISubagentSession.parentToolUseId`)
- Provides session caching with mtime-based invalidation
- Used to resume previous Claude Code conversations
- See `node/sessionParser/README.md` for detailed documentation

### `node/sessionParser/sdkSessionAdapter.ts`

Adapts raw SDK session data into the internal `IClaudeCodeSession` / `ISubagentSession` schemas:
- **`buildClaudeCodeSession()`**: Assembles a full `IClaudeCodeSession` from session info, messages, and subagents
- **`sdkSubagentMessagesToSubagentSession()`**: Converts raw SDK `SessionMessage[]` into an `ISubagentSession`
- **`extractParentToolUseId()`**: Helper that scans a `SessionMessage[]` array until it finds a string `parent_tool_use_id`, used to correlate a subagent session with the Agent/Task tool_use block that spawned it

### `node/claudeSkills.ts`

**IClaudePluginService / ClaudePluginService**
- Resolves plugin root directories for the Claude SDK's `plugins` option
- Combines three sources of plugin locations:
  1. **Config skill locations** — from `chat.agentSkillsLocations` setting, resolved via the shared `resolveSkillConfigLocations()` utility. These point to skills directories (e.g. `.../skills/`), so the service walks **one level up** to reach the plugin root expected by the SDK.
  2. **Discovered skills** — from `IPromptsService.getSkills()`. Each skill has a `SKILL.md` at `<plugin-root>/skills/<skill-name>/SKILL.md`, so the service walks **three levels up** (`dirname(dirname(dirname(uri)))`) to reach the plugin root.
  3. **Direct plugins** — from `IPromptsService.getPlugins()`, returned as-is since they already point to plugin root directories.
- Filters out `.claude` directories (the Claude SDK loads these automatically)
- Deduplicates results using `ResourceSet`
- Plugin roots are passed to the SDK as `SdkPluginConfig[]` with `{ type: 'local', path }` in `ClaudeCodeSession._doStartSession()`

**Shared utility:** `../../common/skillConfigLocations.ts` — `resolveSkillConfigLocations()` handles `~/` expansion, absolute paths, and relative paths joined to workspace folders. Used by both `ClaudePluginService` and `CopilotCLISkills`.

### `common/claudeTools.ts`

Defines Claude Code's tool interface:
- **ClaudeToolNames**: Enum of all supported tool names (Bash, Read, Edit, Write, etc.). `Agent` is the current name (SDK v2.1.63+); `Task` is kept for backward compatibility with older sessions.
- **Tool input interfaces**: Type definitions for each tool's input parameters
- **claudeEditTools**: List of tools that modify files (Edit, MultiEdit, Write, NotebookEdit)
- **getAffectedUrisForEditTool**: Extracts file URIs that will be modified by edit operations

### `common/toolInvocationFormatter.ts`

Formats tool invocations for display in VS Code's chat UI:
- Creates `ChatToolInvocationPart` instances with appropriate messaging
- Handles tool-specific formatting (Bash commands, file reads, searches, etc.)
- Suppresses certain tools from display (TodoWrite, Edit, Write) where other UI handles them

### `../../chatSessions/vscode-node/chatHistoryBuilder.ts`

Converts a persisted `IClaudeCodeSession` into VS Code `ChatResponsePart[]` for replay in the chat UI:
- Reconstructs assistant text, thinking blocks, tool invocations, and tool results into chat response parts
- Matches subagent sessions to their spawning Agent/Task tool_use blocks using `ISubagentSession.parentToolUseId`, injecting the subagent's tool calls inline under the parent tool invocation

## Message Flow

1. **User sends message** in VS Code Chat
2. **ClaudeAgentManager** receives the request and routes to existing or new session
3. **ClaudeCodeSession** queues the request and feeds the prompt to Claude Code SDK
4. **Claude Code SDK** returns streaming messages:
   - Text content → rendered as markdown in chat
   - Tool use requests → shown as progress, then confirmed via VS Code's confirmation API
   - Tool results → formatted and displayed in chat
5. **Result message** signals turn completion, request is resolved

## Tool Confirmation

Claude Code tools require user confirmation before execution:
- **Auto-approved**: File edits (Edit, Write, MultiEdit) are auto-approved if the file is within the workspace
- **Manual confirmation**: All other tools show a confirmation dialog via `CoreConfirmationTool`
- **Denied tools**: User denial sends a "user declined" message back to Claude Code

## Session Persistence

Claude Code sessions are persisted to `~/.claude/projects/<workspace-slug>/` as `.jsonl` files. The `ClaudeCodeSessionService` can:
- Load all sessions for the current workspace
- Resume a previous session by ID
- Cache sessions with mtime-based invalidation

## Folder and Working Directory Management

The integration deterministically resolves the working directory (`cwd`) and additional directories for each Claude session, rather than inheriting from `process.cwd()`. This is managed by the `ClaudeChatSessionContentProvider` and exposed through the `ClaudeFolderInfo` interface.

### `ClaudeFolderInfo` (`common/claudeFolderInfo.ts`)

```typescript
interface ClaudeFolderInfo {
  readonly cwd: string;                  // Primary working directory
  readonly additionalDirectories: string[]; // Extra directories Claude can access
}
```

### Folder Resolution by Workspace Type

| Workspace Type | cwd | additionalDirectories | Folder Picker |
|---|---|---|---|
| **Single-root** (1 folder) | That folder | `[]` | Hidden |
| **Multi-root** (2+ folders) | Selected folder (default: first) | All other workspace folders | Shown with workspace folders |
| **Empty** (0 folders) | Selected MRU folder | `[]` | Shown with MRU entries |

### Data Flow

1. **`ClaudeChatSessionItemController`** resolves `ClaudeFolderInfo` via `getFolderInfoForSession(sessionId)`
2. The folder info is passed through `ClaudeAgentManager.handleRequest()` to `ClaudeCodeSession`
3. `ClaudeCodeSession._startSession()` uses `folderInfo.cwd` and `folderInfo.additionalDirectories` when building SDK `Options`

### Folder Picker UI

In multi-root and empty workspaces, a folder picker option appears in the chat session options:
- **Multi-root**: Lists all workspace folders; selecting one makes it `cwd`, the rest become `additionalDirectories`
- **Empty workspace**: Lists MRU folders from `IFolderRepositoryManager` (max 10 entries)
- The folder option is **locked** for existing (non-untitled) sessions to prevent cwd changes mid-conversation

### Session Discovery Across Folders

`ClaudeCodeSessionService._getProjectSlugs()` generates workspace slugs for **all** workspace folders, enabling session discovery across all project directories in multi-root workspaces. For empty workspaces, it generates slugs for all folders known to `IFolderRepositoryManager` (MRU entries).

### Key Files

- **`common/claudeFolderInfo.ts`**: `ClaudeFolderInfo` interface
- **`../../chatSessions/common/claudeWorkspaceFolderService.ts`**: `IClaudeWorkspaceFolderService` interface — computes git diff changes for session items
- **`../../chatSessions/vscode-node/claudeWorkspaceFolderServiceImpl.ts`**: Implementation — diffs the session's branch against its base branch, caches results, and maps changes to `ChatSessionChangedFile[]` for display in the Sessions view
- **`../../chatSessions/vscode-node/claudeChatSessionContentProvider.ts`**: Folder resolution, picker options, session metadata enrichment, and git command handlers
- **`../../chatSessions/common/builtinSlashCommands.ts`**: Shared constants for built-in slash commands (`/commit`, `/sync`, `/merge`, etc.) used by both Claude and CopilotCLI sessions
- **`../../chatSessions/vscode-node/folderRepositoryManagerImpl.ts`**: `FolderRepositoryManager` (abstract base) with `ClaudeFolderRepositoryManager` subclass — the Claude subclass does not depend on `ICopilotCLISessionService` (CopilotCLI has its own subclass `CopilotCLIFolderRepositoryManager`)
- **`node/claudeCodeAgent.ts`**: Consumes `ClaudeFolderInfo` in `ClaudeCodeSession._startSession()`
- **`node/sessionParser/claudeCodeSessionService.ts`**: `_getProjectSlugs()` generates slugs for all folders

## Input State Reactive Pipeline

The chat session input controls (permission mode picker, folder picker) are driven by a reactive observable pipeline, not by imperative setter calls. Understanding this pipeline is important when modifying input state behavior.

### Overview

VS Code calls `getChatSessionInputState` to get a `ChatSessionInputState` object whose `.groups` array drives the UI. Rather than computing groups once and returning them, the pipeline keeps `groups` live: shared observables push changes into each state object whenever relevant configuration changes.

### Key Types

```
InputStateReactivePipeline {
  permissionMode:   ISettableObservable<PermissionMode>
  folderUri:        ISettableObservable<URI | undefined>
  folderItems:      ISettableObservable<readonly vscode.ChatSessionProviderOptionItem[]>
  isSessionStarted: ISettableObservable<boolean>
  store:            DisposableStore    // owns all autoruns for this pipeline
}
```

### Seeding: Extracting Initial Values

Before attaching any autoruns, `_createInputStateReactivePipeline` calls `_computeSeedValues(state.groups)` to extract the current groups into typed values. This must happen *before* the first autorun runs, because the first autorun pass immediately reads `allGroups` and writes to `state.groups` — if the per-state observables were left at defaults, that write would discard the carefully-constructed initial groups.

`_computeSeedValues` extracts four values:

| Value | Source | Fallback |
|---|---|---|
| `permissionMode` | Selected item id in the `permissionMode` group | `lastUsedPermissionMode` |
| `folderUri` | Selected item id in the `folder` group | `undefined` |
| `folderItems` | Full item list of the `folder` group | `[]` |
| `isSessionStarted` | `locked: true` on any folder item or the selected item | `false` |

The `isSessionStarted` recovery from `locked` items is important for the `previousInputState` path: the previous state's groups encode the lock signal via `locked: true` on their items. If `_computeSeedValues` did not recover this, the pipeline would start with `isSessionStarted = false` and the `folderGroup` derived would re-render all items as unlocked.

### Shared vs. Per-State Observables

`ClaudeChatSessionItemController` holds two **shared** observables (one instance per controller, not per session):

| Observable | Source | Purpose |
|---|---|---|
| `_bypassPermissionsEnabled` | `IConfigurationService` event | Controls which permission mode items are available |
| `_workspaceFolders` | `IWorkspaceService` event | Controls folder picker items and visibility |

Each call to `getChatSessionInputState` creates a **per-state** pipeline with `_createInputStateReactivePipeline(state)`. The per-state observables are seeded via `_computeSeedValues`.

`folderItems` is a settable per-state observable (not a pure `derived`) because of an async edge case: when the workspace has no folders, the items come from an async MRU fetch (`IFolderRepositoryManager`). An autorun watches `_workspaceFolders` and updates `folderItems` synchronously when folders exist, or kicks off the async MRU fetch when the workspace is empty.

### Derived Computation and Autorun

Inside `_createInputStateReactivePipeline`, `derived` observables combine shared and per-state inputs:

```
permissionModeGroup  = derived(bypassEnabled, permissionMode)
folderGroup          = derived(folderItems, workspaceFolders, folderUri, isSessionStarted)
allGroups            = derived(permissionModeGroup, folderGroup)
```

An `autorun` reads `allGroups` and writes to `state.groups`. This is the only place `state.groups` is written — the pipeline is the single source of truth for the UI.

### Lifetime Management (WeakRef + FinalizationRegistry)

The `autorun`'s closure holds a `WeakRef<ChatSessionInputState>` rather than a direct reference. This is required because the shared observables (`_workspaceFolders`, `_bypassPermissionsEnabled`) hold strong references to the autorun's observer. Without the `WeakRef`, each `state` object would be transitively reachable through the shared observable → autorun → closure → state chain, and would never be garbage collected.

When VS Code discards a `ChatSessionInputState`, the `WeakRef` lets the GC collect it. The `FinalizationRegistry` (`_stateAutorunRegistry`) then fires and calls `store.dispose()`, which unsubscribes all autoruns for that state.

```
SharedObservable ──strong──► autorun observer
                                     │
                                  WeakRef    ← allows GC of state
                                     │
                              state.groups (written on change)
```

```typescript
_stateAutorunRegistry = new FinalizationRegistry<DisposableStore>(store => store.dispose())
// registered as: _stateAutorunRegistry.register(state, pipeline.store)
```

### External Permission Mode Updates

When Claude executes `EnterPlanMode` or `ExitPlanMode` tools, `claudeMessageDispatch.ts` calls `IClaudeSessionStateService.setPermissionModeForSession()`, which fires `onDidChangeSessionState`. The pipeline subscribes to this event via a second autorun:

```typescript
const externalPermissionMode = observableFromEvent(
    this,
    Event.filter(sessionStateService.onDidChangeSessionState,
        e => e.sessionId === sessionId && e.permissionMode !== undefined),
    () => sessionStateService.getPermissionModeForSession(sessionId),
);
pipeline.store.add(autorun(reader => {
    pipeline.permissionMode.set(externalPermissionMode.read(reader), undefined);
}));
```

This autorun is registered on `pipeline.store`, so it is disposed along with all other pipeline autoruns when the state is GC'd.

### Session-Started Signal

The `isSessionStarted` observable controls whether folder items carry `locked: true`. It is set in two places:

- **Restoring an existing session** (new-state path): `pipeline.isSessionStarted.set(true, undefined)` in `_setupInputState` when `isExistingSession` is true.
- **First message sent** (new-untitled session): `ClaudeChatSessionContentProvider.createHandler()` calls `markSessionStarted(inputState)`, which looks up the pipeline from `_statePipelines` and sets `isSessionStarted` to `true`. This is how the folder gets locked after the user submits their first prompt.

`_statePipelines` is a `WeakMap<ChatSessionInputState, InputStateReactivePipeline>` that enables these external mutations. The `WeakMap` does not prevent GC of state objects (WeakMap keys are held weakly), so it complements rather than interferes with the `FinalizationRegistry`.

### Critical Invariant: Subscribe After Both Branches

`_setupInputState` creates `state` and `pipeline` in one of two branches:
- **`context.previousInputState` path** — VS Code already has a state for this session and is asking for a fresh one; seed from the old groups.
- **New-state path** — first call for this session; fetch groups from disk or defaults.

**The external permission mode subscription must run after both branches.** If it only runs in the new-state path, permission mode changes from `EnterPlanMode`/`ExitPlanMode` are silently dropped for every session after the first `getChatSessionInputState` call. Guard against this regression by ensuring the subscription is placed outside the `if/else` block.

## Session Metadata and Git Commands

### Session Metadata Enrichment

Each Claude session item carries metadata that drives the Sessions view UI (button visibility, status indicators). The `ClaudeChatSessionItemController._buildSessionMetadata()` method enriches session items with git repository state.

**Workspace Trust:** Session metadata and git change detection are gated on workspace trust via `IWorkspaceService.isResourceTrusted()`. For untrusted working directories, `_buildSessionMetadata()` returns only the `workingDirectoryPath` (no git data), and `getWorkspaceChanges()` is skipped entirely. The trust check is resolved once in `_createClaudeChatSessionItem` and passed into `_buildSessionMetadata` to avoid redundant calls. When trusted, the metadata fetch and workspace changes fetch run concurrently via `Promise.all`.

| Field | Type | Description |
|-------|------|-------------|
| `workingDirectoryPath` | `string` | Session's working directory (always present) |
| `repositoryPath` | `string?` | Git repository root path |
| `branchName` | `string?` | Current HEAD branch name |
| `upstreamBranchName` | `string?` | Upstream tracking ref (e.g., `origin/main`) |
| `hasGitHubRemote` | `boolean?` | Whether any remote points to GitHub |
| `incomingChanges` | `number?` | Commits behind upstream |
| `outgoingChanges` | `number?` | Commits ahead of upstream |
| `uncommittedChanges` | `number?` | Total uncommitted changes (merge + index + working tree + untracked) |

These metadata fields map to `when`-clause context keys in `package.json` (e.g., `sessions.hasGitRepository`, `sessions.hasUncommittedChanges`, `sessions.hasUpstream`) that control which action buttons appear in the Changes view.

### Git Action Commands

The `ClaudeChatSessionItemController` registers four git-related commands that appear as action buttons in the Sessions/Changes view:

| Command | When Visible | Action |
|---------|-------------|--------|
| `github.copilot.claude.sessions.commit` | Has git repo + uncommitted changes | Sends `/commit` prompt to the session |
| `github.copilot.claude.sessions.commitAndSync` | Has git repo + uncommitted changes + upstream | Sends `/commit and /sync` prompt |
| `github.copilot.claude.sessions.sync` | Has git repo + no uncommitted changes + upstream | Sends `/sync` prompt |
| `github.copilot.claude.sessions.initializeRepository` | No git repo | Calls `IGitService.initRepository()` on the session's workspace folder |

The commit, commitAndSync, and sync commands use a shared `_registerPromptCommand()` helper that extracts the session resource and dispatches via `workbench.action.chat.openSessionWithPrompt.claude-code`. The slash command strings come from the shared `builtinSlashCommands` module (`../../common/builtinSlashCommands.ts`).

## Testing

Unit tests are located in `node/test/`:
- `claudeCodeAgent.spec.ts`: Tests for agent and session logic
- `claudeCodeSessionService.spec.ts`: Tests for session loading and persistence
- `claudePluginService.spec.ts`: Tests for plugin location resolution
- `mockClaudeCodeSdkService.ts`: Mock SDK service for testing
- `fixtures/`: Sample `.jsonl` session files for testing

Additional tests for the session item controller and content provider:
- `../../chatSessions/vscode-node/test/claudeChatSessionContentProvider.spec.ts`: Tests for session metadata enrichment, git command handlers, session lifecycle, and content provider behavior

## Extension Registries

The Claude integration uses several registries to organize and manage extensibility points:

### Hook Registry

**Location:** `node/hooks/claudeHookRegistry.ts`

The hook registry allows registering custom hooks that execute at key points in the agent lifecycle. Hooks are organized by `HookEvent` type from the Claude SDK.

**Key Features:**
- Register handlers using `registerClaudeHook(hookEvent, ctor)`
- Handlers are constructed via dependency injection using `IInstantiationService`
- Hook instances are built from the registry and passed to the Claude SDK
- Multiple handlers can be registered for the same event

**Example Hook Events:**
- `'PreToolUse'` - Before a tool is executed
- `'PostToolUse'` - After a tool completes
- `'SubagentStart'` - When a subagent starts
- `'SubagentEnd'` - When a subagent completes
- `'SessionStart'` - When a session begins
- `'SessionEnd'` - When a session ends

**Current Hook Handlers:**
- `loggingHooks.ts` - Logging hooks for debugging and telemetry
- `sessionHooks.ts` - Session lifecycle management
- `subagentHooks.ts` - Subagent lifecycle tracking
- `toolHooks.ts` - Tool execution tracking and processing

### Slash Command Registry

**Location:** `vscode-node/slashCommands/claudeSlashCommandRegistry.ts`

The slash command registry manages custom slash commands available in Claude chat sessions. Commands allow users to trigger specific functionality via `/commandname` syntax.

**Key Features:**
- Register handlers using `registerClaudeSlashCommand(handler)`
- Each handler implements `IClaudeSlashCommandHandler` interface
- Commands can optionally register with VS Code Command Palette
- Handlers receive arguments, response stream, and cancellation token

**Handler Interface:**
```typescript
interface IClaudeSlashCommandHandler {
	readonly commandName: string;        // Command name (without /)
	readonly description: string;         // Human-readable description
	readonly commandId?: string;          // Optional VS Code command ID
	handle(args: string, stream: ChatResponseStream | undefined, token: CancellationToken): Promise<ChatResult | void>;
}
```

**UI Patterns for Slash Commands:**

Slash commands often need to present choices or gather input from users. When doing so, prefer the simpler one-shot APIs over the more complex builder APIs:

- **Prefer:** `vscode.window.showQuickPick()` - Simple function call that returns the selected item(s)
- **Avoid:** `vscode.window.createQuickPick()` - More complex, requires manual lifecycle management

- **Prefer:** `vscode.window.showInputBox()` - Simple function call that returns the entered text
- **Avoid:** `vscode.window.createInputBox()` - More complex, requires manual lifecycle management

The `show*` APIs are sufficient for most slash command use cases and result in cleaner, more maintainable code. Only use `create*` APIs when you need advanced features like dynamic item updates, multi-step wizards, or custom event handling.

**Current Slash Commands:**
- `/hooks` - Configure Claude Agent hooks for tool execution and events (from `hooksCommand.ts`)
- `/memory` - Open memory files (CLAUDE.md) for editing (from `memoryCommand.ts`)
- `/agents` - Create and manage specialized Claude agents (from `agentsCommand.ts`)
- `/terminal` - Create a terminal with Claude CLI configured to use Copilot Chat endpoints (from `terminalCommand.ts`) _Temporarily disabled pending legal review_

### Tool Permission Handlers

**Location:** `node/toolPermissionHandlers/` and `common/toolPermissionHandlers/`

Tool permission handlers control what actions Claude can take without user confirmation. They define the approval logic for various tool operations.

**Key Features:**
- Auto-approve safe operations (e.g., file edits within workspace)
- Request user confirmation for potentially dangerous operations
- Handlers are organized by platform (common, node, vscode-node)

**Handler Types:**
- **Common handlers** (`common/toolPermissionHandlers/`):
  - `bashToolHandler.ts` - Controls bash/shell command execution
  - `exitPlanModeHandler.ts` - Manages plan mode transitions
  - `askUserQuestionHandler.ts` - Delegates to the core `vscode_askQuestions` tool for question carousel UI

- **Node handlers** (`node/toolPermissionHandlers/`):
  - `editToolHandler.ts` - Handles file edit operations (Edit, Write, MultiEdit)

**Auto-approval Rules:**
- File edits are auto-approved if the file is within the workspace
- All other tools show a confirmation dialog via VS Code's chat API
- User denials send appropriate messages back to Claude

### MCP Server Registry

**Location:** `common/claudeMcpServerRegistry.ts`

The MCP server registry allows contributing MCP (Model Context Protocol) server configurations to the Claude SDK Options. Contributors provide server configurations that are merged and passed to the SDK at session start.

**Key Features:**
- Register contributors using `registerClaudeMcpServerContributor(ctor)`
- Contributors are constructed via dependency injection using `IInstantiationService`
- Contributors implement `IClaudeMcpServerContributor` with an async `getMcpServers()` method
- Server configurations are merged into a single `Record<string, McpServerConfig>` for the SDK

**Contributor Interface:**
```typescript
interface IClaudeMcpServerContributor {
	getMcpServers(): Promise<Record<string, McpServerConfig>>;
}
```

**Supported Server Types:**
- `McpStdioServerConfig` - Standard input/output process transport (`{ command, args?, env? }`)
- `McpSSEServerConfig` - Server-Sent Events (`{ type: 'sse', url, headers? }`)
- `McpHttpServerConfig` - HTTP transport (`{ type: 'http', url, headers? }`)
- `McpSdkServerConfigWithInstance` - In-process SDK servers

**Index Chain:**
- `common/mcpServers/index.ts` → Platform-agnostic contributors
- `node/mcpServers/index.ts` → Node-specific contributors (imports common first)
- `vscode-node/mcpServers/index.ts` → VS Code-specific contributors (imports node first)

**Extending the Registries:**

To add new functionality:

1. **New Hook Handler:**
   - Create a class implementing `HookCallbackMatcher`
   - Call `registerClaudeHook(hookEvent, YourHandler)` at module load time
   - Import your handler module in `node/hooks/index.ts`

2. **New Slash Command:**
   - Create a class implementing `IClaudeSlashCommandHandler`
   - Call `registerClaudeSlashCommand(YourHandler)` at module load time
   - Import your command module in `vscode-node/slashCommands/index.ts`
   - If providing a `commandId`, register the command in `package.json`:
     ```json
     {
       "command": "copilot.claude.yourCommand",
       "title": "Your Command Title",
       "category": "Claude Agent"
     }
     ```

3. **New Tool Permission Handler:**
   - Create handler in appropriate directory (common/node/vscode-node)
   - Implement tool approval logic
   - Import your handler module in `index.ts` to trigger registration

4. **New MCP Server Contributor:**
   - Create a class implementing `IClaudeMcpServerContributor`
   - Call `registerClaudeMcpServerContributor(YourContributor)` at module load time
   - Import your contributor module in the appropriate `mcpServers/index.ts` (common/node/vscode-node)

## Configuration

The integration respects VS Code settings:
- `github.copilot.advanced.claudeCodeDebugEnabled`: Enables debug logging from Claude Code SDK

## Upgrading Anthropic SDK Packages

For the complete upgrade process, use the **anthropic-sdk-upgrader** Claude Code agent. The agent provides step-by-step guidance for upgrading `@anthropic-ai/claude-agent-sdk` and `@anthropic-ai/sdk` packages, including:

- Checking changelogs and summarizing changes
- Categorizing changes by impact level
- Fixing compilation errors in key files
- Complete testing checklist
- Troubleshooting common issues

See `.claude/agents/anthropic-sdk-upgrader.md` for the full process.

## Dependencies

- `@anthropic-ai/claude-agent-sdk`: Official Claude Code SDK
- `@anthropic-ai/sdk`: Anthropic API types
- Internal services: `ILogService`, `IConfigurationService`, `IWorkspaceService`, `IToolsService`, etc.
