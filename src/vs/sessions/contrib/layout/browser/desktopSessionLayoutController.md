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
- **D3b — A new (untitled) session** → all new sessions share one remembered side-pane state. If you
  explicitly closed the side pane it stays closed (across switches *and* reloads); otherwise it opens
  to the default view (D3d). This is the **only** time the side pane opens on its own.
- **D3c — An existing session** → the side pane is **never** opened automatically. If it was closed or
  has no remembered state it stays closed; if it was open and that view still exists it reopens; if
  that view is gone it falls back to the default view (D3d).
- **D3d — Default view** → Changes when the session has file changes, otherwise Files.

### Scenario: special cases that override the remembered state
A few transitions intentionally ignore the remembered state above.

#### D4 — Submitting a new session
When a new session becomes a real session while staying active, the side pane stays as you left it: if
it was open it stays open and switches to **Changes** so new changes are visible as soon as they land;
if it was closed it stays closed.

#### D5 — Maximizing the editor
While the editor area is maximized, the side pane always shows **Changes**, regardless of the session's
saved or previous state. This forced state is not remembered (D2 is suspended), so un-maximizing
restores the session's real side-pane state **and the editor returns to its previous size** — the
forced Changes view never shrinks the editor permanently.

### Scenario: new changes arrive
A running session can produce new file changes at any time.

#### D6 — New changes never open the side pane
When a chat turn produces new file changes for an existing session, the side pane is **not** opened
automatically — it stays as you left it. Only a new session opens it (D3b).

---

## Implementation notes

- **Registration** — registered as the workbench layout controller (`WorkbenchPhase.AfterRestored`)
  for every layout except the web phone layout, i.e. when `!(isWeb && isMobile)`. Imported from
  `sessions.desktop.main.ts` (desktop) and `sessions.web.main.ts` (web desktop). The web phone layout
  uses the [mobile controller](./mobileSessionLayoutController.md) instead.
- **Capture [D1]** — `_captureViewState(previousSession)` records `auxiliaryBarVisible` and
  `auxiliaryBarActiveViewContainerId`; also used by the base save-time hook (B4) via
  `_captureActiveSessionViewState`.
- **Live tracking [D2]** — `onDidChangePartVisibility` listener for `AUXILIARYBAR_PART`, skipped while
  multiple sessions are visible or the editor is maximized; updates `_captureViewState` (titled) or
  `_newSessionViewState` (untitled).
- **Restore [D3]** — `_syncAuxiliaryBarVisibility(resource, hasWorkspace, isUntitled, hasChanges)`.
  Untitled sessions (D3b) share `_newSessionViewState`, persisted under `sessions.newSessionViewState`.
  `_openDefaultAuxiliaryBarContainer` / `_isAuxiliaryBarContainerPinned` implement D3c/D3d.
- **New-session submit [D4]** — `_onNewSessionSubmitted` keeps the aux bar as left, switches an open one
  to Changes, and persists the resulting state so later syncs don't revert to the default.
- **Editor maximized [D5]** — driven from the sync autorun via `editorMaximizedObs`
  (`IAgentWorkbenchLayoutService.isEditorMaximized()`); forced visibility is never captured (D2). The
  sessions workbench (`setEditorMaximized` in `browser/workbench.ts`) snapshots the editor part size +
  surrounding part visibility on maximize and restores them on un-maximize, so the editor returns to
  its previous width.
- **No auto-reveal [D6]** — the sync logic never opens the side pane in response to changes for a titled
  session; only D3b opens it.
- **Hooks** — overrides `_registerViewStateManagement` to wire D1/D2/D3/D5 and
  `_captureActiveSessionViewState` (B4) to delegate to `_captureViewState`.
