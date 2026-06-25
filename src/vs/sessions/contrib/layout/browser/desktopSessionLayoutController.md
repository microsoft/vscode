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
suspended while multiple sessions are visible or while the editor is maximized (D5).

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
When a new session becomes created (`isCreated` changes from false to true) while staying active, the
side pane stays as you left it: if it was open it stays open and switches to **Changes**; if it was
closed it stays closed, but opening it later shows **Changes**.

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
  multiple sessions are visible or the editor is maximized; updates `_captureViewState` (titled) or
  `_newSessionViewState` (uncreated). When a created session is revealed from hidden saved state, the
  saved/default active container is restored before capture.
- **Restore [D3]** — `_syncAuxiliaryBarVisibility(resource, hasWorkspace, isCreated)`.
  Uncreated sessions (D3b) share `_newSessionViewState`, persisted under
  `sessions.newSessionViewState`. `_openDefaultAuxiliaryBarContainer` /
  `_isAuxiliaryBarContainerPinned` implement D3c/D3d.
- **New-session submit [D4]** — `_onNewSessionSubmitted` keeps the aux bar as left, switches an open one
  to Changes, and records Changes as the active container even when hidden so opening the side pane
  later starts on Changes.
- **Editor maximized [D5]** — driven from the sync autorun via `editorMaximizedObs`
  (`IAgentWorkbenchLayoutService.isEditorMaximized()`); forced visibility is never captured (D2). The
  sessions workbench (`setEditorMaximized` in `browser/workbench.ts`) snapshots the editor part size +
  surrounding part visibility on maximize and restores them on un-maximize, so the editor returns to
  its previous width.
- **No auto-reveal [D6]** — the sync logic never opens the side pane or switches the active container
  in response to file changes; only D3b opens it, and D4 switches it to Changes.
- **Responsive sidebar [D7]** — `_registerResponsiveSidebar` derives `spaceConstrained = enabled && small
  && editor visible && aux-bar visible && !multipleSessionsVisible` from the experimental setting
  `sessions.layout.autoCollapseSessionsSidebar` (`observableConfigValue`, default `product.quality !==
  'stable'`), `onDidLayoutMainContainer` (width `<= SMALL_WINDOW_MAX_WIDTH`, 1800) and
  `onDidChangePartVisibility`. An autorun acts only on real transitions of that derived (skipped while the
  editor is maximized): constrained → `_setSidebarAutoHidden(true)`, un-constrained →
  `_setSidebarAutoHidden(false)` unless `_userClosedSidebar`. A separate `onDidChangePartVisibility`
  listener for `SIDEBAR_PART` records manual toggles into `_userClosedSidebar` (a manual open clears it),
  guarded by `_applyingAutoSidebar` so the controller's own toggles aren't mistaken for user intent;
  maximize's own sidebar enter/restore toggles self-cancel through this listener. While restoring a
  session's layout the autorun re-baselines instead of reacting. The restore epoch lives in the base
  controller (`_withSessionLayoutRestore` / `_isRestoringSessionLayout`) and wraps **both** the desktop
  [D3] aux-bar restore (`_onNewSessionSubmitted`, `_syncAuxiliaryBarVisibility`) **and** the base [B2]
  editor working-set apply (`_applyWorkingSet`). It holds `_restoringSessionLayoutDepth > 0` until the
  work settles — synchronously for void work, and until the returned promise settles for async work — so
  the editor part reveal that `_applyWorkingSet` performs *after* an `await` (and the aux-bar reveal that
  lands in a later autorun run) is absorbed rather than triggering an auto-hide on navigation.
- **Hooks** — overrides `_registerViewStateManagement` to wire D1/D2/D3/D5/D7 and
  `_captureActiveSessionViewState` (B4) to delegate to `_captureViewState`.
