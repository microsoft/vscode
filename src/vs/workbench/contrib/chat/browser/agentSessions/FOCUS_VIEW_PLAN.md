# Agent Session Focus View Mode

A new window mode that immerses the user in a specific agent session by filtering tabs to session-relevant files, replacing the command center with session context, and adding a subtle blue glow border.

## Overview

When a user selects an agent session from the Agents view, VS Code enters "focus view mode":

- **Command center** is replaced with session title + artifacts count + exit button
- **Tabs** are filtered to show only session-relevant resources
- **Blue glow border** provides subtle visual distinction that you're "inside" a session
- **Agents panel** drills into the selected session's conversation

### Before/After

**Before:** Normal VS Code with Agents panel showing list of sessions. Command center shows "Ask for anything..."

**After:** User clicks a session → Focus view activates:
- Command center: `[copilot-icon] Refining preview layout and icons | 4 artifacts | X`
- Tabs filtered to session files (e.g., Preview, preview-panel.tsx, icon-grid.tsx, style.css)
- Agents panel shows session's chat history
- Subtle blue glow around editor area

---

## Architecture

### Key Services & Infrastructure

| Component | Location | Purpose |
|-----------|----------|---------|
| `FocusViewService` | `agentSessions/focusViewService.ts` | State management, enter/exit logic |
| `FocusViewCommandCenterControl` | `agentSessions/focusViewCommandCenterControl.ts` | Titlebar UI when in focus view |
| Working Sets API | `editorGroupsService` | Save/restore tab state (like SCM working sets) |
| `InFocusViewModeContext` | Context key | Conditional UI rendering |

### Session Resource Types

**Cloud Sessions** (via `CopilotCloudSessionsProvider`):
1. **PR Webview** — `toOpenPullRequestWebviewUri()` via GitHub PR extension
2. **All Changes Multi-Diff** — `openChanges()` method using `_workbench.openMultiDiffEditor`
3. File changes from `IChatSessionFileChange[]`

**Local Sessions** (via `LocalAgentSessionsProvider`):
1. Files from `editingSession.entries.get()` with `modifiedURI`/`originalURI`
2. Optionally: Multi-diff view of all session changes

---

## Implementation Steps

### Step 1: Create `FocusViewService`

Location: `src/vs/workbench/contrib/chat/browser/agentSessions/focusViewService.ts`

```typescript
interface IFocusViewService {
    // State
    readonly isFocusViewActive: IObservable<boolean>;
    readonly activeSession: IObservable<IAgentSession | undefined>;

    // Actions
    enterFocusView(session: IAgentSession): Promise<void>;
    exitFocusView(): Promise<void>;
}
```

Responsibilities:
- Track active focus view state
- Store backup working set ID for restoration
- Coordinate with `IEditorGroupsService` for tab management
- Fire `onDidChangeFocusViewMode` event

### Step 2: Add Layout State Keys

Location: `src/vs/workbench/browser/layout.ts`

Following the Zen Mode pattern:

```typescript
const LayoutStateKeys = {
    // ... existing keys
    FOCUS_VIEW_ACTIVE: new RuntimeStateKey<boolean>('focusView.active', StorageScope.WORKSPACE, StorageTarget.MACHINE, false),
    FOCUS_VIEW_SESSION_URI: new RuntimeStateKey<string | undefined>('focusView.sessionUri', StorageScope.WORKSPACE, StorageTarget.MACHINE, undefined),
    FOCUS_VIEW_EXIT_INFO: new RuntimeStateKey('focusView.exitInfo', StorageScope.WORKSPACE, StorageTarget.MACHINE, {
        backupWorkingSetId: undefined as string | undefined,
    }),
};
```

### Step 3: Add Context Key

Location: `src/vs/workbench/contrib/chat/common/chatContextKeys.ts`

```typescript
export const InFocusViewModeContext = new RawContextKey<boolean>('inFocusViewMode', false);
```

### Step 4: Implement Tab Save/Restore

Using `IEditorGroupsService` working sets API (same pattern as SCM working sets):

```typescript
// On enter focus view
const backupId = this.editorGroupsService.saveWorkingSet('focus-view-backup');
this.storeBackupId(backupId);
await this.editorGroupsService.applyWorkingSet('empty', { preserveFocus: true });
await this.openSessionResources(session);

// On exit focus view
const backupId = this.getBackupId();
const backup = this.editorGroupsService.getWorkingSets().find(ws => ws.id === backupId);
if (backup) {
    await this.editorGroupsService.applyWorkingSet(backup);
    this.editorGroupsService.deleteWorkingSet(backup);
}
```

### Step 5: Implement `getSessionResources()`

```typescript
async getSessionResources(session: IAgentSession): Promise<ISessionResource[]> {
    const resources: ISessionResource[] = [];

    if (session.providerType === AgentSessionProviders.Cloud) {
        // 1. PR Webview (first artifact for cloud sessions)
        const prUri = await this.getPullRequestWebviewUri(session);
        if (prUri) {
            resources.push({ type: 'pr-webview', uri: prUri });
        }

        // 2. All Changes Multi-Diff
        resources.push({ type: 'changes-diff', sessionResource: session.resource });

    } else {
        // Local session: use editing session entries
        const editingSession = session.editingSession;
        if (editingSession) {
            for (const entry of editingSession.entries.get()) {
                resources.push({
                    type: 'file',
                    uri: entry.modifiedURI,
                    originalUri: entry.originalURI
                });
            }
        }
    }

    return resources;
}
```

### Step 6: Create `FocusViewCommandCenterControl`

Location: `src/vs/workbench/contrib/chat/browser/agentSessions/focusViewCommandCenterControl.ts`

Renders the mockup design:
- Copilot icon (left)
- Session title (center)
- Artifacts count badge (e.g., "4 artifacts")
- X close button (right)

Style: Pill/capsule appearance matching the mockup.

```typescript
class FocusViewCommandCenterControl extends Disposable {
    constructor(
        private readonly focusViewService: IFocusViewService,
        private readonly agentSessionsService: IAgentSessionsService,
        // ... other dependencies
    ) {
        // Build UI elements
        // - Icon container with copilot icon
        // - Title label bound to activeSession.title
        // - Badge showing artifacts count
        // - Close button calling exitFocusView()
    }
}
```

### Step 7: Modify Titlebar

Location: `src/vs/workbench/browser/parts/titlebar/titlebarPart.ts`

In `createTitle()` method, add conditional rendering:

```typescript
private createTitle(): void {
    if (this.contextKeyService.getContextKeyValue('inFocusViewMode')) {
        // Focus View mode - show session title control
        const focusViewControl = this.instantiationService.createInstance(
            FocusViewCommandCenterControl
        );
        reset(this.title, focusViewControl.element);
    } else if (!this.isCommandCenterVisible) {
        // Text Title mode
        this.title.textContent = this.windowTitle.value;
    } else {
        // Command Center mode
        const commandCenter = this.instantiationService.createInstance(
            CommandCenterControl, this.windowTitle, this.hoverDelegate
        );
        reset(this.title, commandCenter.element);
    }
}
```

Listen for context key changes to re-render.

### Step 8: Add Blue Glow Border

Location: `src/vs/workbench/contrib/chat/common/chatColors.ts`

```typescript
export const focusViewBorder = registerColor('focusView.border', {
    dark: '#007ACC',
    light: '#007ACC',
    hcDark: contrastBorder,
    hcLight: contrastBorder
}, localize('focusViewBorder', "Border color when focus view mode is active."));
```

CSS (in workbench styles):

```css
.monaco-workbench.focus-view-active .editor-part {
    box-shadow: inset 0 0 0 2px var(--vscode-focusView-border),
                0 0 20px var(--vscode-focusView-border);
}
```

Toggle class on workbench container when entering/exiting focus view.

### Step 9: Wire Entry/Exit Actions

**Entry:**
- Click handler on agent session items in Agents view
- Command: `agentSessions.enterFocusView`

**Exit:**
- X button in focus view command center
- Keybinding: `Escape` (when `inFocusViewMode` is true)
- Command: `agentSessions.exitFocusView`

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

### 2. Editor Layout
Should PR webview and changes diff open side-by-side (split), or as sequential tabs with PR first?

**Recommendation:** Sequential tabs, PR first, changes diff second.

### 3. Live Updates
If a cloud session adds more file changes while in focus view, should we auto-update the diff view?

**Recommendation:** Yes, listen to `onDidChangeChatSessionItems` and refresh if active session changes.

### 4. Dirty Editors on Exit
If user has unsaved changes in focus view tabs, the working set restore will prompt for save.

**Recommendation:** This is acceptable UX — matches SCM working sets behavior.

### 5. Persistence Across Reload
Should focus view state persist across VS Code restarts?

**Recommendation:** Yes, use `StorageScope.WORKSPACE` to restore into focus view for same session.

### 6. Multi-Window Support
Should focus view apply per-window?

**Recommendation:** Yes, each window can independently be in focus view mode.

### 7. Artifacts Count Semantics
What does "4 artifacts" count?
- Cloud: PR (1) + file changes count?
- Local: Just file changes count?

**Recommendation:** Count all resources (PR counts as 1, each file counts as 1).

---

## File Structure

```
src/vs/workbench/contrib/chat/browser/agentSessions/
├── agentSessions.contribution.ts    # Register focus view service
├── agentSessions.ts                 # Existing constants
├── agentSessionsService.ts          # Existing service
├── focusViewService.ts              # NEW: Focus view state management
├── focusViewCommandCenterControl.ts # NEW: Command center UI
├── focusViewActions.ts              # NEW: Enter/exit actions
└── media/
    └── focusView.css                # NEW: Focus view styles (glow border)
```

---

## Testing Plan

1. **Unit tests** for `FocusViewService`:
   - `enterFocusView` saves working set and opens resources
   - `exitFocusView` restores working set
   - State observables update correctly

2. **Integration tests**:
   - Entering focus view from Agents panel
   - Command center swaps correctly
   - Tabs filter to session files
   - Blue glow border appears
   - Exit via X button restores previous state
   - Exit via Escape keybinding works

3. **Cloud session tests** (requires copilot-chat extension):
   - PR webview opens first
   - Changes diff opens second

4. **Local session tests**:
   - Editing session files open correctly
