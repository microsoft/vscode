# Base Session Layout Controller — Spec

Specifies [`baseSessionLayoutController.ts`](./baseSessionLayoutController.ts) (`BaseLayoutController`),
the abstract, platform-agnostic controller that manages the per-session layout state shared by every
layout. Platform-specific auxiliary bar behaviour lives in the desktop / mobile subclasses
([desktop spec](./desktopSessionLayoutController.md), [mobile spec](./mobileSessionLayoutController.md)).

This is the file-level companion to [LAYOUT_CONTROLLER.md](../../../LAYOUT_CONTROLLER.md).

- **Rules** describe the user-visible behaviour, grouped by scenario. Each rule has a stable reference
  tag (`[B*]`) used by the code and tests; numbering does not imply an order.
- **Implementation notes** describe *how* the rules are realized (storage keys, observables, hooks).
  Read these only when changing the code, not to understand the behaviour.

---

## Rules

### Scenario: each session keeps its own layout
Switching to a session restores the layout you last had for it; switching away leaves the other
session's layout untouched.

#### B1 — Panel visibility
The bottom panel's visibility is remembered per session and defaults to hidden. Toggling the panel
updates that session's remembered state.

#### B2 — Open editors
Each session restores its own set of open editors when you activate it. Switching sessions saves the
editors you had open and applies the target session's. New / untitled sessions, and sessions with no
saved editors, never force the editor area open or wipe it. If you hid the editor part for a session
(e.g. by closing the Side Panel while keeping editors open), restoring it keeps the editor part hidden
instead of forcing it back open.

### Scenario: layout survives an app restart
A session's remembered layout is preserved when the app is closed and restored when it reopens.

#### B3 — Restored on start
On startup each session's saved layout is restored. Corrupt data is ignored, and a one-time migration
upgrades layout saved by older versions.

#### B4 — Saved on close
Closing or reloading the app saves every session's current layout so B3 can restore it next time.

### Scenario: several sessions shown at once
When more than one session is visible at the same time, there is no single "active" layout to apply.

#### B5 — Fall back to defaults
While multiple sessions are visible, per-session panel restore is paused and the remembered panel /
auxiliary-bar state for those sessions is discarded, so collapsing back to a single session shows the
default layout instead of stale state. Open editors are still preserved.

---

## Implementation notes

- **Observable-driven** — all session-switch logic reacts to the `activeSession` / `visibleSessions`
  observables via `autorun` / `derived`, never events for control flow. Derives `activeSessionResourceObs`
  (resource-equality de-duplicated) and `multipleSessionsVisibleObs`.
- **Panel [B1]** — `_syncPanelVisibility(resource)` restores the record (default hidden); a live
  `onDidChangePartVisibility` listener for `PANEL_PART` updates it (suppressed while multiple sessions
  are visible).
- **Working sets [B2]** — always active, regardless of `workbench.editor.useModal`: browser editors
  dock in the shared grid editor part even when `useModal` is `'all'` (they except themselves from the
  modal part), so their tabs still need per-session capture/restore in that mode. `_useModalConfigObs`
  is only consulted inside `_applyWorkingSet` to decide whether to auto-reveal the editor part (skipped
  in modal mode, since modal editors manage their own visibility). `activeSessionForWorkingSet`
  (`derivedObservableWithCache`) holds back the new session until the workspace folders reflect its
  working directory. Save/apply on switch via a serializing `Sequencer`; initial restore applies a saved
  set under `suppressEditorPartAutoVisibility()` only. `_saveWorkingSet` also records the editor part's
  hidden state per session (`_editorPartHiddenBySession`, only while a single session is visible — the
  editor area is shared in multi-session mode) so a switch-back `_applyWorkingSet` skips the editor-part
  reveal for a session whose editor part was left hidden. Cleanup on `onDidChangeSessions`
  (`_deleteWorkingSet` drops only the working set, never view state).
- **Persistence & migration [B3]** — per-session state is keyed by session `URI` and persisted to the
  workspace-scoped storage key `sessions.layoutState` (`StorageTarget.MACHINE`). `_loadState` restores
  on construction and drops corrupt data defensively; if the key is absent it migrates once from the
  legacy `sessions.workingSets` key and removes it. Maps: `_viewStateBySession` (opaque aux-bar state),
  `_panelVisibilityBySession`, `_workingSets`.
- **Save on exit [B4]** — `IStorageService.onWillSaveState` → `_saveState` captures the active session's
  view state (via the `_captureActiveSessionViewState` hook) and working set, skips untitled /
  multi-session cases, then writes one entry per known session resource.
- **Multi-session suppression [B5]** — a dedicated autorun clears `_viewStateBySession` and
  `_panelVisibilityBySession` for every visible session; editor working sets are left untouched.
- **Subclass hook** — `_registerViewStateManagement()` runs at the end of the base constructor for
  platform-specific auxiliary bar wiring (no-op in the base); `_captureActiveSessionViewState(resource)`
  is the save-time hook (no-op in the base) invoked by [B4]; `_onSidePaneToggled()` runs at the end of
  `toggleSidePane()` (no-op in the base) so a subclass can record the resulting side-pane state, which
  the per-session capture listener deliberately ignores while the side pane is toggled.
