# Agents Window layout

> **Specification change gate:** Do not update this document for layout bug fixes, styling, dimensions, or action placement. Update it only when part ownership, workbench topology, or a cross-part contract intentionally changes.

## Scope

The Agents Window uses a Sessions-owned workbench layout optimized for agent work. This specification defines stable part ownership, composition, and presentation modes. Per-session capture and restoration are owned by [LAYOUT_CONTROLLER.md](LAYOUT_CONTROLLER.md).

Exact dimensions, styling, action placement, and regression behavior belong in code, design tokens, component fixtures, and focused tests.

## Workbench topology

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

The Sessions Part contains its own horizontal grid. Its leaves are not workbench editor groups.

## Grid behavior

The main workbench grid is non-proportional. The Sessions Part is the flexible surface that absorbs container resize and part-visibility deltas. The Sidebar, Editor, Auxiliary Bar, and Panel preserve user-established sizes within their constraints.

At most one high-priority surface is visible in the main horizontal chain: normally the Sessions Part, or the Custom View Grid while a custom view is active. This prevents fixed side parts from absorbing general window resize.

The single-pane presentation may place the Auxiliary Bar inside the Editor's grid node. Consumers must distinguish the actual Editor content area from the shared grid node when interpreting visibility or size.

## Sessions Part

Each visible session has one Sessions-owned view. The view presents the active chat for that session and scopes commands, menus, and context keys to the represented session.

`ISessionsService` owns:

- visible-session identity and order;
- the active visible session;
- which chat is active in each session;
- restoration of the visible arrangement.

The Sessions Part renders that model. It does not create a second active-session store.

Multiple visible sessions share the available Sessions Part width. Opening, closing, and reordering views operate through `ISessionsService`.

## Editor presentation

The Agents Window supports two presentation families:

The single-pane layout is the default on non-phone viewports when its startup setting is enabled. Phone viewports always use the classic layout. The selection is made during workbench creation and requires a reload when the setting changes.

### Classic layout

The Editor is a workbench-grid part and may be hidden independently of the Sessions Part and Auxiliary Bar. Ordinary editors open in that main Editor; editors that require modal presentation use `ModalEditorPart` without changing the underlying workbench topology.

### Single-pane detail layout

The Editor and Auxiliary Bar compose one side pane next to the active session. Editor tabs choose either editor content or a details view while the layout coordinators preserve one coherent visibility model.

The main Editor supports exactly one editor group. Its shared multiple-group capability is disabled, which removes editor split/grid commands, keybindings, menus, and split drop targets; the part also rejects group creation and multi-group layout requests from open-to-side and programmatic paths. The independent chat grid remains supported.

The durable state and transition catalog lives in [SINGLE_PANE_SCENARIOS.md](SINGLE_PANE_SCENARIOS.md). Implementation behavior is covered by the layout-controller and single-pane strategy tests.

Editors must be opened through `IEditorService`. Sessions-specific presentation must not bypass editor service behavior by opening directly on an editor group.

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

Layout controllers translate session activation into part capture and restoration. They do not own session identity or the visible-session model.

Classic desktop, mobile, and single-pane presentations intentionally use different strategies where their compositions differ. Shared behavior belongs in the base controller; presentation-specific behavior stays in the relevant controller or strategy.

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
- [Single-pane scenarios](SINGLE_PANE_SCENARIOS.md)
- [Mobile layout](MOBILE.md)
