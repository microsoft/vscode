# Layout Controller — Per-Session Layout State

> **Specification change gate:** A bug fix that restores an existing rule belongs in a regression test, not this document. Update this specification only when the intended layout state machine or persistence contract changes.

This document specifies how the session layout controllers manage workbench layout as the user switches between sessions. The classic and mobile implementation is split across three files, each with its own file-level spec. Each spec states the behaviour as numbered **scenario rules** (and keeps the *how* in a separate "Implementation notes" section); the code and tests reference these rules by tag:

| File | Spec | Rules |
|------|------|-------|
| `contrib/layout/browser/baseSessionLayoutController.ts` (`BaseLayoutController`) | [baseSessionLayoutController.md](contrib/layout/browser/baseSessionLayoutController.md) | `B1`–`B5` |
| `contrib/layout/browser/desktopSessionLayoutController.ts` (`LayoutController`) | [desktopSessionLayoutController.md](contrib/layout/browser/desktopSessionLayoutController.md) | `D1`–`D11` |
| `contrib/layout/browser/mobileSessionLayoutController.ts` (`MobileLayoutController`) | [mobileSessionLayoutController.md](contrib/layout/browser/mobileSessionLayoutController.md) | `M1`–`M2` |

The abstract `BaseLayoutController` owns the platform-agnostic mechanics (panel, editor working sets, persistence, multi-session suppression). `LayoutController` (desktop / web desktop) adds auxiliary bar management; `MobileLayoutController` (web phone) omits it. `contrib/layout/browser/sessions.layout.contribution.ts` contributes the correct controller per platform (and registers the experimental responsive-sidebar setting); it is imported from `sessions.desktop.main.ts` (desktop) and `sessions.web.main.ts` (web).

`SinglePaneLayoutController` is a sibling of `LayoutController`: it extends `BaseLayoutController` and composes exactly three lifecycle strategies for New, Existing, and Quick Chat sessions. Shared tab, detail, and visibility mechanics live in coordinators rather than separate contribution controllers. Single-pane policy stays in that controller, its strategies, or its coordinators rather than being injected into editor-part construction; in particular, editor-part construction must not acquire `ISessionsService`, because the Sessions service graph already depends on editor parts.

It is the detailed companion to the [layout-controller boundary](LAYOUT.md#layout-controller-boundary).

---

## 1. Overview

The Agents window keeps a single **active session** but lets the user move between many. Each session owns its editor working set and bottom-panel visibility. The classic layout also keeps auxiliary-bar and editor-part visibility per session. The single-pane layout keeps a shared Editor/Details profile for Existing Sessions; New Sessions use a one-time Editor opening rule.

`LayoutController` owns three independent pieces of per-session state, all keyed by session resource (`URI`) and persisted to workspace storage:

| State | Storage map | Scope |
|-------|-------------|-------|
| Auxiliary bar (secondary side bar) | `_viewStateBySession` | Classic layout only: visibility + active view container |
| Panel (terminal / debug output) | `_panelVisibilityBySession` | visibility only |
| Editor working set | `_workingSets` | open editors in the grid editor part |
| Editor part visibility | `_editorPartHiddenBySession` | Classic layout only: whether the editor part was left hidden |

All state flows from the `activeSession` **observable** (never events). The controller derives `activeSessionResourceObs`, `activeSessionIsCreatedObs`, `activeSessionHasWorkspaceObs`, and `multipleSessionsVisibleObs`, then reacts with `autorun`.

---

## 2. The Switch Trigger

Each sync is an `autorun` that reads `activeSessionResourceObs`. The controller keeps a local `previousSessionResource` so it can detect a **real switch** (`previous !== active`) versus an initial load or an unrelated re-evaluation.

### Multiple visible sessions

When more than one session is visible at once (the Sessions Part grid shows several session views), **all per-session sync is suppressed**:

- The aux-bar / panel sync autoruns bail out early (`multipleSessionsVisibleObs`).
- A dedicated autorun **clears** `_viewStateBySession` and `_panelVisibilityBySession` for every visible session.

This guarantees that after collapsing back to a single session the **default visibility logic** (§3.2) runs again instead of restoring stale single-session state. Editor working sets are *not* cleared — they survive multi-session mode.

---

## 3. Auxiliary Bar

Skipped entirely on mobile web (`isWeb && isMobile`) to avoid disruptive auto-expand on narrow viewports.

> **Docked detail panel (experimental).** With `sessions.layout.singlePaneDetailPanel` enabled, the auxiliary bar is docked inside the editor part rather than being a grid column (see [Editor presentation](LAYOUT.md#editor-presentation)). `SinglePaneExistingSessionStrategy` persists one shared Existing Session Editor/Details profile (via `SinglePaneVisibilityProfileStore`) under `sessions.singlePane.sidePaneVisibility`. New Sessions do not apply or capture an Editor profile; submitting preserves Editor visibility and seeds the Existing profile. `SinglePaneQuickChatStrategy` shares the Existing profile's overall side-pane visibility when Quick Chat has a saved editor working set, mapping any visible composition to Editor-only because Quick Chat has no Details. Opening the first editor or changing visibility in an editor-bearing Quick Chat updates that shared profile, even before the chat has a saved working set. A Quick Chat without editors hides the side pane transiently without changing the profile, so navigating away restores the shared visibility. The per-session rules below apply to the classic layout only. The docked detail panel opens at a 300px preferred width unless the user explicitly resized it; cached editor node sizes and temporary sidebar-collapse growth are not allowed to widen the first/opened detail-only pane. Docked sash collapse is also expressed through the same visibility API: the left grid sash hides editor content when the editor node reaches the detail width, and the middle docked sash hides the auxiliary bar when the raw dragged detail width reaches ~0. Single-pane also keeps new-session views Files-first without owning side-pane visibility: when an uncreated workspace session is entered and its restored editor set contains only Empty Files, `SinglePaneNewSessionStrategy` hides Editor once under editor-auto-visibility suppression. Auxiliary Bar visibility is unchanged. A completed Toggle Side Panel reopen is a separate transition: after managed tabs settle, a sole Empty Files input produces dock-only Files. Closing the last non-Empty input is a third, authoritative transition that restores Empty Files and the exact pre-close visibility. New, Existing, and Quick Chat share one `SinglePaneDetailPanelCoordinator` for Changes/Files content selection and context publication. Auxiliary Bar visibility is not shared: each lifecycle strategy applies its own visibility rules before publishing its content target.

### 3.1 Switching away — capture

`_captureViewState(previousSession)` records, for the **outgoing** session:

- `auxiliaryBarVisible` — whether the aux bar is currently visible.
- `auxiliaryBarActiveViewContainerId` — the active aux-bar view container (Files vs Changes).

### 3.2 Switching to — restore

`_syncAuxiliaryBarVisibility(resource, hasWorkspace, isCreated)` applies state in strict priority order:

1. **No resource / no workspace** → do nothing.
2. **Uncreated session (new-session view)** → all uncreated sessions share a single state object (`_newSessionViewState`, persisted to workspace storage under `sessions.newSessionViewState`): if the user explicitly hid the aux bar on a new session it stays hidden (across switches *and* reloads); otherwise the default container (§3.2 step 4) is shown. This is the main place the side pane is opened automatically — a new session opens it by default so the user starts with Files visible.
3. **Created session** (existing session): the side pane is **never auto-opened** except for the same-session submit transition (§3.3).
   - saved state is **hidden** *or* there is **no saved state** → hide the aux bar and stop. A
     session with no explicit "visible" choice — including one that just converted from the
     new-session view to an existing session — stays closed until the user opens it.
   - saved state is **visible** with a still-pinned active container → reopen that container.
   - saved state is **visible** but its container is gone → fall back to the default container
     (§3.2 step 4).
4. **Default container** (`_defaultAuxiliaryBarContainerId` / `_openDefaultAuxiliaryBarContainer`), used only when the side pane is being shown (new-session default, or restoring a session the user explicitly left visible):
   - session has produced **at least one file change** in any of its chats (`sessionHasChanges`) → open
     the Changes view (`CHANGES_VIEW_ID`).
   - otherwise → open the Files container (falling back to Changes if Files is hidden). The change state is read untracked, so it is evaluated only at the moment the side pane is opened.

### 3.3 New-session submit

When the active new session becomes created (either `isCreated` changes from false to true for the same session, or the provider replaces the draft with a new committed resource), the side pane stays in whatever visibility state the user left it. If it is visible, it keeps showing the container it is already on. If it is hidden, the controller records no active container for that session, so opening the side pane later shows the default container for the session's change state at that time (§3.2 step 4). In single-pane mode, the submit transition keeps editor content closed: the managed Changes tab opens under editor-auto-visibility suppression, while the visible side pane maps to the Changes detail.

### 3.4 No auto-reveal on changes

The side pane is **not** revealed, and the active container is not changed, when a chat turn produces new file changes. The first change does make Changes the default container (§3.2 step 4), but that only takes effect the next time the side pane is opened — a visible side pane is never switched from under the user.

### 3.5 Live visibility tracking

Aux-bar visibility is also tracked **live** (not only on session switch) via an `onDidChangePartVisibility` listener for `AUXILIARYBAR_PART` (skipped on mobile web and while multiple sessions are visible). For a titled active session it re-runs `_captureViewState`; for an uncreated active session it updates the shared `_newSessionViewState` (§3.2 step 2). When a created session with hidden saved state is opened, the saved/default active container is restored before the visible state is captured, so a hidden-on-submit session opens to the default container for its change state (§3.2 step 4).

### 3.6 Editor reveal on session switch

The editor part is revealed programmatically when a session's editor working set is restored on a session **switch** (`_revealEditorPartForWorkingSet`, §5) — **unless** that session left the editor part hidden. Each session's editor part hidden state is captured **eagerly** by the `[B2]` `onDidChangePartVisibility(EDITOR_PART)` listener the moment the user changes it — writing `_editorPartHiddenBySession` while a single session is visible and outside a session-switch restore (`_isRestoringSessionLayout`). Capturing lazily at switch-away instead would race the switch derive (`activeSessionForWorkingSet` lags the raw active session), letting the incoming session's layout overwrite the outgoing session's value. A session whose editor part was hidden (e.g. by closing the Side Panel, which hides both the auxiliary bar and the editor part while keeping the editors open) keeps the editor part hidden when restored — and in single-pane it is **actively re-hidden** on switch (`_shouldHideEditorPartOnApply`) so returning from a session that had it open does not leave it visible. It is also **not** revealed on the initial restore after a reload (§5.2) — the editor part visibility the workbench restored is preserved. The editor part visibility otherwise follows direct editor open/close events and the user's chevron toggle. In single-pane mode this per-session editor visibility capture/apply is disabled; editor and detail visibility remain unchanged while only the incoming session's editor working set is restored.

### 3.7 Empty auxiliary bar (D10)

The auxiliary-bar **part** is kept hidden whenever it has **no active view container** — for example a workspace-less quick chat, where the Changes and Files containers are gated off by their `when` clauses. `_hasActiveAuxViewContainers()` (base) counts active aux-bar containers via `IViewDescriptorService.getViewContainersByLocation(AuxiliaryBar)` + `IViewsService.isViewContainerActive` (the same rule the workbench uses: `!hideIfEmpty || activeViewDescriptors.length > 0`). `_registerAuxiliaryBarPartVisibility` (desktop) re-checks it reactively — on container add/remove, location moves, each container model's `onDidChangeActiveViewDescriptors` (the gating signal), aux-bar `onDidChangeViewContainerVisibility`, and the aux-bar **part itself becoming visible** (`onDidChangePartVisibility`) — and `_syncAuxiliaryBarPartVisibility` hides the part (routing through `_hideAuxiliaryBarForRestore` so §3.5 does not record it as a choice). The part-visibility trigger closes a gap: the part can become visible without any container-/descriptor-change signal firing (a bare detail toggle that shows the column before a container opens, or a restore that shows it while its containers are gated off), which would otherwise leave the toggle/context key reading "on" over a blank panel. The empty-part hide runs under `suppressEditorPartAutoVisibility()` so reconciling away an empty column never, as a side effect, pops the editor open (editor visibility stays governed by §3.2 / D8). It **only hides**; a container becoming active again lets the normal restore rules (§3.2 / D8) reveal the part. Symmetrically, the docked host (`setAuxiliaryBarHidden`) never force-opens a `hideIfEmpty` container with no active views when the aux bar is shown, so a show can never present a blank docked panel. Together these guarantee the invariant: **in single-pane docked mode `partVisibility.auxiliaryBar` (⇒ `AuxiliaryBarVisibleContext` ⇒ the detail toggle) is true iff the docked detail panel is rendered with an active view container.** In single-pane detail-panel mode, a Browser tab can hide the part transiently, but switching back to Changes re-opens it, and activating a File or Changes editor reveals the matching detail panel once while respecting later explicit hides for the same active editor. When the main editor part has no tabs, the docked detail panel is hidden with the editor so the whole side pane closes to chat-only; opening a tab restores it through the normal editor-open and active-tab detail mapping. The detail-panel toggle reveals editor content when it hides the detail from an editor-hidden state. On a whole-side-pane reopen, the workbench restores the remembered editor/detail composition. The controller uses `onDidRevealSidePane` for editor-content checks; auxiliary-bar cleanup remains with the layout-specific strategies so transiently unhydrated workspace views are not hidden. The `Toggle Side Panel` command is additionally **disabled** for quick chats (`precondition: IsQuickChatSessionContext.negate()`), since a quick chat has no side pane to toggle.

`Workbench.toggleSidePane()` emits `onWillToggleSidePane` and a completed `onDidToggleSidePane({ before, after })`; each state contains `{ editor, auxiliaryBar }`. The method returns the actual final visibility after listeners run. The command calls this layout operation directly. `BaseLayoutController` sets `_togglingSidePane` from will; did supplies `{ before, after }`, so collapse/reopen recording happens only after the transition and still has the pre-toggle aux visibility. On a fully-closed → visible transition, the shared `onDidRevealSidePane` event fires once after both parts settle; the controller hides any revealed part that has no content. The did-toggle listener then records the filtered result and clears the flag. The workbench remembers/restores raw editor/aux visibility and owns the per-layout default through `_defaultSidePaneState`. In single-pane mode the will event fires before un-maximizing, so maximize restoration cannot be captured as an explicit detail visibility change.

---

## 4. Panel

`_syncPanelVisibility(resource)`:

- No active session → hide the panel.
- Otherwise restore `_panelVisibilityBySession.get(resource)`, defaulting to **hidden** when there is no record.

The per-session record is updated whenever the user toggles the panel: an `onDidChangePartVisibility` listener for `PANEL_PART` writes the new visibility for the active session (suppressed while multiple sessions are visible). Panel height is global workbench state, not per-session layout state. When Quick Chat hides the side pane, returning restores the panel first and then reveals the single-pane Editor. That Editor reveal must preserve the panel's current height; otherwise grid redistribution shrinks the panel to its minimum.

---

## 5. Editor Working Sets

Always active, regardless of `workbench.editor.useModal`: browser editors dock in the shared grid editor part even when editors are otherwise forced modal (`useModal: 'all'`) — they except themselves from the modal part — so their tabs still need per-session capture/restore. `_useModalConfigObs` is consulted only inside `_applyWorkingSet`, to decide whether to auto-reveal the editor part on switch (skipped in modal mode, since modal editors manage their own visibility).

### 5.1 Workspace-folder ordering

The `activeSession` observable updates **before** the workbench's workspace folders update. To avoid restoring editors into the wrong workspace, `activeSessionForWorkingSet` (`derivedObservableWithCache`) holds back the new session until the workspace folders reflect its working directory.

### 5.2 Save / apply on switch

Using `runOnChange(activeSessionForWorkingSet, ...)`:

- **Outgoing session** (skip untitled): `_saveWorkingSet` snapshots the currently open editors as a named working set (`session-working-set:<resource>`); sessions with no visible editors store nothing. The editor part hidden state is **not** captured here (it would race the switch derive) — it is captured eagerly by the `[B2]` part-visibility listener (§3.6) the moment the user changes it, only while a single session is visible (in multi-session mode the editor area is shared, so its visibility is not a per-session choice).
- **Incoming session**: `_applyWorkingSet` restores its saved working set (or `'empty'`). All applies are serialized through a `Sequencer`. When not in modal mode, the working set is non-empty, **and the session did not leave the editor part hidden**, the editor part is revealed before/after applying via `_revealEditorPartForWorkingSet`, which suppresses the editor→aux-bar invariant (§3.4) so the session's saved aux-bar visibility is honored. A session whose `_editorPartHiddenBySession` entry is `true` keeps the editor part hidden on switch — and via the `_shouldHideEditorPartOnApply` hook (single-pane) is **actively re-hidden** (`_hideEditorPartForWorkingSet`) if it was left visible by the previously-active session. When a provider replaces an active uncreated draft with a committed session resource, the draft's editor-part hidden state is copied to the committed resource before this apply runs, so single-pane detail-only submit does not fall through to the first-visit created-session Editor-only default.

On initial load (no previous session) the controller only applies a working set if one is already saved for the incoming session — it never applies `'empty'`, to avoid closing editors being restored. On this initial restore the working set is applied under `suppressEditorPartAutoVisibility()` and the editor part is **not** revealed, so whatever visibility the workbench restored (possibly hidden, because the user closed the Side Panel) is preserved across reloads.

In single-pane mode, layout-driven managed Changes/File tab opens remain excluded from automatic editor reveal. The session header **Changes** pill is an explicit user open, so its action reveals the editor part before opening the managed Changes editor; this keeps tab activation/layout restores non-revealing while the pill reliably shows the multi-diff editor. The `+` Add Tab managed-tab actions are also explicit tab-add gestures: they pass the active group's end index so a re-added managed Changes/Files tab lands after the existing tabs rather than at the automatic Changes default position. While the editor area is hidden, the managed Changes editor and Files placeholder declare `EditorInputCapabilities.CannotClose`, so standard close actions cannot remove either tab from the visible detail panel. Revealing the editor area makes both tabs closeable again. Managed-tab reconciliation uses an explicit forced close when it removes stale inputs or tidies the Files placeholder. In a Details-only composition, the tab-collapse strategy re-runs after each session working-set restore and editor-list change. Any restored non-docked editors are closed and captured for reopening when the editor area is shown, so the hidden-editor tab strip contains only the docked Changes and Files inputs. While the detail is visible, every diff editor selects the Changes container and every file editor selects the Files container, regardless of whether the file is inside the active session workspace. Rendered Markdown preview and Markdown custom editors also select Files.

### 5.3 Cleanup

`onDidChangeSessions` removes working sets, per-session view state, **and** the editor part hidden state for **archived** or **deleted** sessions. View-state and editor-part-visibility removal is done explicitly in that handler — `_deleteWorkingSet` only drops the editor working set. (It must **not** drop the view state, because it is also called from `_saveWorkingSet` on every switch-away / shutdown; coupling the two would wipe a session's saved aux-bar visibility whenever it had editors but no longer does, causing the aux bar to fall back to the default-visible logic (§3.2) on the next reload.)

---

## 6. Persistence

- Classic-layout per-session state serializes to the workspace-scoped key `sessions.layoutState` on `IStorageService.onWillSaveState` (`_saveState`), with a `StorageTarget.MACHINE` target.
- `_saveState` captures the active session's current view state, working set, and editor part hidden state (skipping untitled / multi-session cases) and writes one `ISessionLayoutEntry` per known session resource.
- The classic layout's shared new-session view state (§3.2 step 2) is persisted separately under the workspace-scoped key `sessions.newSessionViewState` as an `INewSessionViewState` object, written immediately whenever the user toggles the aux bar on the new-session view (not on shutdown).
- `_loadState` reads `sessions.newSessionViewState` and `sessions.layoutState`; if the latter is absent it performs a one-time migration from the legacy `sessions.workingSets` key and then removes it. Corrupted data is dropped defensively.
- Single-pane editor working sets use `sessions.singlePane.layoutState`; the Existing Session editor/detail profile is written immediately to `sessions.singlePane.sidePaneVisibility`.

---

## 7. Key Invariants

- **Observables, not events**, drive all session-switch logic.
- **Multiple visible sessions** disable per-session view/panel sync and clear that state (working sets preserved).
- Working-set save/apply waits for **workspace folders** to catch up with the active session.
- Classic desktop behavior is owned by rules `D1`-`D11` in [desktopSessionLayoutController.md](contrib/layout/browser/desktopSessionLayoutController.md).
- Mobile behavior is owned by rules `M1`-`M2` in [mobileSessionLayoutController.md](contrib/layout/browser/mobileSessionLayoutController.md).
- Single-pane visibility and detail selection are owned by [SINGLE_PANE_SCENARIOS.md](SINGLE_PANE_SCENARIOS.md) and the strategy tests.
