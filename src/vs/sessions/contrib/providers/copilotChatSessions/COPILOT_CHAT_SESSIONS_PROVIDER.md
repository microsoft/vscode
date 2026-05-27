# CopilotChatSessionsProvider — Default Copilot Provider

**File:** `src/vs/sessions/contrib/copilotChatSessions/browser/copilotChatSessionsProvider.ts`

The default sessions provider, registered with ID `'default-copilot'`. Wraps the existing agent session infrastructure into the extensible provider model. Supports three session types: **Copilot CLI** (local), **Copilot Cloud** (remote), and **Claude** (local, gated by `sessions.chat.claudeAgent.enabled`).

## Registration

Registered via `DefaultSessionsProviderContribution` workbench contribution at `WorkbenchPhase.AfterRestored`:

```
src/vs/sessions/contrib/copilotChatSessions/browser/copilotChatSessions.contribution.ts
```

```typescript
class DefaultSessionsProviderContribution extends Disposable {
    constructor(instantiationService, sessionsProvidersService) {
        const provider = instantiationService.createInstance(CopilotChatSessionsProvider);
        sessionsProvidersService.registerProvider(provider);
    }
}
```

## Identity

| Property | Value |
|----------|-------|
| `id` | `'default-copilot'` |
| `label` | `'Copilot Chat'` |
| `icon` | `Codicon.copilot` |
| `sessionTypes` | `[CopilotCLISessionType, CopilotCloudSessionType]` (+ `ClaudeCodeSessionType` when enabled) |

## Browse Actions

- **"Folders"** — Opens a folder dialog; creates a workspace with a `file://` URI
- **"Repositories"** — Executes `github.copilot.chat.cloudSessions.openRepository`; creates a workspace with a `github-remote-file://` URI

## New Session Classes

When `createNewSession(workspace)` is called, the provider creates one of two concrete `ISession` implementations based on the workspace URI scheme:

**`CopilotCLISession`** — For local `file://` workspaces:
- Implements `ISession` plus provider-specific observable fields (`permissionLevel`, `branchObservable`, `isolationModeObservable`)
- Performs async git repository resolution during construction (sets `loading` to true until resolved)
- Configuration methods: `setIsolationMode()`, `setBranch()`, `setModelId()`, `setMode()`, `setPermissionLevel()`, `setModeById()`
- Tracks selected options via `Map<string, IChatSessionProviderOptionItem>` and syncs to `IChatSessionsService`
- Uses `IGitService` to open the repository and resolve branch information

**`RemoteNewSession`** — For cloud `github-remote-file://` workspaces:
- Implements `ISession`
- Manages dynamic option groups from `IChatSessionsService.getOptionGroupsForSessionType()` with `when` clause visibility
- No-ops for isolation/branch/client mode (cloud-managed)
- Provides `getModelOptionGroup()`, `getOtherOptionGroups()` for UI to render provider-specific pickers
- Watches context key changes to dynamically show/hide option groups

**`ClaudeCodeNewSession`** — For Claude agent sessions (local `file://` workspaces):
- Implements `ISession` with simplified configuration (Claude manages its own worktrees and branches)
- No-ops for `setIsolationMode()` and `setBranch()`
- `setOption()` writes to `selectedOptions` map; options are propagated to `IChatSessionsService` during `_sendFirstChat()` via `updateSessionOptions()`
- Gated by the `sessions.chat.claudeAgent.enabled` setting (default: `true`)

## `AgentSessionAdapter` — Wrapping Existing Sessions

Adapts an existing `IAgentSession` from the chat layer into the `ISession` facade:
- Constructs with initial values from the agent session's metadata and timing
- `update(session)` performs a batched observable transaction to update all reactive properties
- Extracts workspace info, changes, description, and GitHub info from session metadata
- Maps `ChatSessionStatus` → `SessionStatus`
- Handles both CLI and Cloud session metadata formats for repository resolution

## Session Cache & Change Events

The provider maintains a `Map<string, AgentSessionAdapter>` cache keyed by resource URI:
- `_ensureSessionCache()` performs lazy initialization
- `_refreshSessionCache()` diffs current `IAgentSession` list against the cache, producing `added`, `removed`, and `changed` arrays
- Changed adapters are updated in-place via `adapter.update(session)`
- Change events are forwarded through `onDidChangeSessions`

## Send Flow

The provider exposes two entry points on `ISessionsProvider`:

- **`createNewChat(sessionId, prompt?)`** — Creates the backend chat model and returns the resulting `IChat`. The management service uses the returned `chat.resource` to open the widget *before* sending. For new sessions the provider also swaps the session's `mainChat` observable with the committed chat so the cached `ISession` reflects the real backend resource.
- **`sendRequest(sessionId, chatResource, options)`** — Sends a request for a chat that was already created via `createNewChat`. Internally it dispatches between:
  - `_sendFirstChat()` when the session is the current new session — resolves mode/permission/send options, calls `IChatService.sendRequest`, adds the temp session to the cache, fires `onDidChangeSessions`, waits for commit (untitled → real URI for CLI sessions), and then fires `onDidReplaceSession` with the committed session.
  - `_sendExistingChat()` when the session already has committed chats — sends to the existing chat resource.

For multi-chat sessions (`capabilities.supportsMultipleChats === true`), `createNewChat()` on an existing session calls `_createNewSubsequentChat()`, which creates a fresh `CopilotCLISession` linked to the parent via the `parentSessionId` option, registers it in `_currentNewSession`, and returns its `IChat`. A subsequent `sendRequest(sessionId, chat.resource, options)` then routes through `_sendFirstChat`.

The provider never opens the chat widget itself; widget opening is owned by the management service.

## New-Session Picker Contribution Model

**File:** `src/vs/sessions/contrib/copilotChatSessions/browser/copilotChatSessionsActions.ts`

The welcome/new-session view (`NewChatInputWidget`) renders three toolbar menus for configuration pickers. Each picker requires a three-part registration:

1. **Menu action** — `registerAction2()` with a `when` clause gating it to the correct session type
2. **Action view item** — `actionViewItemService.register()` to provide a custom widget instead of a button
3. **Picker widget** — A `Disposable` class with a `render(container)` method, wrapped in `PickerActionViewItem`

Model picker widgets that back the new-chat `/models` slash command also inject `INewChatModelPickerService` and register their opener with it. `NewChatInputWidget` scopes that service per input, so action view item factories must instantiate those model picker widgets from the factory's `instantiationService` argument rather than a contribution-level service.

### Toolbar Menus

| Menu | Purpose | Examples |
|------|---------|----------|
| `Menus.NewSessionConfig` | Session configuration (mode, model) | `ModePicker`, `CloudModelPicker`, unified model picker (CLI + Claude) |
| `Menus.NewSessionControl` | Session controls (permissions) | `PermissionPicker`, `ClaudePermissionModePicker` |
| `Menus.NewSessionRepositoryConfig` | Repository configuration | `IsolationPicker`, `BranchPicker` |

### Context Key Gating

Each picker action uses a `when` clause to show only for the correct session type:

| Expression | Matches |
|------------|---------|
| `IsActiveSessionCopilotChatCLI` | Copilot CLI sessions |
| `IsActiveSessionCopilotChatCloud` | Copilot Cloud sessions |
| `IsActiveSessionCopilotChatClaudeCode` | Claude sessions |

These are composed from `ActiveSessionTypeContext` (the session type ID) and `ActiveSessionProviderIdContext` (the provider ID).

### Adding a New Picker

```typescript
// 1. Register the menu action with a when clause
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'sessions.defaultCopilot.myPicker',
            title: localize2('myPicker', "My Picker"),
            f1: false,
            menu: [{
                id: Menus.NewSessionControl, // or NewSessionConfig, NewSessionRepositoryConfig
                group: 'navigation',
                order: 1,
                when: IsActiveSessionCopilotChatCLI, // gate to session type
            }],
        });
    }
    override async run(): Promise<void> { /* handled by action view item */ }
});

// 2. Register the action view item (in CopilotPickerActionViewItemContribution)
this._register(actionViewItemService.register(
    Menus.NewSessionControl, 'sessions.defaultCopilot.myPicker',
    (_action, _options, scopedInstantiationService) => {
        const picker = scopedInstantiationService.createInstance(MyPicker);
        return new PickerActionViewItem(picker);
    },
));
```

### Current Limitations

The picker model is currently **hardcoded per session type**. Each session type that needs pickers must register its own actions and widgets with appropriate `when` clauses. For example, the Copilot CLI permission picker (`PermissionPicker`) and the Claude permission mode picker (`ClaudePermissionModePicker`) are separate, hardcoded widgets even though they serve a similar purpose.

Context-menu actions on session list items are similarly hardcoded per session type. The `Delete...` action registered for `SessionItemContextMenuId` gates on both `chatSessionProviderId == COPILOT_PROVIDER_ID` *and* `chatSessionType != CLAUDE_CODE_SESSION_TYPE`, because Claude sessions (although exposed through the Copilot provider) don't support the native delete flow. Any new session type that opts into the Copilot provider but not into a shared action needs its own `chatSessionType` exclusion in the action's `when` clause.

Ideally, pickers would be **generic and contributable** — a session type would declare its option groups (as the Claude extension already does via `IChatSessionsService.setOptionGroupsForSessionType()`), and the welcome view would dynamically render pickers from those groups without needing per-type widget classes. The active-session chat widget (`chatInputPart.ts`) already has this generic infrastructure via `createChatSessionPickerWidgets()`, but the welcome view does not yet use it. Until the welcome view adopts this pattern, new session types must follow the hardcoded approach above.
