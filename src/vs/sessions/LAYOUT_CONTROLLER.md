# Layout Controller — Per-Session Layout State

This document specifies how the session layout controllers manage workbench layout as the user
switches between sessions. The implementation is split across three files, each with its own
file-level spec. Each spec states the behaviour as numbered **scenario rules** (and keeps the *how* in
a separate "Implementation notes" section); the code and tests reference these rules by tag:

| File | Spec | Rules |
|------|------|-------|
| `contrib/layout/browser/baseSessionLayoutController.ts` (`BaseLayoutController`) | [baseSessionLayoutController.md](contrib/layout/browser/baseSessionLayoutController.md) | `B1`–`B5` |
| `contrib/layout/browser/desktopSessionLayoutController.ts` (`LayoutController`) | [desktopSessionLayoutController.md](contrib/layout/browser/desktopSessionLayoutController.md) | `D1`–`D11` |
| `contrib/layout/browser/mobileSessionLayoutController.ts` (`MobileLayoutController`) | [mobileSessionLayoutController.md](contrib/layout/browser/mobileSessionLayoutController.md) | `M1`–`M2` |

The abstract `BaseLayoutController` owns the platform-agnostic mechanics (panel, editor working sets,
persistence, multi-session suppression). `LayoutController` (desktop / web desktop) adds auxiliary bar
management; `MobileLayoutController` (web phone) omits it. `contrib/layout/browser/sessions.layout.contribution.ts`
contributes the correct controller per platform (and registers the experimental responsive-sidebar
setting); it is imported from `sessions.desktop.main.ts` (desktop) and `sessions.web.main.ts` (web).

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
| Editor part visibility | `_editorPartHiddenBySession` | whether the editor part was left hidden |

All state flows from the `activeSession` **observable** (never events). The controller derives
`activeSessionResourceObs`, `activeSessionIsCreatedObs`, `activeSessionHasWorkspaceObs`, and
`multipleSessionsVisibleObs`, then reacts with `autorun`.

---

## 2. The Switch Trigger

Each sync is an `autorun` that reads `activeSessionResourceObs`. The controller keeps a local
`previousSessionResource` so it can detect a **real switch** (`previous !== active`) versus an
initial load or an unrelated re-evaluation.

### Multiple visible sessions

When more than one session is visible at once (the Sessions Part grid shows several session views),
**all per-session sync is suppressed**:

- The aux-bar / panel sync autoruns bail out early (`multipleSessionsVisibleObs`).
- A dedicated autorun **clears** `_viewStateBySession` and `_panelVisibilityBySession` for every
  visible session.

This guarantees that after collapsing back to a single session the **default visibility logic**
(§3.2) runs again instead of restoring stale single-session state. Editor working sets are *not*
cleared — they survive multi-session mode.

---

## 3. Auxiliary Bar

Skipped entirely on mobile web (`isWeb && isMobile`) to avoid disruptive auto-expand on narrow viewports.

> **Docked detail panel (experimental).** With `sessions.layout.singlePaneDetailPanel` enabled, the auxiliary
> bar is docked inside the editor part rather than being a grid column (see [LAYOUT.md](../LAYOUT.md) §5), and
> `DetailPanelController` drives which container it shows from the active editor tab. The controller here is
> unchanged and still toggles visibility via `IWorkbenchLayoutService.setPartHidden(AUXILIARYBAR_PART)`; the
> workbench fires `onDidChangePartVisibility` for the docked part so these capture/restore rules apply in both
> modes. When the setting is off, everything below applies unchanged.
> The docked detail panel opens at a 300px preferred width unless the user explicitly resized it; cached editor
> node sizes and temporary sidebar-collapse growth are not allowed to widen the first/opened detail-only pane.
> Docked sash collapse is also expressed through the same visibility API: the left grid sash hides editor content
> when the editor node reaches the detail width, and the middle docked sash hides the auxiliary bar when the raw
> dragged detail width reaches ~0.
> Single-pane also keeps new-session views Files-first: when an uncreated workspace session is entered,
> `SinglePaneLayoutController` hides the editor content once under editor-auto-visibility
> suppression so the editor tab bar and Files detail panel remain visible. Later user reveals are respected.
> The shared new-session hide memory (`sessions.newSessionViewState`) remains unchanged.

### 3.1 Switching away — capture

`_captureViewState(previousSession)` records, for the **outgoing** session:

- `auxiliaryBarVisible` — whether the aux bar is currently visible.
- `auxiliaryBarActiveViewContainerId` — the active aux-bar view container (Files vs Changes).

### 3.2 Switching to — restore

`_syncAuxiliaryBarVisibility(resource, hasWorkspace, isCreated)` applies state in
strict priority order:

1. **No resource / no workspace** → do nothing.
2. **Uncreated session (new-session view)** → all uncreated sessions share a single state object
   (`_newSessionViewState`, persisted to workspace storage under `sessions.newSessionViewState`): if
   the user explicitly hid the aux bar on a new session it stays hidden (across switches *and*
   reloads); otherwise the default container (§3.2 step 4) is shown. This is the main place the
   side pane is opened automatically — a new session opens it by default so the user starts with
   Files visible.
3. **Created session** (existing session): the side pane is **never auto-opened** except for the
   same-session submit transition (§3.3).
   - saved state is **hidden** *or* there is **no saved state** → hide the aux bar and stop. A
     session with no explicit "visible" choice — including one that just converted from the
     new-session view to an existing session — stays closed until the user opens it.
   - saved state is **visible** with a still-pinned active container → reopen that container.
   - saved state is **visible** but its container is gone → fall back to the default container
     (§3.2 step 4).
4. **Default container** (`_openDefaultAuxiliaryBarContainer`), used only when the side pane is being
   shown (new-session default, or restoring a session the user explicitly left visible):
   - session **is created** → open the Changes view (`CHANGES_VIEW_ID`).
   - otherwise → open the Files container (falling back to Changes if Files is hidden).

### 3.3 New-session submit

When the active new session becomes created (either `isCreated` changes from false to true for the
same session, or the provider replaces the draft with a new committed resource), the side pane stays
in whatever visibility state the user left it. If it is visible, the controller switches it to Changes
immediately. If it is hidden, the controller records Changes as that session's default active container
so opening the side pane later shows Changes. In single-pane mode, the submit transition keeps editor
content closed: the managed Changes tab opens under editor-auto-visibility suppression, while the
visible side pane maps to the Changes detail.

### 3.4 No auto-reveal on changes

The side pane is **not** revealed, and the active container is not changed, when a chat turn produces
new file changes. The controller does not track pending turns or file-change counts for default
selection; the automatic switch to Changes is driven by the created transition (§3.3). Once a session
is created the side pane stays in whatever state the user left it.

### 3.5 Live visibility tracking

Aux-bar visibility is also tracked **live** (not only on session switch) via an
`onDidChangePartVisibility` listener for `AUXILIARYBAR_PART` (skipped on mobile web and while
multiple sessions are visible). For a titled active session it re-runs `_captureViewState`; for an
uncreated active session it updates the shared `_newSessionViewState` (§3.2 step 2). When a created
session with hidden saved state is opened, the saved/default active container is restored before the
visible state is captured, so a hidden-on-submit session opens to Changes.

### 3.6 Editor reveal on session switch

The editor part is revealed programmatically when a session's editor working set is restored on a
session **switch** (`_revealEditorPartForWorkingSet`, §5) — **unless** that session left the editor part
hidden. Each session's editor part hidden state is captured **eagerly** by the `[B2]`
`onDidChangePartVisibility(EDITOR_PART)` listener the moment the user changes it — writing
`_editorPartHiddenBySession` while a single session is visible and outside a session-switch restore
(`_isRestoringSessionLayout`). Capturing lazily at switch-away instead would race the switch derive
(`activeSessionForWorkingSet` lags the raw active session), letting the incoming session's layout
overwrite the outgoing session's value. A session whose editor part was hidden (e.g. by closing the Side
Panel, which hides both the auxiliary bar and the editor part while keeping the editors open) keeps the
editor part hidden when restored — and in single-pane it is **actively re-hidden** on switch
(`_shouldHideEditorPartOnApply`) so returning from a session that had it open does not leave it visible.
It is also **not** revealed on the initial restore after a reload (§5.2) —
the editor part visibility the workbench restored is preserved. The editor part visibility otherwise
follows direct editor open/close events and the user's chevron toggle. Each session's saved aux-bar
visibility wins on switch — a side bar the user hid for a session stays hidden when they return to it.

### 3.7 Empty auxiliary bar (D10)

The auxiliary-bar **part** is kept hidden whenever it has **no active view container** — for example a
workspace-less quick chat, where the Changes and Files containers are gated off by their `when` clauses.
`_hasActiveAuxViewContainers()` (base) counts active aux-bar containers via
`IViewDescriptorService.getViewContainersByLocation(AuxiliaryBar)` + `IViewsService.isViewContainerActive`
(the same rule the workbench uses: `!hideIfEmpty || activeViewDescriptors.length > 0`).
`_registerAuxiliaryBarPartVisibility` (desktop) re-checks it reactively — on container add/remove, location
moves, each container model's `onDidChangeActiveViewDescriptors` (the gating signal), aux-bar
`onDidChangeViewContainerVisibility`, and the aux-bar **part itself becoming visible**
(`onDidChangePartVisibility`) — and `_syncAuxiliaryBarPartVisibility` hides the part (routing
through `_hideAuxiliaryBarForRestore` so §3.5 does not record it as a choice). The part-visibility trigger
closes a gap: the part can become visible without any container-/descriptor-change signal firing (a bare
detail toggle that shows the column before a container opens, or a restore that shows it while its
containers are gated off), which would otherwise leave the toggle/context key reading "on" over a blank
panel. The empty-part hide runs under `suppressEditorPartAutoVisibility()` so reconciling away an empty
column never, as a side effect, pops the editor open (editor visibility stays governed by §3.2 / D8). It
**only hides**; a container becoming active again lets the normal restore rules (§3.2 / D8) reveal the
part. Symmetrically, the docked host (`setAuxiliaryBarHidden`) never force-opens a `hideIfEmpty` container
with no active views when the aux bar is shown, so a show can never present a blank docked panel. Together
these guarantee the invariant: **in single-pane docked mode `partVisibility.auxiliaryBar` (⇒
`AuxiliaryBarVisibleContext` ⇒ the detail toggle) is true iff the docked detail panel is rendered with an
active view container.** In single-pane
detail-panel mode, a Browser tab can hide the part transiently, but switching back to Changes re-opens it,
and activating a File or Changes editor reveals the matching detail panel once while respecting later
explicit hides for the same active editor. When the main editor part has no tabs, the docked detail panel is
hidden with the editor so the whole side pane closes to chat-only; opening a tab restores it through the
normal editor-open and active-tab detail mapping. The detail-panel toggle reveals editor content when it hides the
detail from an editor-hidden state; the `toggleSidePane` re-open path
(§ base) guards the aux-bar un-hide with
`_hasActiveAuxViewContainers()` symmetric to `hasEditors`, and its "ensure a visible effect" fallback
prefers the editor and never reveals an empty aux bar. The `Toggle Side Panel` command is additionally
**disabled** for quick chats (`precondition: IsQuickChatSessionContext.negate()`), since a quick chat has
no side pane to toggle.

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

Always active, regardless of `workbench.editor.useModal`: browser editors dock in the shared grid
editor part even when editors are otherwise forced modal (`useModal: 'all'`) — they except themselves
from the modal part — so their tabs still need per-session capture/restore. `_useModalConfigObs` is
consulted only inside `_applyWorkingSet`, to decide whether to auto-reveal the editor part on switch
(skipped in modal mode, since modal editors manage their own visibility).

### 5.1 Workspace-folder ordering

The `activeSession` observable updates **before** the workbench's workspace folders update. To
avoid restoring editors into the wrong workspace, `activeSessionForWorkingSet`
(`derivedObservableWithCache`) holds back the new session until the workspace folders reflect its
working directory.

### 5.2 Save / apply on switch

Using `runOnChange(activeSessionForWorkingSet, ...)`:

- **Outgoing session** (skip untitled): `_saveWorkingSet` snapshots the currently open editors as a
  named working set (`session-working-set:<resource>`); sessions with no visible editors store nothing.
  The editor part hidden state is **not** captured here (it would race the switch derive) — it is
  captured eagerly by the `[B2]` part-visibility listener (§3.6) the moment the user changes it, only
  while a single session is visible (in multi-session mode the editor area is shared, so its visibility
  is not a per-session choice).
- **Incoming session**: `_applyWorkingSet` restores its saved working set (or `'empty'`). All
  applies are serialized through a `Sequencer`. When not in modal mode, the working set is
  non-empty, **and the session did not leave the editor part hidden**, the editor part is revealed
  before/after applying via `_revealEditorPartForWorkingSet`, which suppresses the editor→aux-bar
  invariant (§3.4) so the session's saved aux-bar visibility is honored. A session whose
  `_editorPartHiddenBySession` entry is `true` keeps the editor part hidden on switch — and via the
  `_shouldHideEditorPartOnApply` hook (single-pane) is **actively re-hidden** (`_hideEditorPartForWorkingSet`)
  if it was left visible by the previously-active session. When a provider replaces an active
  uncreated draft with a committed session resource, the draft's editor-part hidden state is copied
  to the committed resource before this apply runs, so single-pane detail-only submit does not fall
  through to the first-visit created-session Editor-only default.

On initial load (no previous session) the controller only applies a working set if one is already
saved for the incoming session — it never applies `'empty'`, to avoid closing editors being restored.
On this initial restore the working set is applied under `suppressEditorPartAutoVisibility()` and the
editor part is **not** revealed, so whatever visibility the workbench restored (possibly hidden,
because the user closed the Side Panel) is preserved across reloads.

In single-pane mode, layout-driven managed Changes/File tab opens remain excluded from automatic
editor reveal. The session header **Changes** pill is an explicit user open, so its action reveals the
editor part before opening the managed Changes editor; this keeps tab activation/layout restores
non-revealing while the pill reliably shows the multi-diff editor. The `+` Add Tab managed-tab actions
are also explicit tab-add gestures: they pass the active group's end index so a re-added managed
Changes/Files tab lands after the existing tabs rather than at the automatic Changes default position.

### 5.3 Cleanup

`onDidChangeSessions` removes working sets, per-session view state, **and** the editor part hidden
state for **archived** or **deleted** sessions. View-state and editor-part-visibility removal is done
explicitly in that handler — `_deleteWorkingSet` only drops the editor working set. (It must **not**
drop the view state, because it is also called from `_saveWorkingSet` on every switch-away / shutdown;
coupling the two would wipe a session's saved aux-bar visibility whenever it had editors but no longer
does, causing the aux bar to fall back to the default-visible logic (§3.2) on the next reload.)

---

## 6. Persistence

- All per-session state serializes to the workspace-scoped key `sessions.layoutState` on
  `IStorageService.onWillSaveState` (`_saveState`), with a `StorageTarget.MACHINE` target.
- `_saveState` captures the active session's current view state, working set, and editor part hidden
  state (skipping untitled / multi-session cases) and writes one `ISessionLayoutEntry` per known
  session resource.
- The shared new-session view state (§3.2 step 2) is persisted separately under the workspace-scoped
  key `sessions.newSessionViewState` as an `INewSessionViewState` object, written immediately whenever
  the user toggles the aux bar on the new-session view (not on shutdown).
- `_loadState` reads `sessions.newSessionViewState` and `sessions.layoutState`; if the latter is
  absent it performs a one-time migration from the legacy `sessions.workingSets` key and then removes
  it. Corrupted data is dropped defensively.

---

## 7. Key Invariants

- **Observables, not events**, drive all session-switch logic.
- **Multiple visible sessions** disable per-session view/panel sync and clear that state (working
  sets preserved).
- **The side pane is never auto-opened for existing sessions on restore** — it opens automatically as
  the new-session default (§3.2 step 2) and stays visible when an already-visible new session is
  submitted (§3.3). A created session with no explicit "visible" choice stays closed until the user
  opens it.
- **The sessions sidebar is auto-managed on a small window (desktop, [D7])** — when the main container is
  1800px wide or narrower and both the editor and auxiliary bar are open, the sidebar is hidden; it is shown
  again once either closes or the window widens, unless the user closed it themselves. Suspended while
  multiple sessions are visible, and switching sessions never auto-hides the sidebar: the base-controller
  restore epoch (`_withSessionLayoutRestore` / `_isRestoringSessionLayout`) wraps both the aux-bar restore
  and the editor working-set apply (`_applyWorkingSet`), so the side-pane / editor reveals a switch causes
  re-baseline the state instead of triggering an auto-hide. Gated by the
  experimental setting `sessions.layout.autoCollapseSessionsSidebar` (default on in non-stable builds). See
  [desktopSessionLayoutController.md](contrib/layout/browser/desktopSessionLayoutController.md) D7.
- Working-set save/apply waits for **workspace folders** to catch up with the active session.
- **An empty auxiliary bar is hidden (desktop, [D10])** — when the aux bar has no active view container
  (e.g. a workspace-less quick chat where Changes/Files are gated off), the `AUXILIARYBAR_PART` is kept
  hidden instead of showing an empty column, updating reactively as the active session flips — including
  when the part itself becomes visible (a bare toggle / restore that shows the column before a container
  opens), so the detail toggle never reads "on" over a blank panel. The empty-part hide runs under
  `suppressEditorPartAutoVisibility()` so it never resurrects the editor as a side effect, and the docked
  host never force-opens a `hideIfEmpty` container with no active views. The controller only hides an empty
  aux bar (reveals stay with D3/D8), and **Toggle Side Panel** only reveals the part that has content —
  never an empty aux bar, and is **disabled entirely for quick chats**
  (`IsQuickChatSessionContext.negate()`). Invariant: `partVisibility.auxiliaryBar`
  (⇒ `AuxiliaryBarVisibleContext` ⇒ the detail toggle) is true iff the docked detail panel is rendered with
  an active view container.
- **Single-pane new-session views are Files-first (desktop, [D11])** — when an uncreated workspace
  session is entered in single-pane mode (single session visible, not maximized, not a quick chat), the
  editor content is hidden once under `suppressEditorPartAutoVisibility()`. D3b keeps the Files detail
  panel active unless the shared new-session side pane state says it is hidden; later user editor reveals
  are respected until the controller exits and re-enters a new-session resource.
