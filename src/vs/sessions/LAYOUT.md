# Agents Window layout

> **Specification change gate:** Do not update this document for layout bug fixes, styling, dimensions, or action placement. Update it only when part ownership, workbench topology, or a cross-part contract intentionally changes.

## Scope

The Agents Window uses a Sessions-owned workbench layout optimized for agent work. This specification defines stable part ownership, composition, and presentation modes. Session/chat capture and restoration are owned by [LAYOUT_CONTROLLER.md](LAYOUT_CONTROLLER.md).

Exact dimensions, styling, action placement, and regression behavior belong in code, design tokens, component fixtures, and focused tests.

## Workbench topology

Startup selects one of two concrete workbenches: `DesktopWorkbench` for every
non-phone window, and `MobileWorkbench` for mobile web windows below the phone
breakpoint. `Workbench` contains only their shared layout mechanics and is not
instantiated directly.

`sessions.experimental.layoutScope` is an experimental window setting
with modes `session-shared` (default), `chat-shared`, and `chat`. Both enabled modes
keep ordinary editors and the selected bottom-panel view owned by
the focused chat. `chat-shared` keeps Editor/Details composition and bottom-panel
visibility shared across all existing workspace chats in the window;
`chat` also scopes that visibility to the focused chat. The mode changes
only after manual reload, without a reload notification. There is no boolean
compatibility for this unreleased setting. The concrete workbench
selection remains fixed at startup. If a desktop window enters a runtime phone
viewport, experimental layout suspends without discarding layout state; returning
to desktop resumes the focused owner. Terminal behavior is unchanged in all modes.
Startup phone windows retain the existing mobile behavior.

```text
Title bar
Content
├── Sidebar
└── Main region
    ├── Sessions Part | Editor | Auxiliary Bar | Custom View Grid
    └── Panel
```

The workbench omits the standard Activity Bar, Status Bar, and Banner. Part positions are fixed by the Agents Window rather than user settings.

| Part | Ownership |
|------|-----------|
| Title bar | Window navigation and window-scoped actions |
| Sidebar | Sessions list and Sessions-owned sidebar views |
| Sessions Part | One or more visible session surfaces |
| Editor | File, browser, diff, and other editor inputs |
| Auxiliary Bar | Session details such as changes and files |
| Panel | Terminal and other panel views |
| Custom View Grid | Full-surface contributed views that replace session content |

The Sessions Part contains its own nested two-dimensional split grid. Its leaves are not workbench editor groups, nor the chat groups inside an individual session.

## Grid behavior

The main workbench grid is non-proportional. The Sessions Part is the flexible surface that absorbs container resize and part-visibility deltas. The Sidebar, Editor, Auxiliary Bar, and Panel preserve user-established sizes within their constraints.

At most one high-priority surface is visible in the main horizontal chain: normally the Sessions Part, or the Custom View Grid while a custom view is active. This prevents fixed side parts from absorbing general window resize.

The desktop presentation may place the Auxiliary Bar inside the Editor's grid node. Consumers must distinguish the actual Editor content area from the shared grid node when interpreting visibility or size.

Part sizes and split geometry remain shared window state in chat-specific mode.
The layout service exposes side-pane composition capture/restoration separately
from geometry: restoring a chat's Editor/Details combination or reopening its
last-open combination must not restore an old width or treat a closed grid node's
zero width as a user resize.

The desktop Panel supports two profile-scoped alignments. The default justified alignment places it below the Sessions Part and side pane, preserving the original spanning layout. Center alignment places it below the Sessions Part only, allowing the side pane to use the full content height. Switching alignment reparents the existing grid views without changing panel height or side-pane width. The mobile presentation keeps the justified topology.

## Sessions Part

Each visible session has one Sessions-owned view. The view presents the active chat for that session and scopes commands, menus, and context keys to the represented session.

Chat-tab presentation is a property of the session view, not of the action that opened a chat. The view observes its configuration directly and consistently applies either tabbed or session-view presentation to every chat, including restored chats and chats opened through navigation or external entry points.

In the side-by-side single-chat presentation, pinning a chat header keeps that chat visible while new chats reuse an unpinned group. If every visible group is pinned, opening another chat creates a group; chat pins persist with the chat-grid layout.

`ISessionsService` owns:

- visible-session identity and order;
- the active visible session;
- which chat is active in each session;
- restoration of the visible arrangement.

The Sessions Part renders that model. It does not create a second active-session store. Stable slot identities belong to the visible-session model; ordinary replacement transfers the slot to the new session. Retained sessions keep their views and live chat widgets across movement, reordering, and arrangement changes.

Opening, closing, and directional insertion or movement operate through `ISessionsService`. The part owns the canonical split geometry and user sash sizes, using the shared grid primitive. Maximization and phone presentation project a single live view without changing that geometry. Ordinary structural edits preserve unaffected branches and sizes. Balanced tiling is an explicit arrangement operation over this grid, not a persistent mode or a comparison-specific layout.

The Sessions grid commits leaf container geometry before laying out their descendants through `ISessionGridView`. Explicit layout, structural changes, and presentation transitions finish both phases synchronously, before restoring focus. Allocations delivered directly by the shared grid during a sash gesture share one cancellable animation-frame flush owned by the Sessions grid; they use the latest dimensions and never wait for the gesture to end. Removed views cannot receive pending layout work.

`ISessionsService` persists a versioned geometry snapshot separately from per-session chat state. Saved leaf bindings restore created sessions, the empty composer, active selection, pins, and maximization; untitled provider drafts are not recreated. Legacy ordered-session state remains readable. Restoration projects the saved topology onto available sessions and retains existing views when delayed providers arrive. Explicit navigation or grid interaction supersedes pending restoration.

Session geometry does not determine Editor, Details, or other side-pane visibility policy. That policy remains with the layout controllers.

## Editor presentation

All non-phone Agents windows use the desktop detail layout. Phone viewports use the dedicated mobile presentation.

The Editor and Auxiliary Bar compose one side pane next to the active session. Editor tabs choose either editor content or a details view while the layout coordinators preserve one coherent visibility model.

The main Editor supports exactly one editor group. Its shared multiple-group capability is disabled, which removes editor split/grid commands, keybindings, menus, and split drop targets; the part also rejects group creation and multi-group layout requests from open-to-side and programmatic paths. The independent chat grid remains supported.

With experimental desktop ownership active, this singleton Editor, Details, and
bottom Panel project the focused chat's ordinary working set, active editor,
composition, panel visibility, and selected panel view. Multiple visible
sessions or chat groups do not create additional editor/detail/panel owners.
Sidebar visibility and all geometry remain window-owned. Managed tabs remain
lifecycle-owned and do not reveal hidden panes during restoration. Transient
Quick Chat side-pane behavior is unchanged.

The durable state and transition catalog lives in [DESKTOP.md](DESKTOP.md). Implementation behavior is covered by the layout-controller and desktop strategy tests.

Editors must be opened through `IEditorService`. Sessions-specific presentation must not bypass editor service behavior by opening directly on an editor group.

Chat input status-pill composition is owned by the shared workbench `ChatInputPills` and `StandardChatInputPillSources` components. The Agents Window and Agent Host editor/panel surfaces supply observable data adapters and their allowed pill kinds only; ordering, per-kind presentation, visibility, context menus, keyboard behavior, compact layout, and lifecycle rendering must not be reimplemented per surface. Per-kind visibility preferences belong to `ISessionChatPillVisibilityService`; data adapters apply them before supplying pill data and option actions to the shared renderer.

Session providers register internal per-session directories as resource label homes. URI labels render as `<home label>/<relative path>`, and breadcrumbs render the same home label as their root segment. Without a matching home formatter, existing URI-label and breadcrumb behavior is unchanged.

## Custom views

`ICustomViewService` owns the active contributed full-surface view.

A custom view is mutually exclusive with the Sessions Part, grid Editor, Auxiliary Bar, and Panel. The title bar and Sidebar remain available. Covered parts retain desired visibility separately from effective grid visibility so their state can be restored when the custom view closes.

Explicit session and chat open actions dismiss the active custom view. Reactive fallback opens driven by session or chat lifecycle changes preserve the custom view while reconciling the hidden Sessions grid. On phone layouts, custom views participate in mobile navigation so platform back navigation dismisses them.

## Part lifecycle

The workbench:

1. creates the fixed grid and part instances;
2. restores persisted workbench part sizes and visibility;
3. starts the applicable layout controller;
4. reacts to visible-session, editor, and contributed-view state;
5. persists state through the owning services during shutdown.

Part instances and listeners are disposables. Repeatedly created per-session or per-view state is owned by a scoped disposable store.

## Layout-controller boundary

Layout controllers translate session and focused-chat activation into part capture and restoration. They do not own session/chat identity or the visible-session model. Experimental owner and presentation snapshots guard asynchronous restoration; terminal process ownership remains in the terminal contribution, not in layout records.

Mobile and desktop presentations intentionally use different strategies where their compositions differ. Shared behavior belongs in the base controller; presentation-specific behavior stays in the relevant controller or strategy.

See [LAYOUT_CONTROLLER.md](LAYOUT_CONTROLLER.md) for rule tags, persistence, and test ownership.

## Mobile boundary

Phone layouts replace selected parts and pickers with mobile subclasses while preserving the same service and provider contracts. Mobile composition and navigation are specified in [MOBILE.md](MOBILE.md).

## Contributions and loading

Layout contributions register through the appropriate `sessions.*.main.ts` entry point. Shared workbench code should change only when the capability is useful outside the Agents Window; Sessions-specific policy stays under `vs/sessions`.

## Change policy

Update this specification only when part ownership, grid topology, presentation families, or a cross-part invariant changes. Do not update it for:

- pixel values, styling, icons, or action placement;
- individual view or editor behavior;
- bug narratives and rejected implementations;
- per-session restoration scenarios already owned by controller rules and tests.

## Related specifications

- [Documentation index](README.md)
- [Sessions architecture](SESSIONS.md)
- [Layout controllers](LAYOUT_CONTROLLER.md)
- [Desktop scenarios](DESKTOP.md)
- [Mobile layout](MOBILE.md)
