# CopilotChatSessionsProvider — Default Copilot Provider

**File:** `src/vs/sessions/contrib/copilotChatSessions/browser/copilotChatSessionsProvider.ts`

The default sessions provider, registered with ID `'default-copilot'`. Wraps the existing agent session infrastructure into the extensible provider model. Supports two session types: **Copilot CLI** (local) and **Copilot Cloud** (remote).

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
| `sessionTypes` | `[CopilotCLISessionType, CopilotCloudSessionType]` |

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

1. Validate the session is a current new session (`CopilotCLISession` or `RemoteNewSession`)
2. For the first chat, call `_sendFirstChat()`:
   a. Resolve mode, permission level, and send options from session configuration
   b. Open the chat widget via `IChatWidgetService.openSession()`
   c. Load the session model and apply selected model, mode, and options
   d. Send the request via `IChatService.sendRequest()`
   e. Add temp session to cache and fire `onDidChangeSessions`
   f. Wait for session commit (untitled → real URI)
   g. Replace via `onDidReplaceSession` event with the committed session
3. For subsequent chats (if `multipleChatsPerSession` enabled), call `_sendSubsequentChat()`
4. Wrap the new agent session as `AgentSessionAdapter` and return it
5. Clear the current new session reference
