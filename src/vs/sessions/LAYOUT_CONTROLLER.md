# Layout Controller — Per-Session Layout State

This document specifies the behaviour of `LayoutController`
([contrib/layout/browser/sessionLayoutController.ts](contrib/layout/browser/sessionLayoutController.ts)),
the contribution that manages workbench layout as the user switches between sessions.

It is the detailed companion to [LAYOUT.md §10 Per-Session Layout State](LAYOUT.md#10-per-session-layout-state).

---

## 1. Overview

The Agents window keeps a single **active session** but lets the user move between many.
Each session "owns" a small amount of layout state — which side parts are visible and which
editors are open — so that returning to a session restores the working context the user left it in.

`LayoutController` owns three independent pieces of per-session state, all keyed by session
resource (`URI`) and persisted to workspace storage:

| State | Storage map | Scope |
|-------|-------------|-------|
| Auxiliary bar (secondary side bar) | `_viewStateBySession` | visibility + active view container |
| Panel (terminal / debug output) | `_panelVisibilityBySession` | visibility only |
| Editor working set | `_workingSets` | open editors in the grid editor part |

All state flows from the `activeSession` **observable** (never events). The controller derives
`activeSessionResourceObs`, `activeSessionHasChangesObs`, `activeSessionIsUntitledObs`,
`activeSessionHasWorkspaceObs`, and `multipleSessionsVisibleObs`, then reacts with `autorun`.

---

## 2. The Switch Trigger

Each sync is an `autorun` that reads `activeSessionResourceObs`. The controller keeps a local
`previousSessionResource` so it can detect a **real switch** (`previous !== active`) versus an
initial load or an unrelated re-evaluation.

### Multiple visible sessions

When more than one session is visible at once (the Sessions Part grid shows several session views),
**all per-session sync is suppressed**:

- The aux-bar / panel sync autoruns bail out early (`multipleSessionsVisibleObs`).
- A dedicated autorun **clears** `_viewStateBySession`, `_panelVisibilityBySession`, and
  `_pendingTurnStateByResource` for every visible session.

This guarantees that after collapsing back to a single session the **default visibility logic**
(§3.2) runs again instead of restoring stale single-session state. Editor working sets are *not*
cleared — they survive multi-session mode.

---

## 3. Auxiliary Bar

Skipped entirely on mobile web (`isWeb && isMobile`) to avoid disruptive auto-expand on narrow viewports.

### 3.1 Switching away — capture

`_captureViewState(previousSession)` records, for the **outgoing** session:

- `auxiliaryBarVisible` — whether the aux bar is currently visible.
- `auxiliaryBarActiveViewContainerId` — the active aux-bar view container (Files vs Changes).

### 3.2 Switching to — restore

`_syncAuxiliaryBarVisibility(resource, hasWorkspace, isUntitled, hasChanges)` applies state in
strict priority order:

1. **No resource / no workspace** → do nothing.
2. **Untitled session** → open the Files container (`SESSIONS_FILES_CONTAINER_ID`), leave visibility as is.
3. **Saved state exists**:
   - was **hidden** → hide the aux bar and stop.
   - was visible with an active container → reopen that container and stop.
4. **No saved state (first visit) — defaults**:
   - session **has changes** → open the Changes view (`CHANGES_VIEW_ID`).
   - otherwise → open the Files container.

### 3.3 Auto-reveal on new changes

A separate autorun watches for turn completion (also skipped on mobile web). When a chat request
is submitted (`onDidSubmitRequest`), the controller records `IPendingTurnState`
(`hadChangesBeforeSend`, `submittedAt`) for the session. When that session's `lastTurnEnd`
advances past `submittedAt`:

- if there were **no** changes before the turn but there **are** changes now, the aux bar is
  revealed (`setPartHidden(false, AUXILIARYBAR_PART)`) and the session's saved view state is
  cleared so it stays visible on the next switch.

This only applies to the single-visible-session case; the pending state is dropped when multiple
sessions are visible.

### 3.4 Editor / aux-bar invariant

The editor part must not be left visible without the auxiliary bar
(`_enforceAuxiliaryBarWhenEditorVisible`): when the editor part *becomes* visible the aux bar is
revealed. So opening a file from chat reveals the editor **and** the secondary side bar.

The one exception is **working-set restoration on session switch** (§5): that editor reveal is
programmatic, so the invariant is suppressed (`_suppressAuxiliaryBarEnforcement`) and the
session's saved aux-bar visibility wins. A side bar the user hid for a session therefore stays
hidden when they return to it. The suppression is a synchronous re-entrancy guard around the
`setPartHidden(false, EDITOR_PART)` call — the part-visibility event fires synchronously, so the
guard reliably covers exactly that reveal.

---

## 4. Panel

`_syncPanelVisibility(resource)`:

- No active session → hide the panel.
- Otherwise restore `_panelVisibilityBySession.get(resource)`, defaulting to **hidden** when there
  is no record.

The per-session record is updated whenever the user toggles the panel: an
`onDidChangePartVisibility` listener for `PANEL_PART` writes the new visibility for the active
session (suppressed while multiple sessions are visible).

---

## 5. Editor Working Sets

Active only when `workbench.editor.useModal` is **not** `'all'` (editors live in the grid editor
part rather than as modal overlays). Driven by `_useModalConfigObs`.

### 5.1 Workspace-folder ordering

The `activeSession` observable updates **before** the workbench's workspace folders update. To
avoid restoring editors into the wrong workspace, `activeSessionForWorkingSet`
(`derivedObservableWithCache`) holds back the new session until the workspace folders reflect its
working directory.

### 5.2 Save / apply on switch

Using `runOnChange(activeSessionForWorkingSet, ...)`:

- **Outgoing session** (skip untitled): `_saveWorkingSet` snapshots the currently open editors as a
  named working set (`session-working-set:<resource>`); sessions with no visible editors store nothing.
- **Incoming session**: `_applyWorkingSet` restores its saved working set (or `'empty'`). All
  applies are serialized through a `Sequencer`. When not in modal mode and the working set is
  non-empty, the editor part is revealed before/after applying via `_revealEditorPartForWorkingSet`,
  which suppresses the editor→aux-bar invariant (§3.4) so the session's saved aux-bar visibility is
  honored.

On initial load (no previous session) the controller only applies a working set if one is already
saved for the incoming session — it never applies `'empty'`, to avoid closing editors being restored.

### 5.3 Cleanup

`onDidChangeSessions` removes working sets for **archived** or **deleted** sessions
(`_deleteWorkingSet`, which also drops the corresponding view state).

---

## 6. Persistence

- All state serializes to the workspace-scoped key `sessions.layoutState` on
  `IStorageService.onWillSaveState` (`_saveState`), with a `StorageTarget.MACHINE` target.
- `_saveState` captures the active session's current view state and working set (skipping untitled /
  multi-session cases) and writes one `ISessionLayoutEntry` per known session resource.
- `_loadState` reads `sessions.layoutState`; if absent it performs a one-time migration from the
  legacy `sessions.workingSets` key and then removes it. Corrupted data is dropped defensively.

---

## 7. Key Invariants

- **Observables, not events**, drive all session-switch logic.
- **Multiple visible sessions** disable per-session view/panel sync and clear that state (working
  sets preserved).
- **Default visibility** (§3.2 step 4) only applies when a session has no saved aux-bar state.
- The **editor part implies the auxiliary bar** when it *becomes* visible (e.g. opening a file from
  chat), **except** during working-set restoration on session switch, where the session's saved
  aux-bar visibility wins (so a hidden side bar is respected).
- Working-set save/apply waits for **workspace folders** to catch up with the active session.
