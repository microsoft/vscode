# Agent Session Projection (Agent Session Focus View Mode)

A new window mode that immerses the user in a specific agent session by showing a multi-diff view of all session changes (like edit session), replacing the command center with session context, and adding a subtle blue glow border.

## Current Implementation Status

### ✅ Completed

| Feature | Status | Notes |
|---------|--------|-------|
| `FocusViewService` | ✅ Done | Core service with enter/exit logic |
| `FocusViewCommandCenterControl` | ✅ Done | Titlebar pill UI with session title + close button |
| `ChatInputCommandCenterControl` | ✅ Done | Chat input box when no session is active |
| Working Sets per Session | ✅ Done | SCM-style working sets, persisted to storage |
| Modified Files Open on Entry | ✅ Done | Opens multi-diff editor showing all session changes |
| Title Updates on Session Switch | ✅ Done | `onDidChangeActiveSession` event |
| New Chat on Exit | ✅ Done | Clears sidebar when leaving |
| Blue Glow Border | ✅ Done | CSS `.focus-view-active` class |
| Context Key `inFocusViewMode` | ✅ Done | For conditional UI |
| Feature Flag Setting | ✅ Done | `chat.agentSessionProjection.enabled` (default: false, experimental) |
| Actions Gated by Setting | ✅ Done | Uses `config.chat.agentSessionProjection.enabled` context key |

### 🔲 TODO

| Feature | Priority | Notes |
|---------|----------|-------|
| Session Picker (no context) | Medium | Show picker when entering without a session selected |
| Artifacts Count Badge | Low | Show count in command center control |
| Live Updates | Low | Auto-refresh if session changes while viewing |
| Tests | Medium | Unit and integration tests |

---

## Overview

When `chat.agentSessionProjection.enabled` is set to `true`, the command center behavior changes:

1. **Default (no session active):** Command center shows a chat input box ("Ask me anything...")
2. **Session active (Agent Session Projection mode):** Command center shows glowing session title + close button

When a user enters Agent Session Projection mode:

- **Command center** shows the session title with a close button (glowing blue)
- **Editor** shows multi-diff view of all session changes (like edit session)
- **Blue glow border** provides subtle visual distinction that you're "inside" a session
- **Chat panel** shows the selected session's conversation

### Before/After

**Setting OFF:** Normal VS Code command center (workspace name).

**Setting ON, no session:** Chat input box ("Ask me anything...") replaces command center.

**Setting ON, session active:** Glowing session title + close button:
- `[copilot-icon] Session Title | X`
- Multi-diff editor shows all session changes (original vs modified)
- Chat panel shows session's conversation
- Subtle blue glow around editor area

---

## Feature Flag

The entire feature is gated behind a setting:

```json
"chat.agentSessionProjection.enabled": {
    "type": "boolean",
    "default": false,
    "tags": ["experimental"],
    "markdownDescription": "Controls whether Agent Session Projection mode is enabled for reviewing agent sessions in a focused workspace."
}
```

- **Service check:** `FocusViewService._isEnabled()` returns early if disabled
- **Actions:** `EnterFocusViewAction` uses `ContextKeyExpr.has('config.chat.agentSessionProjection.enabled')` in precondition
- **Menus:** Context menu items also gated by the config context key

---

## Architecture

### Key Services & Infrastructure

| Component | Location | Purpose | Status |
|-----------|----------|---------|--------|
| `FocusViewService` | `focusViewService.ts` | State management, enter/exit logic | ✅ |
| `FocusViewCommandCenterControl` | `focusViewCommandCenterControl.ts` | Titlebar UI when in focus view | ✅ |
| `CommandCenterControlRegistry` | `titlebar/commandCenterControlRegistry.ts` | Registry for alternative command center controls | ✅ |
| Working Sets API | `editorGroupsService` | Save/restore tab state (like SCM working sets) | ✅ |
| `ChatContextKeys.inFocusViewMode` | `chatContextKeys.ts` | Conditional UI rendering | ✅ |
| Setting `chat.agentSessionProjection.enabled` | `chat.contribution.ts` | Feature flag | ✅ |

### Session Resource Types

**Cloud Sessions** (via `CopilotCloudSessionsProvider`):
1. **PR Webview** — `toOpenPullRequestWebviewUri()` via GitHub PR extension
2. **All Changes Multi-Diff** — `openChanges()` method using `_workbench.openMultiDiffEditor`
3. File changes from `IChatSessionFileChange[]`

**Local Sessions** (via `LocalAgentSessionsProvider`):
1. Files from `editingSession.entries.get()` with `modifiedURI`/`originalURI`
2. Optionally: Multi-diff view of all session changes

---

## Implementation Details

### Step 1: `FocusViewService` ✅

Location: `src/vs/workbench/contrib/chat/browser/agentSessions/focusViewService.ts`

```typescript
interface IFocusViewService {
    readonly isActive: boolean;
    readonly activeSession: IAgentSession | undefined;
    readonly onDidChangeFocusViewMode: Event<boolean>;
    readonly onDidChangeActiveSession: Event<IAgentSession | undefined>;
    enterFocusView(session: IAgentSession): Promise<void>;
    exitFocusView(): Promise<void>;
}
```

Key implementation details:
- Injects `IConfigurationService` and checks `chat.agentSessionProjection.enabled` at start of `enterFocusView()`
- Uses `IEditorGroupsService` working sets API for tab state
- Persists per-session working sets to `StorageScope.WORKSPACE`
- Opens session's changes in **multi-diff editor** (like edit session view) using `_workbench.openMultiDiffEditor`
- Fires `onDidChangeActiveSession` when switching between sessions

### Step 2: Context Key ✅

Location: `src/vs/workbench/contrib/chat/common/actions/chatContextKeys.ts`

```typescript
export const inFocusViewMode = new RawContextKey<boolean>('chatInFocusViewMode', false, ...);
```

### Step 3: Working Sets ✅

Using `IEditorGroupsService` working sets API (same pattern as SCM working sets):

```typescript
// On enter (first time)
this._nonFocusViewWorkingSet = this.editorGroupsService.saveWorkingSet('focus-view-backup');

// On session switch
const previousWorkingSet = this.editorGroupsService.saveWorkingSet(`focus-view-session-${sessionKey}`);
this._sessionWorkingSets.set(previousSessionKey, previousWorkingSet);

// Restore session's working set
await this.editorGroupsService.applyWorkingSet(savedWorkingSet, { preserveFocus: true });

// On exit
await this.editorGroupsService.applyWorkingSet(this._nonFocusViewWorkingSet);
```

### Step 4: `FocusViewCommandCenterControl` ✅

Location: `src/vs/workbench/contrib/chat/browser/agentSessions/focusViewCommandCenterControl.ts`

- Registered via `CommandCenterControlRegistry` with `contextKey: ChatContextKeys.inFocusViewMode.key`
- Shows copilot icon + session title + close button
- Listens to `onDidChangeActiveSession` to update title when switching sessions

### Step 5: Blue Glow Border ✅

Location: `src/vs/workbench/contrib/chat/browser/agentSessions/media/focusView.css`

```css
.monaco-workbench.focus-view-active {
    /* Blue glow effect */
}
```

Class toggled via `this.layoutService.mainContainer.classList.add('focus-view-active')`

### Step 6: Actions ✅

Location: `src/vs/workbench/contrib/chat/browser/agentSessions/focusViewActions.ts`

- `EnterFocusViewAction` - precondition includes `config.chat.agentSessionProjection.enabled`
- `ExitFocusViewAction` - keybinding: Escape when in focus view mode
- `OpenInChatPanelAction` - opens session in chat panel without entering focus view

### Step 7: Setting ✅

Location: `src/vs/workbench/contrib/chat/browser/chat.contribution.ts`

```typescript
'chat.agentSessionProjection.enabled': {
    type: 'boolean',
    default: false,
    tags: ['experimental'],
    markdownDescription: "Controls whether Agent Session Projection mode is enabled..."
}
```

---

## Implementation Steps (Original - for reference)

---

## Extension API Surface

The cloud session provider (`CopilotCloudSessionsProvider`) already has these methods we can expose/call:

```typescript
// Open PR webview (needs to be added/exposed)
async openPullRequestWebview(sessionResource: Uri): Promise<void>;

// Open changes multi-diff (already exists)
async openChanges(chatSessionItemResource: Uri): Promise<void>;
```

These can be added to `IChatSessionItemProvider` interface as optional methods:

```typescript
interface IChatSessionItemProvider {
    // ... existing methods

    // Optional focus view support
    openPullRequestWebview?(sessionResource: URI): Promise<void>;
    openChanges?(sessionResource: URI): Promise<void>;
}
```

---

## Open Questions / Considerations

### 1. PR Content Discovery
Where exactly is the PR URI stored for cloud sessions? Need to expose `toOpenPullRequestWebviewUri()` or equivalent from the extension.

**Status:** 🔲 Not yet implemented for cloud sessions

### 2. Editor Layout
Should PR webview and changes diff open side-by-side (split), or as sequential tabs with PR first?

**Decision:** Sequential tabs via `openEditors()`. Currently opens all modified files.

### 3. Live Updates ✅
If a cloud session adds more file changes while in focus view, should we auto-update the diff view?

**Status:** Not yet implemented. Could listen to `onDidChangeChatSessionItems`.

### 4. Dirty Editors on Exit ✅
If user has unsaved changes in focus view tabs, the working set restore will prompt for save.

**Decision:** Acceptable UX — matches SCM working sets behavior.

### 5. Persistence Across Reload ✅
Should focus view state persist across VS Code restarts?

**Implemented:** Per-session working sets are persisted to `StorageScope.WORKSPACE` storage.
Focus view mode itself does NOT persist across reload (user must re-enter).

### 6. Multi-Window Support
Should focus view apply per-window?

**Status:** 🔲 Not tested. Current implementation uses singleton service.

### 7. Artifacts Count Semantics
What does "4 artifacts" count?

**Status:** 🔲 Not yet implemented. Badge not shown in command center control.

---

## File Structure

```
src/vs/workbench/contrib/chat/browser/agentSessions/
├── agentSessions.contribution.ts    # Registers focus view service + command center controls ✅
├── agentSessions.ts                 # Existing constants
├── agentSessionsService.ts          # Existing service
├── focusViewService.ts              # Focus view state management ✅
├── focusViewCommandCenterControl.ts # Command center UI (glowing session title) ✅
├── chatInputCommandCenterControl.ts # Command center UI (chat input box) ✅
├── focusViewActions.ts              # Enter/exit actions ✅
├── FOCUS_VIEW_PLAN.md               # This planning document
└── media/
    └── focusView.css                # Focus view styles (glow border + controls) ✅

src/vs/workbench/contrib/chat/browser/
├── chat.contribution.ts             # chat.agentSessionProjection.enabled setting ✅

src/vs/workbench/contrib/chat/common/actions/
├── chatContextKeys.ts               # inFocusViewMode context key ✅

src/vs/workbench/browser/parts/titlebar/
├── commandCenterControlRegistry.ts  # Registry for command center controls ✅
├── commandCenterControl.ts          # Default command center (unchanged)
```

---

## Testing Plan

### Manual Testing Checklist

- [ ] Enable `chat.agentSessionProjection.enabled` setting
- [ ] "Enter Agent Session Projection" command appears in Command Palette
- [ ] Right-click session in Agents view shows "Enter Agent Session Projection" menu item
- [ ] Entering focus view replaces command center with session title
- [ ] Session's modified files open as tabs
- [ ] Blue glow border appears
- [ ] Switching sessions preserves each session's tab state
- [ ] Exiting via X button restores original tabs
- [ ] Exiting via Escape key works
- [ ] "New Chat" is executed on exit (sidebar cleared)
- [ ] With setting disabled, commands don't appear and service returns early

### Unit Tests (TODO)

1. **`FocusViewService` tests:**
   - `enterFocusView` returns early when setting disabled
   - `enterFocusView` saves working set and opens resources
   - `exitFocusView` restores working set
   - Session switching saves/restores correct working sets
   - Events fire correctly

2. **Integration tests (TODO):**
   - Entering focus view from Agents panel
   - Command center swaps correctly
   - Tabs filter to session files
   - Exit via X button restores previous state
   - Exit via Escape keybinding works
