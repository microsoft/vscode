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

The Sessions Part contains its own horizontal grid. Its session surfaces are not workbench editor groups.

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

### Sessions board

The board is a contributed `AbstractCustomView`, hosted by the existing Custom View Grid rather than by a second workbench or a replacement editor group. The overview projects the management service's catalog; `ISessionsService` owns board visibility and retains the regular visible-session arrangement for restoration. The Sessions Part does not bind the board's catalog to its ordinary chat grid. Saving while the board is open persists the regular arrangement, not a chat column for every card.

The dashboard is an independent user experience. Creation, workspace and execution-target selection, approvals, recovery, and result review use dashboard-owned presentation without opening the regular Sessions grid or standalone new-session screen, even temporarily or invisibly. Shared native widgets and services remain reusable; a hidden instance of another presentation is not an execution dependency. Leaving the dashboard is explicit user navigation, not a setup or failure fallback.

All work groups use viewport-mounted, wrapping session cards. Each section's board owns placement, resize and reorder gestures, and the matching card and drop-placeholder bounds; cards are not children of full-width tree rows. Ordinary compact cards show provider-neutral metadata and a lightweight native input without acquiring a conversation model. A visible card acquires native conversation content only after explicit expansion or when its owning chat is waiting for input. Pending-input content uses the existing request controls and response path; visibility never approves a request or counts as a human open. Card-owned renderers and model references have viewport-scoped lifetimes rather than catalog-scoped lifetimes, and never dispose a model owned by another surface. Collapsed sections do not mount boards; an active card interaction may retain its controls beyond the viewport.

Native input drafts are shared through `ISessionInputDraftService`, so resizing, regrouping, or recycling a card cannot replace its chat-scoped draft with a separate input state. The reply remains below expanded content. Custom collections reuse `ISessionGroupsService`; saved queries and promoted automatic sections belong to `ISessionsBoardService`. A session can occur in more than one query without gaining another backend identity or manual collection membership.

The dashboard hosts a conversation-first new-work input independently of query sections. Agent-led creation is its normal workflow, not a second opt-in mode within the experimental dashboard feature. It reuses the native input primitive with a caller-owned management draft, not the regular pending draft or standalone new-session screen. A repository or execution picker is not a prerequisite: the dashboard's agent can discover targets, ask native questions, and request approved background execution. The main conversation stays the anchor for related work.

The unsent input and captured collection intent have dashboard-owned persistence. The creation surface is draft-only: after the first accepted request it closes and opens the same native conversation/review view used by Open Work. Opening an existing conversation never moves its card into the creation area. The card's placement and draft remain intact behind review, and its native transcript is suspended while covered. Closing review reveals the session in its current group, expanding that group if needed, provided it still matches the active view; existing query filters remain authoritative.

The focused view uses native modal maximize, restore, and close controls. Card expansion is an inline preview, not a second focused conversation mode. Stop Response is a separate, explicitly chat-scoped action available for running and waiting responses on cards and in focused review. Closing a view neither cancels work nor marks results reviewed; stopping a response does not archive the session, undo changes, or cancel independent workers. Workspace attachment and continuation facts remain provider-owned, and presentation never authorizes setup or resumes uncertain execution.

### Session review

Review uses the native modal editor part's sidebar and content-footer extension points. It does not create an editor group in an arbitrary DOM container or move workbench-owned DOM. Navigation stays in the left sidebar; the content footer hosts the existing Sessions composer below the editor column, bound to one session's selected chat. Both extensions are created for the modal's lifetime, independent of its active editor. Conversation and artifact catalog inputs are registered editor panes; artifacts use native resource editors, changes use the existing changes editor, and pull requests use a read-only native review editor with an explicit external-open action.

`ISessionsService.sessionReview` owns the requested session and review section. The editor integration owns the native modal's lifetime and current result selection. Changing the selected result does not change the draft's references; Add to Reply adds explicit references through the draft service. Sending captures the owning session and chat before asynchronous work and delegates execution to `ISessionsManagementService`.

The board remains mounted behind the modal, and its controls are retained so native modal closing can restore the initiating focus. Its native conversation renderers and model references are suspended while covered by review. The normal session grid and other workbench parts remain under the existing custom-view visibility contract. Opening, changing, or closing review does not archive, delete, or stop a session.

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

Chat input status-pill composition is owned by the shared workbench `ChatInputPills` and `StandardChatInputPillSources` components. The Agents Window and Agent Host editor/panel surfaces supply observable data adapters and their allowed pill kinds only; ordering, per-kind presentation, visibility, context menus, keyboard behavior, compact layout, and lifecycle rendering must not be reimplemented per surface. Per-kind visibility preferences belong to `ISessionChatPillVisibilityService`; data adapters apply them before supplying pill data and option actions to the shared renderer.

Session providers register internal per-session directories as resource label homes. URI labels render as `<home label>/<relative path>`, and breadcrumbs render the same home label as their root segment. Without a matching home formatter, existing URI-label and breadcrumb behavior is unchanged.

## Custom views

`ICustomViewService` owns the active contributed full-surface view.

`CustomViewNode` owns the shared header and outer scrollbar. It supplies `AbstractCustomView.setViewport` with the visible vertical range relative to the view's render container and a host-owned scrolling callback. Viewport-mounted children translate this range into their own coordinates; they do not inspect private host DOM or add a second outer scrollbar. The host updates the range on layout, scrolling, and content-size changes.

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
