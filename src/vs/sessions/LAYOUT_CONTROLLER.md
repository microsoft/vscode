# Layout Controller — Per-Session Layout State

> **Specification change gate:** A bug fix that restores an existing rule belongs in a regression test, not this document. Update this specification only when the intended layout state machine or persistence contract changes.

This document specifies how the session layout controllers manage workbench layout as the user switches between sessions.

| File | Responsibility | Rules |
|------|----------------|-------|
| `contrib/layout/browser/baseSessionLayoutController.ts` (`BaseLayoutController`) | Shared panel, editor working-set, persistence, and multi-session mechanics | [baseSessionLayoutController.md](contrib/layout/browser/baseSessionLayoutController.md), `B1`–`B6` |
| `contrib/layout/browser/desktopLayoutController.ts` (`DesktopLayoutController`) | Non-phone Editor/Details composition and lifecycle strategies | [DESKTOP.md](DESKTOP.md) |
| `contrib/layout/browser/mobileSessionLayoutController.ts` (`MobileLayoutController`) | Phone adaptation without auxiliary-bar automation | [mobileSessionLayoutController.md](contrib/layout/browser/mobileSessionLayoutController.md), `M1`–`M2` |

All non-phone Agents windows use `DesktopWorkbench` with `DesktopLayoutController`. Phone windows use `MobileWorkbench` with `MobileLayoutController`. `contrib/layout/browser/sessions.layout.contribution.ts` selects the controller from the concrete workbench presentation constructed at startup.

`DesktopLayoutController` extends `BaseLayoutController` and composes lifecycle strategies for Draft, Existing, and Quick Chat sessions. Shared tab, detail, and visibility mechanics live in coordinators rather than separate contribution controllers. Desktop policy stays in that controller, its strategies, or its coordinators rather than being injected into editor-part construction; in particular, editor-part construction must not acquire `ISessionsService`, because the Sessions service graph already depends on editor parts.

It is the detailed companion to the [layout-controller boundary](LAYOUT.md#layout-controller-boundary).

---

## 1. State ownership

The Agents window keeps a single active session but lets the user move between many. Each session owns its editor working set. The desktop layout governs side-pane and bottom-panel visibility at the workbench level while remembering the relevant content per session.

| State | Storage | Scope |
|-------|---------|-------|
| Editor working set | `sessions.singlePane.layoutState` | Per session |
| Panel view | `sessions.singlePane.layoutState` | Per session |
| Existing Session Editor/Details profile | `sessions.singlePane.sidePaneVisibility` | Shared across Existing Sessions |
| Side-pane and panel visibility | Workbench part visibility | Window |

Draft Sessions do not persist a separate visibility profile. Quick Chats reuse the Existing Session profile when they have editor content and otherwise preserve the workbench-restored composition.

All state flows from the `activeSession` observable. The controller derives session and visibility state and reacts with observables; events remain notifications for part and editor changes rather than a second state model.

## 2. Session switches

Editor working-set application waits until the active workspace folders match the incoming session. Saves and restores are serialized so a later switch cannot be overwritten by an earlier asynchronous apply.

When more than one session is visible, per-session layout synchronization is suppressed because the shared workbench parts do not belong to one active session. Editor working sets remain persisted.

On initial restoration, a saved working set is applied under editor-auto-visibility suppression. The restored workbench part visibility remains authoritative, so loading editors does not reveal a side pane the user had closed.

## 3. Desktop side pane

The side pane combines Editor content and the docked Auxiliary Bar detail. Its valid visibility states and transitions are specified in [DESKTOP.md](DESKTOP.md).

`DesktopExistingSessionStrategy` owns the shared Existing Session visibility profile. `DesktopDraftSessionStrategy` owns workspace-backed and workspace-less draft behavior. Quick Chat behavior is selected by the desktop controller and maps editor-bearing chats onto the shared Existing Session profile.

`DesktopDockedTabsCoordinator` owns the managed Changes and Files tabs. `DesktopDetailPanelCoordinator` maps the active editor to Changes or Files detail content and publishes the related context keys. The strategies decide visibility before publishing a content target.

The Auxiliary Bar is visible only when it has an active view container. Browser and unsupported editor tabs may hide Details transiently; activating a supported Changes or file editor reveals the matching detail once while preserving later explicit user hides.

Closing the whole side pane keeps ordinary editors available for restoration. Entering Details-only closes non-docked tabs and captures restorable editors for reopening when Editor content is shown again.

## 4. Panel

The desktop layout stores bottom-panel visibility with workbench part visibility. It remembers only the active panel view per session in `sessions.singlePane.layoutState`.

The active panel view is captured from `IPaneCompositePartService.onDidPaneCompositeOpen`. A session switch restores that view only while the panel is already visible, so restoring content never forces the panel open. Sessions without a remembered view fall back to the Terminal.

The mobile controller retains the base per-session panel-visibility behavior described by `B1`.

## 5. Editor working sets

Editor working sets are always active, including when `workbench.editor.useModal` is configured, because browser editors still use the shared grid editor part.

On switch:

- the outgoing created session snapshots its open editors;
- the incoming session restores its saved working set, or an empty set after the initial load;
- managed Changes and Files tabs are reconciled by the desktop coordinators;
- programmatic restoration does not implicitly change side-pane visibility.

The session-header Changes action and Add Tab actions are explicit opens, so they may reveal Editor content. Layout-driven managed-tab operations run under editor-auto-visibility suppression.

Closing or archiving a session removes its working set and panel-view state. Replacing an active draft with its committed session resource transfers applicable state before the first restore.

## 6. Persistence

`BaseLayoutController` persists session entries with `StorageTarget.MACHINE` in workspace storage. Desktop state uses `sessions.singlePane.layoutState`; its Existing Session visibility profile uses `sessions.singlePane.sidePaneVisibility`. These legacy storage-key values remain unchanged for compatibility and do not represent a separate layout.

Corrupt persisted data is ignored. The legacy `sessions.workingSets` key is migrated once when no current layout state exists and then removed.

Workbench-owned side-pane geometry and part visibility are restored before the layout controller starts. Layout restoration must not recalculate or overwrite that geometry.

## 7. Key invariants

- Observables drive session-switch state.
- Only one controller manages the active presentation.
- Editor inputs open through `IEditorService`.
- Programmatic working-set operations suppress automatic editor visibility.
- Side-pane visibility is workbench-level in desktop mode.
- Panel content restoration never changes panel visibility.
- Multi-session presentation does not overwrite per-session state.
- Phone presentation never automates the Auxiliary Bar.

## Test ownership

- Shared rules: `contrib/layout/test/browser/baseSessionLayoutController.test.ts`
- Desktop controller transitions: `contrib/layout/test/browser/desktopLayoutController.test.ts`
- Desktop lifecycle strategies: `contrib/layout/test/browser/desktopStrategies.test.ts`
- Mobile rules: `contrib/layout/test/browser/mobileSessionLayoutController.test.ts`
