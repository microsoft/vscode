# Layout Controller — Session and Chat Layout State

> **Specification change gate:** A bug fix that restores an existing rule belongs in a regression test, not this document. Update this specification only when the intended layout state machine or persistence contract changes.

This document specifies how the session layout controllers manage workbench layout as the user switches between sessions and focused chats.

| File | Responsibility | Rules |
|------|----------------|-------|
| `contrib/layout/browser/baseSessionLayoutController.ts` (`BaseLayoutController`) | Shared panel, editor working-set, persistence, and multi-session mechanics | [baseSessionLayoutController.md](contrib/layout/browser/baseSessionLayoutController.md), `B1`–`B6` |
| `contrib/layout/browser/desktopLayoutController.ts` (`DesktopLayoutController`) | Non-phone Editor/Details composition and lifecycle strategies | [DESKTOP.md](DESKTOP.md) |
| `contrib/layout/browser/mobileSessionLayoutController.ts` (`MobileLayoutController`) | Phone adaptation without auxiliary-bar automation | [mobileSessionLayoutController.md](contrib/layout/browser/mobileSessionLayoutController.md), `M1`–`M2` |

The file-level `B*` companion rules describe the legacy/default base behavior. Experimental desktop ownership extends that behavior as specified here: focused-chat scope replaces multi-session suppression, and panel visibility and panel-view memory are independent rather than mutually exclusive.

All non-phone Agents windows use `DesktopWorkbench` with `DesktopLayoutController`. Phone windows use `MobileWorkbench` with `MobileLayoutController`. `contrib/layout/browser/sessions.layout.contribution.ts` selects the controller from the concrete workbench presentation constructed at startup.

`sessions.experimental.layoutScope` is an experimental window setting with modes `session-shared` (default), `chat-shared`, and `chat`. Its effective mode is fixed at startup; changing it requires manual Reload Window without a reload notification. Boolean values are not supported. Only a window constructed with the desktop presentation can enable chat-owned layout. A startup desktop window suspends experimental layout while its runtime viewport is phone, retaining saved layout state. Returning to desktop resumes the focused owner's state. A startup phone window and disabled mode retain their existing behavior; viewport changes do not enable the experiment in a startup phone window. Terminal behavior is independent of this setting and remains unchanged in every mode.

`DesktopLayoutController` extends `BaseLayoutController` and composes lifecycle strategies for Draft, Existing, and Quick Chat sessions. Shared tab, detail, and visibility mechanics live in coordinators rather than separate contribution controllers. Desktop policy stays in that controller, its strategies, or its coordinators rather than being injected into editor-part construction; in particular, editor-part construction must not acquire `ISessionsService`, because the Sessions service graph already depends on editor parts.

It is the detailed companion to the [layout-controller boundary](LAYOUT.md#layout-controller-boundary).

---

## 1. State ownership

The Agents window keeps a single active session and an active chat within that session, even when several sessions or chat groups are visible. These observable identities remain authoritative; the layout controller does not introduce a second selection model.

With the experiment disabled, each session owns its editor working set and panel-view memory. Desktop visibility retains the shared Existing Session profile and workbench-level bottom-panel visibility:

| State | Storage | Scope |
|-------|---------|-------|
| Editor working set | `sessions.singlePane.layoutState` | Per session |
| Panel view | `sessions.singlePane.layoutState` | Per session |
| Existing Session Editor/Details profile | `sessions.singlePane.sidePaneVisibility` | Shared across Existing Sessions |
| Side-pane and panel visibility | Workbench part visibility | Window |

Draft Sessions do not persist a separate legacy visibility profile. Quick Chats reuse the Existing Session profile when they have editor content and hide the side pane when their editor working set is empty.

In both enabled desktop modes, the focused `(sessionResource, chatResource)` owns the singleton Editor's ordinary working set and active editor and selected bottom-panel view. Focus changes within one session and between sessions use the same layout owner boundary, including with multiple visible sessions or chat groups. Resource identities are provider-neutral and opaque. The main chat uses its session resource as its layout key; peers use a composite session/chat key.

In `chat`, current and last-open Editor/Details composition and bottom-panel visibility also belong to that owner. In `chat-shared`, one preference across all existing workspace chats in the window owns those visibility fields. It is not partitioned by workspace or session. Draft and Quick Chat visibility remains separate from that shared Existing preference; submission and workspace conversion apply the Existing preference rather than overwriting it.

Saved state for the selected mode takes precedence. A main chat without saved state inherits the legacy session working set and panel view, and the applicable initial visibility/profile. An unvisited peer starts without copied ordinary editors. In `chat`, every unsaved owner uses the same applicable Existing Session visibility defaults as `session-shared`, not a forced-hidden side pane; initial bottom visibility comes from the workbench and is then remembered independently per owner. In `chat-shared`, an unvisited owner uses the shared Existing visibility, even with no ordinary editors. Both chat modes reuse the session lifecycle, toggle, editor and detail transition policies with a chat ownership key. Managed Changes/Files content keeps its existing lifecycle without implicitly revealing panes. Transient Quick Chat side-pane behavior is unchanged: it does not acquire a durable owner-composition profile.

Widths, heights, Sidebar visibility, and Sessions/chat-grid geometry remain shared window state. Terminal ownership is separate from editor/layout records.

### Terminal behavior boundary

`SessionsTerminalContribution` owns terminal projection and lifecycle, not the layout controller. All layout modes retain the existing session tracking, provider/backend selection, and initial-cwd matching fallback. Switching sibling chats with the same working directory does not introduce a new terminal ownership boundary. An active chat's workspace can still change the terminal working directory under the existing session behavior.

The layout setting does not change terminal creation, task reuse, activation, cleanup, focus, or backend persistence. Workbench and Agent Host task runners retain their existing matching rules. No chat-layout ownership metadata is passed to terminal processes, profiles, tasks, or persistence records.

Chat-layout deletion and promotion affect layout records only. Terminal cleanup continues to follow the existing session archive/removal and replacement rules, including their protection, confirmation, veto, and error handling.

All state flows from the `activeSession` and `activeChat` observables. Events notify part, editor, and confirmed lifecycle changes rather than supplying a parallel state model.

## 2. Session switches

Editor working-set application waits until the active workspace folders match the incoming chat. Capture and asynchronous work use an immutable owner identity, not a later read of whichever chat is focused. Working-set application is serialized; owner and presentation generations guard publication after asynchronous work so superseded restores cannot publish visibility or detail/tab intent for a newer owner.

In legacy mode, multiple visible sessions suppress per-session panel synchronization; desktop visibility is reveal-only as described in [DESKTOP.md](DESKTOP.md#multiple-visible-sessions). Both enabled modes restore focused-chat content regardless of visible-session or chat-group count. Visibility follows the focused owner's saved state in `chat` and the shared Existing preference in `chat-shared`.

Working-set restoration and managed-tab reconciliation run under editor-auto-visibility suppression and preserve keyboard focus. Settled restoration, rather than transient editor changes during application, drives managed-tab reconciliation. Legacy initial restoration preserves the workbench-restored part visibility; enabled-mode restoration applies the selected visibility policy without changing shared geometry.

## 3. Desktop side pane

The side pane combines Editor content and the docked Auxiliary Bar detail. Its valid visibility states and transitions are specified in [DESKTOP.md](DESKTOP.md).

`DesktopExistingSessionStrategy` owns the legacy Existing Session visibility profile and experimental created-chat composition. `DesktopDraftSessionStrategy` owns workspace-backed and workspace-less draft behavior and experimental draft composition. Quick Chat behavior is selected by the desktop controller and continues to map editor-bearing Quick Chats onto the shared Existing Session profile.

`DesktopDockedTabsCoordinator` owns the managed Changes and Files tabs. `DesktopDetailPanelCoordinator` maps the active editor to Changes or Files detail content and publishes the related context keys. The strategies decide visibility before publishing a content target.

The Auxiliary Bar is visible only when it has an active view container. Browser and unsupported editor tabs may hide Details transiently; activating a supported Changes or file editor reveals the matching detail once while preserving later explicit user hides.

Closing the whole side pane keeps ordinary editors available for restoration. Entering Details-only closes non-docked tabs and captures restorable editors for reopening when Editor content is shown again.

In both enabled modes, current composition and last-open composition are distinct records: closing the whole pane remembers which Editor/Details combination to reopen. These records are per-owner in `chat` and shared across existing workspace chats in `chat-shared`. Collapsed-editor state, Files dismissal, and pending detail/tab intents remain owner-scoped and cannot leak to peers. Details-only transitions preserve existing restorable-editor and close-veto behavior. Custom-view coverage, maximization/restoration, and unsupported-editor transient detail hides are not user preferences and must not overwrite remembered composition.

## 4. Panel

Legacy desktop layout stores bottom-panel visibility with workbench part visibility and remembers only the active panel view per session in `sessions.singlePane.layoutState`. Both enabled modes independently remember visibility and selected view. The view remains per-chat. Visibility is per-chat in `chat`, and shared across existing workspace chats in `chat-shared`; draft and Quick Chat visibility does not overwrite that shared preference.

The active panel view is captured from `IPaneCompositePartService.onDidPaneCompositeOpen`. Restoration opens the remembered view only when the panel is intended visible; a hidden panel retains view memory without opening content. Owners without a remembered view fall back to the Terminal. With no active chat, no owner entry is fabricated or captured and the bottom panel is hidden; existing empty/draft side-pane lifecycle remains authoritative.

The mobile controller retains the base per-session panel-visibility behavior described by `B1`.

## 5. Editor working sets

Editor working sets are always active, including when `workbench.editor.useModal` is configured, because browser editors still use the shared grid editor part.

On switch:

- the outgoing created owner snapshots its ordinary open editors and active editor;
- the incoming owner restores its saved working set, or an empty set after the initial load;
- managed Changes and Files tabs are reconciled by the desktop coordinators;
- programmatic restoration does not implicitly change side-pane visibility.

The session-header Changes action and Add Tab actions are explicit opens, so they may reveal Editor content. Layout-driven managed-tab operations run under editor-auto-visibility suppression.

Closing or hiding a chat tab is a presentation operation and retains its working set, composition, and panel state. Missing or loading chat catalogs are not deletion evidence; delayed peers must still restore saved state.

`ISessionsManagementService.onDidDeleteChat` fires only after provider deletion returns `true`. Its immutable payload captures `{ session, sessionResource, chatResource }` before the provider await. A failed, canceled, or throwing delete emits no successful-delete notification. Consumers use the exact resource pair to forget only the deleted owner's working-set reference, panel state, and owner-scoped composition. Session archive/removal clears state across that session's owners. These operations do not delete shared Existing visibility or last-open composition.

Draft graduation transfers state before source cleanup using the supplied `from`/`to` sessions and their main-chat resources, rather than reconstructing provider URIs. The main chat remaps to the committed main chat; unchanged peer chat resources retain their identity under the new session. Same-resource replacement is not deletion and must not release live state.

Working-set handles are shared references, not owner-exclusive resources. Replacing or forgetting an owner deletes an underlying handle only when no live layout entry or retained legacy entry references its id. This applies to main-chat deletion, archive/removal, and remapping that displaces a destination handle.

## 6. Persistence

`BaseLayoutController` persists entries with `StorageTarget.MACHINE` in workspace storage. Legacy desktop state uses `sessions.singlePane.layoutState`; the shared Existing Session profile uses `sessions.singlePane.sidePaneVisibility`. These keys remain usable when the experiment is disabled.

Enabled-mode persistence uses separate version-1 envelopes:

| Key | Contract |
|-----|----------|
| `sessions.singlePane.chatLayoutState` | `{ version: 1, entries }`; working-set handles, panel visibility, and panel-view memory keyed by layout owner |
| `sessions.chatLayout.sidePaneComposition` | `{ version: 1, entries }`; current Editor/Details composition per owner |
| `sessions.chatLayout.sidePanePreHideComposition` | `{ version: 1, entries }`; last-open Editor/Details composition per owner |
| `sessions.singlePane.sharedChatLayoutState` | `{ version: 1, entries }`; per-owner working sets and panel views, plus one shared Existing bottom-visibility entry |
| `sessions.sharedChatLayout.sidePaneComposition` | `{ version: 1, entries }`; shared Existing current composition and separate draft composition |
| `sessions.sharedChatLayout.sidePanePreHideComposition` | `{ version: 1, entries }`; shared Existing last-open composition |

The first three keys belong to `chat`; the latter three belong to `chat-shared`. Its transient visibility profile uses `sessions.sharedChatLayout.sidePaneVisibility` separately from the legacy/per-chat profile. Reloading into another mode does not overwrite the other mode's saved preferences.

No chat record stores geometry or terminal process metadata. Versioned entries are validated before applying the record; malformed or unsupported records are logged and removed without partially applying earlier entries.

If no usable experimental layout record exists, legacy desktop state is copied forward for main chats only, without removing or rewriting the legacy key. Existing experimental state wins. Legacy working-set ids are collected even when the experimental record already exists, so later owner cleanup cannot invalidate the retained disabled-mode state. Peer entries are not pruned merely because their catalogs have not hydrated. The older `sessions.workingSets` migration remains a separate legacy base-controller path.

Workbench-owned side-pane geometry and part visibility are restored before the layout controller starts. Layout restoration must not recalculate or overwrite that geometry.

Terminal persistence retains the backend's existing capabilities and settings, including `terminal.integrated.enablePersistentSessions`, independently of layout scope. Chat-layout records neither add terminal process metadata nor change reconnection or process lifetime.

## 7. Key invariants

- Observables drive session/chat owner switches.
- Only one controller manages the active presentation.
- Editor inputs open through `IEditorService`.
- Programmatic working-set operations suppress automatic editor visibility.
- Enabled-mode content belongs to the focused chat; visibility follows the chosen shared or per-chat policy.
- Panel content restoration never changes panel visibility.
- Experimental focused ownership remains authoritative with multiple visible sessions or chat groups.
- Geometry stays shared, and closing a tab is not deletion.
- Successful deletion forgets exact owner references; retained legacy and sibling handle references remain valid.
- Runtime phone suspension preserves experimental layout state without changing terminal behavior.
- Phone presentation never automates the Auxiliary Bar.

## Test ownership

- Shared rules: `contrib/layout/test/browser/baseSessionLayoutController.test.ts`
- Desktop controller transitions: `contrib/layout/test/browser/desktopLayoutController.test.ts`
- Desktop lifecycle strategies: `contrib/layout/test/browser/desktopStrategies.test.ts`
- Chat ownership and persistence: `contrib/layout/test/browser/chatLayoutOwnership.test.ts`
- Versioned composition storage: `contrib/layout/test/browser/desktopOwnerCompositionStore.test.ts`
- Startup/reload mode: `contrib/layout/test/browser/sessions.layout.contribution.test.ts`
- Existing terminal behavior and task reuse: `contrib/terminal/test/browser/`
- Mobile rules: `contrib/layout/test/browser/mobileSessionLayoutController.test.ts`
