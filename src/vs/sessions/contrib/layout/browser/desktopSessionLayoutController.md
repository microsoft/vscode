# Desktop Session Layout Controller — Spec

Specifies [`desktopSessionLayoutController.ts`](./desktopSessionLayoutController.ts)
(`LayoutController`), the full layout controller used on desktop and on the **web desktop** layout. It
extends [`BaseLayoutController`](./baseSessionLayoutController.md) (rules `B*`) and adds the per-session
**auxiliary bar** (side pane) behaviour.

- **Rules** describe the user-visible behaviour, grouped by scenario. Each rule has a stable reference
  tag (`[D*]`) used by the code and tests; numbering does not imply an order (except D3's restore
  priority, which is explicit).
- **Implementation notes** describe *how* the rules are realized. Read these only when changing the
  code.

Throughout, "side pane" means the auxiliary bar, which shows either the **Files** view or the
**Changes** view.

---

## Rules

### Scenario: remembering the side pane
The side pane's open/closed state and which view it showed (Files or Changes) are remembered per
session, so they can be restored later (D3).

#### D1 — When you switch away from a session
On leaving a session, its current side-pane state is captured for that session.

#### D2 — Immediately when you toggle it
Opening or closing the side pane is captured right away, not only when you switch sessions. This is
suspended while multiple sessions are visible, while the editor is maximized (D5), while the
controller hides the side pane to restore a session's remembered state (so a restore-driven hide is
never recorded as a new choice), and when the whole side pane is closed at once (D9).

### Scenario: opening the Changes editor
The session header's **Changes** button opens the multi-file diff editor in the editor area.

#### D8 — Opening the Changes editor shows the side pane
When a Changes editor is opened for an existing session, the side pane opens to the **Changes** view —
the **first** time (no remembered choice yet) and again after the whole side pane was closed (D9),
including after a reload (the pane is restored closed, but opening Changes re-reveals it). If
you explicitly closed just the side pane (while keeping the editor open), it stays closed on later
opens (and across reloads). An already-open side pane is left on whatever view you chose. Skipped while
the editor is maximized (D5), multiple sessions are visible, or single-pane detail-panel mode is enabled,
where the side pane is managed by other rules.

#### D9 — Closing the whole side pane is not an aux-bar choice
The "side pane" is the editor area together with the auxiliary bar. Closing it (e.g. from the side
panel toggle) hides both at once. For an **existing (created)** session that is **not** remembered as a
choice to hide the side pane, so reopening the Changes editor shows it again (D8) — even across a reload,
where the pane is restored closed but is marked as collapsed (not explicitly hidden) so opening Changes
re-reveals it. Only hiding the auxiliary bar on its own, while the editor stays open, is remembered as an
explicit "closed" choice.

#### D9b — Closing the whole side pane on a new session is remembered
For a **new (uncreated)** session, closing (or opening) the whole side pane **is** recorded as the
shared new-session side-pane choice (D3b). This means once you close the side pane while composing a
new session, it stays closed: it is not re-opened when that same new session re-syncs (e.g. once it
gains its workspace, un-maximizes, or collapses back from a multi-session view), nor when the next new
session is created. Suspended while multiple sessions are visible or the editor is maximized (D5).

### Scenario: returning to a session
When you focus a session, its side pane is restored from the state remembered above.

#### D3 — Restore priority
The side pane is restored in this order:

- **D3a — No session / no workspace** → nothing changes.
- **D3b — A new (uncreated) session** → all new sessions share one remembered side-pane state. If you
  explicitly closed the side pane it stays closed (across switches *and* reloads); otherwise it opens
  to the default view (D3d). This is the normal time the side pane opens on its own.
- **D3c — An existing (created) session** → the side pane is **never** opened automatically on
  restore. If it was closed or has no remembered state it stays closed; if it was open and that view
  still exists it reopens; if that view is gone it falls back to the default view (D3d).
- **D3d — Default view** → Files while the session is uncreated; Changes after the session is created.

### Scenario: special cases that override the remembered state
A few transitions intentionally ignore the remembered state above.

#### D4 — Submitting a new session
When a new session becomes created while staying active — either `isCreated` changes from false to true
on the same resource, or the provider replaces the draft with a committed resource — the side pane stays
as you left it: if it was open it stays open and switches to **Changes**; if it was closed it stays
closed, but opening it later shows **Changes**. In single-pane detail-panel mode, the submit transition
also keeps the editor content closed and activates the Changes tab that was already shown beside Files;
the open side pane shows the Changes detail.

#### D5 — Maximizing the editor
While the editor area is maximized, the side pane always shows **Changes**, regardless of the session's
saved or previous state. This forced state is not remembered (D2 is suspended), so un-maximizing
restores the session's real side-pane state **and the editor returns to its previous size** — the
forced Changes view never shrinks the editor permanently.

### Scenario: new changes arrive
A running session can produce new file changes at any time.

#### D6 — New changes never open the side pane
When a chat turn produces new file changes, the side pane is **not** opened automatically and the
active view is not switched automatically — it stays as you left it. Only a new session opens it
(D3b), and only the created transition switches it to Changes (D4).

### Scenario: the side pane has nothing to show
Some sessions gate off every auxiliary-bar view container — e.g. a workspace-less **quick chat**,
where the Changes and Files containers are hidden — so the aux bar would otherwise be an empty column.

#### D10 — An empty auxiliary bar is hidden
When the auxiliary bar has **no active view container** (nothing to show), its part is kept **hidden**
instead of showing an empty column, and the chat takes the space. This updates reactively as the active
session flips (a container being gated off hides the part; a container becoming active again lets the
normal restore rules D3/D8 reveal it) and also when the **part itself becomes visible** without any
container-/descriptor-change signal firing — a bare detail toggle that shows the column before a container
opens, or a restore that shows it while its containers are gated off — so the detail toggle can never read
"on" over a blank panel. Reconciling away an empty column runs under `suppressEditorPartAutoVisibility()`
so it never resurrects the editor as a side effect (editor visibility stays with D3/D8). The controller
only ever *hides* an empty aux bar — it never reveals one. Correspondingly, the docked host
(`setAuxiliaryBarHidden`) never force-opens a `hideIfEmpty` container with no active views when the aux bar
is shown, so a show can never present a blank docked panel; and **Toggle Side Panel** only affects the part
that has content: it reveals the editor when it has editors and the aux bar is empty, and never reveals an
empty aux bar (when neither side has content the toggle-open is a no-op). Together these guarantee the
invariant that `partVisibility.auxiliaryBar` (⇒ `AuxiliaryBarVisibleContext` ⇒ the detail toggle) is true
iff the docked detail panel is rendered with an active view container. For a **quick chat** — which has no
side pane at all (workspace-less, so the aux bar stays hidden and the chat is full-width) — the **Toggle
Side Panel** command is **disabled** outright (`precondition: IsQuickChatSessionContext.negate()`), so its
menu item, keybinding, and command-palette entry are inert.

#### D11 — Single-pane new-session views are Files-only
In single-pane detail-panel mode only, while a new (uncreated) workspace session view is active, the
editor content is hidden by default so the editor tab bar and Files detail panel remain without showing
editor content. The hide is **transition-triggered**: `_registerNewSessionRules` (a no-op base hook
overridden by `SinglePaneLayoutController`) hides the editor part when it **just became
visible**, or when the new-session view was **just entered** with the editor already visible (an
inherited-visible editor from the previous session), and only while the active editor is not real content
(the managed empty tab or none). It leaves the editor alone once a real file/browser editor is active.
Switching to a managed tab (e.g. the Files placeholder) while the editor is **already** visible does not
hide it — only a visibility transition or entering the view does. An explicit reveal sticks — opening a
file reveals the editor before the file becomes the active editor (Task 4), and toggling the detail panel
off reveals the empty editor so the side pane does not vanish (Task 2); entering the view always resets to
editor-closed, so a stale cross-session explicit reveal cannot carry over. A momentary width-based reveal
(e.g. a sash drag) is re-hidden by the same rule. The shared D3b/D9b new-session side-pane visibility state
is unchanged: once the user hides the side pane for a new session, it stays hidden for later new sessions.

### Scenario: a cramped (small) window
On a small window there isn't room for the sessions sidebar, the editor, and the side pane all at once.

#### D7 — Responsive sessions sidebar
When the window is **small** (main container 1800px wide or narrower) and **both** the editor and the side
pane (auxiliary bar) are open, the **sessions sidebar** is hidden automatically. As soon as either of
them closes (or the window grows wide again) the sidebar is shown again. If you closed the sidebar
yourself it stays closed — auto-show is suppressed until you open it again manually. This is suspended
while the editor is maximized (D5) and while **multiple sessions are visible**. Switching sessions never
auto-hides the sidebar: a session-switch that restores the new session's saved side pane re-baselines the
responsive state instead of reacting to it, so only in-session layout changes drive the auto-hide. The
whole behaviour is gated by the experimental setting `sessions.layout.autoCollapseSessionsSidebar`, which
defaults **on** in non-stable builds (Insiders / exploration) and **off** in stable.

**Single-pane override.** In single-pane detail-panel mode `_registerResponsiveSidebar` is replaced with an
explicit-details rule: the sessions sidebar is auto-hidden **only** when the user opens the details pane via
the **Toggle Details** action (`workbench.action.toggleAuxiliaryBar`), freeing horizontal space for the
editor area, and restored when the details pane is closed via the same action. It is not window-size driven,
ignores automatic details opens (submit, session restore), is suspended while multiple sessions are visible,
and hands control back once the user reopens the sessions sidebar manually.

---

## Implementation notes

- **Registration** — contributed by `sessions.layout.contribution.ts`
  (`WorkbenchPhase.AfterRestored`) for every layout except the web phone layout, i.e. when
  `!(isWeb && isMobile)`. The contribution is imported from `sessions.desktop.main.ts` (desktop)
  and `sessions.web.main.ts` (web) and also registers the experimental
  `sessions.layout.autoCollapseSessionsSidebar` setting. The web phone layout
  uses the [mobile controller](./mobileSessionLayoutController.md) instead.
- **Capture [D1]** — `_captureViewState(previousSession)` records `auxiliaryBarVisible` and
  `auxiliaryBarActiveViewContainerId`; also used by the base save-time hook (B4) via
  `_captureActiveSessionViewState`.
- **Live tracking [D2]** — `onDidChangePartVisibility` listener for `AUXILIARYBAR_PART`, skipped while
  multiple sessions are visible, the editor is maximized, `_togglingSidePane` is set (the side-pane
  toggle, D9), or `_hidingAuxiliaryBarForRestore` is set (the restore-driven hide routes through
  `_hideAuxiliaryBarForRestore`); updates `_captureViewState` (created) or `_setNewSessionViewState`
  (uncreated). When a created session is revealed from hidden saved state, the saved/default active
  container is restored before capture (`_restoreSavedAuxiliaryBarContainerOnReveal`).
- **Restore [D3]** — `_syncAuxiliaryBarVisibility(resource, hasWorkspace, isCreated)`.
  Uncreated sessions (D3b) share `_newSessionViewState`, persisted under
  `sessions.newSessionViewState`. `_openDefaultAuxiliaryBarContainer` /
  `_isAuxiliaryBarContainerPinned` implement D3c/D3d.
- **New-session submit [D4]** — `_onNewSessionSubmitted` keeps the aux bar as left, switches an open one
  to Changes, and records Changes as the active container even when hidden so opening the side pane
  later starts on Changes. `_onSessionReplaced` applies the same state transfer when a provider commits
  the draft as a new resource. In single-pane mode, the tab opens that accompany this transition are
  managed by `SinglePaneLayoutController` under editor-auto-visibility suppression, so they
  do not reveal editor content.
- **Editor maximized [D5]** — driven from the sync autorun via `editorMaximizedObs`
  (`IAgentWorkbenchLayoutService.isEditorMaximized()`); forced visibility is never captured (D2). The
  sessions workbench (`setEditorMaximized` in `browser/workbench.ts`) snapshots the editor part size +
  surrounding part visibility on maximize and restores them on un-maximize, so the editor returns to
  its previous width.
- **No auto-reveal [D6]** — the sync logic never opens the side pane or switches the active container
  in response to file changes; only D3b opens it, and D4 switches it to Changes.
- **Empty aux bar [D10]** — `_registerAuxiliaryBarPartVisibility` re-checks `_hasActiveAuxViewContainers()`
  (base; `IViewDescriptorService.getViewContainersByLocation(AuxiliaryBar)` filtered by
  `IViewsService.isViewContainerActive`) on container add/remove
  (`onDidChangeViewContainers`/`onDidChangeContainerLocation`), each aux container model's
  `onDidChangeActiveViewDescriptors` (the `when`-gating signal), aux-bar
  `onDidChangeViewContainerVisibility`, and the aux-bar part becoming visible
  (`onDidChangePartVisibility` with `partId === AUXILIARYBAR_PART && visible`).
  `_syncAuxiliaryBarPartVisibility` hides `AUXILIARYBAR_PART` (via
  `_hideAuxiliaryBarForRestore`, so [D2] doesn't record it) when there are no active containers, wrapped in
  `suppressEditorPartAutoVisibility()` so the hide never triggers the docked swap-reveal of the editor, and
  never reveals it — reveals stay with D3/D8. Symmetrically, `Workbench.setAuxiliaryBarHidden` gates its
  docked "show last/default composite" fallback on `_isAuxViewContainerActive(id)` (mirroring
  `IViewsService.isViewContainerActive`) so it never force-opens an empty `hideIfEmpty` container. The base
  `toggleSidePane` re-open branch guards the aux-bar
  un-hide with `_hasActiveAuxViewContainers()` symmetric to the editor's `hasEditors` guard, and the
  "ensure a visible effect" fallback prefers the editor and only falls back to the aux bar when it has
  active containers. The `Toggle Side Panel` command itself (`workbench.action.agentToggleSidePanel`,
  registered by the base controller) carries `precondition: IsQuickChatSessionContext.negate()`, so it is
  disabled (menu item, keybinding, palette) whenever the active session is a quick chat, which has no side
  pane to toggle.
- **First Changes open [D8]** — `_revealChangesViewOnFirstOpen`, registered on
  `IEditorService.onDidActiveEditorChange` **and** on `onDidChangePartVisibility` for `EDITOR_PART`
  becoming visible. The latter covers re-clicking the **Changes** button after the whole side pane was
  closed (D9): the Changes editor is still the active editor (only hidden), so re-opening it re-reveals
  the editor part without firing an active-editor change. The reveal is skipped while `_togglingSidePane`
  is set so re-opening the side pane via the toggle restores exactly `_lastVisibleSidePaneParts` instead.
  It recognizes a Changes editor via `ISessionChangesService.getSessionResource` (the multi-diff source
  URI's session), and opens `CHANGES_VIEW_ID` when that session is the active titled session, the editor
  part is **visible** (a Changes editor restored on reload becomes active while the editor part is still
  hidden — that must not auto-reveal the side pane), and neither maximize (D5) nor multi-session mode is
  active, unless the session's `_viewStateBySession` entry records an **explicit** aux-bar hide
  (`auxiliaryBarVisible: false` *without* `auxiliaryBarHiddenByCollapse`), or the aux bar is already
  visible. A hide that came from collapsing the whole side pane (D9) sets `auxiliaryBarHiddenByCollapse:
  true`, so opening a Changes editor re-reveals the aux bar even across a reload (the pane is still
  restored closed). The reveal flows through the [D2] listener, which records `{ auxiliaryBarVisible: true }`.
  In single-pane detail-panel mode these listeners are not registered; the DetailPanelController maps the
  active editor to a container and reveals the matching Files/Explorer or Changes detail panel when a File
  or Changes editor becomes active. That reveal is edge-triggered on editor activation, so explicitly
  hiding the detail panel is respected while the same editor remains active; Browser tabs still hide the
  panel transiently and switching back re-opens it.
- **Side-pane close [D9]** — the side-pane toggle lives on the controller (`toggleSidePane`). Its UI
  entry point (the `Toggle Side Panel` action: menu item, keybinding, command-palette entry, toggled
  icon) is registered by the base controller in its constructor and calls `toggleSidePane` directly.
  The toggle hides/shows the editor area and auxiliary bar together (remembering which parts to restore
  in `_lastVisibleSidePaneParts`) while `_togglingSidePane` is set. The [D2] listener skips capture
  while `_togglingSidePane` is set, so closing or opening the whole side pane is never recorded by it.
  Instead the `_onSidePaneToggled(collapsed, previousAuxiliaryBarVisible)` hook (D9b) records the result
  for the **active** session: a full collapse of a previously-**visible** aux bar writes that session's
  view state with `auxiliaryBarHiddenByCollapse: true`. The marker is therefore scoped to the session that
  was actually collapsed — `_captureViewState` (save-time, on switch-away and shutdown) only **preserves**
  an existing marker while the aux bar stays hidden and never fabricates one, so an explicit aux-bar hide
  on another session is never mistaken for a collapse. On reload the side pane is restored closed, yet
  opening Changes (D8) re-reveals it because the marker is present.
  In single-pane mode, hiding the docked detail panel via `workbench.action.toggleAuxiliaryBar` reveals
  editor content first when it was hidden, so the detail toggle swaps detail → editor instead of closing
  the whole side pane; `Toggle Side Panel` remains the action that can hide both parts.
- **New-session / side-pane close [D9b]** — the base `toggleSidePane` calls the
  `_onSidePaneToggled(collapsed, previousAuxiliaryBarVisible)` hook at the end (still inside the
  `_togglingSidePane` window). The desktop controller overrides it (skipped while multi-session /
  maximized): for an **uncreated** session it records the resulting aux-bar visibility via
  `_setNewSessionViewState` (so a closed side pane survives a re-sync of the same new session and the
  creation of the next one, D3b). For a **created** session it marks `auxiliaryBarHiddenByCollapse: true`
  **only** when the toggle fully collapsed a previously-visible aux bar; any other outcome (a re-open, or
  collapsing an already editor-only state) just captures the resulting state, so an explicit aux-bar hide
  — including one whose editor-only state is restored when the pane re-opens — is never turned into a
  collapse.
- **Single-pane new-session rule [D11]** — `LayoutController` exposes `_registerNewSessionRules` as a
  no-op hook. `SinglePaneLayoutController` overrides it with an `autorun` over the active
  session, multi-session state, editor maximized state, the active editor, and **the editor-part
  visibility**; on an uncreated workspace session that is not a quick chat, it hides `EDITOR_PART` (under
  `suppressEditorPartAutoVisibility()`) when the editor just became visible or the view was just entered
  with the editor visible, tracking the previous editor-visible / in-new-session-view values across runs so
  a mere active-editor change (e.g. switching to the Files placeholder) does not retrigger the hide. D3b
  continues to open the Files container unless the shared new-session side-pane state says it is hidden.
- **Responsive sidebar [D7]** — `_registerResponsiveSidebar` derives `spaceConstrained = enabled && small
  && editor visible && aux-bar visible && !multipleSessionsVisible` from the experimental setting
  `sessions.layout.autoCollapseSessionsSidebar` (`observableConfigValue`, default `product.quality !==
  'stable'`), `onDidLayoutMainContainer` (width `<= SMALL_WINDOW_MAX_WIDTH`, 1800) and
  `onDidChangePartVisibility`. An autorun acts only on real transitions of that derived (skipped while the
  editor is maximized): constrained → if `_setSidebarAutoHidden(true)` actually hid a visible sidebar it sets
  `_sidebarAutoHidden`, un-constrained → `_setSidebarAutoHidden(false)` only when `_sidebarAutoHidden` (i.e. the
  controller hid it). A separate `onDidChangePartVisibility` listener for `SIDEBAR_PART` clears
  `_sidebarAutoHidden` on any manual toggle so the user keeps control, guarded by `_applyingAutoSidebar` so the
  controller's own toggles aren't mistaken for user intent; maximize's own sidebar enter/restore toggles
  self-cancel through this listener. Because only controller-driven hides are auto-reverted, a sidebar that was
  already closed before a reload (in-memory `_sidebarAutoHidden` resets to `false`) is never auto-revealed. While restoring a
  session's layout the autorun re-baselines instead of reacting. The restore epoch lives in the base
  controller (`_withSessionLayoutRestore` / `_isRestoringSessionLayout`) and wraps **both** the desktop
  [D3] aux-bar restore (`_onNewSessionSubmitted`, `_syncAuxiliaryBarVisibility`) **and** the base [B2]
  editor working-set apply (`_applyWorkingSet`). It holds `_restoringSessionLayoutDepth > 0` until the
  work settles — synchronously for void work, and until the returned promise settles for async work — so
  the editor part reveal that `_applyWorkingSet` performs *after* an `await` (and the aux-bar reveal that
  lands in a later autorun run) is absorbed rather than triggering an auto-hide on navigation.
- **Hooks** — overrides `_registerViewStateManagement` to wire D1/D2/D3/D5/D7 and
  `_captureActiveSessionViewState` (B4) to delegate to `_captureViewState`.
