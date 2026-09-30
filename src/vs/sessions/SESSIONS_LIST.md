# Sessions list

> **Specification change gate:** Do not update this document for row rendering, styling, actions, picker flows, or bug fixes. Update it only when placement precedence, state ownership, or a cross-surface list contract changes.

## Scope

The Sessions list is the primary navigation surface in the Agents Window. It aggregates provider-neutral sessions into a grouped, filterable tree and owns user presentation state such as pins, custom groups, header colors, collections, ordering, and collapsed sections.

This specification defines stable placement and state-ownership rules. Row styling, labels, icons, action placement, animation, picker workflows, and implementation algorithms belong in code and focused tests.

## Ownership

| Concern | Owner |
|---------|-------|
| Session catalog and lifecycle | `ISessionsManagementService` |
| Pin and per-sort ordering state | `ISessionsListModelService` |
| Custom groups and membership | `ISessionGroupsService` |
| Top-level group/workspace order | `ISessionSectionOrderService` |
| Header colors (groups, workspace sections, Pinned, Chats) | `ISessionSectionColorsService` |
| Collections, the active collection, and collection membership | `ISessionCollectionsService` |
| Tree composition and presentation | `SessionsView` and `SessionsList` |

List-owned state is local presentation state. It is not synchronized back to a provider and must not mutate provider timestamps or metadata.

## Inputs

The list consumes sessions from `ISessionsManagementService`. Providers decide whether a model represents a workspace session, quick chat, automation, or archived session through provider-neutral fields.

Automation runs are excluded from the primary Sessions list. Surfaces that need session-row presentation without sectioning use `SessionsFlatList`.

## Placement precedence

When collections are enabled and more than one exists, the list shows only the active collection; placement precedence then applies within it. See [Collections](#collections).

A session appears in exactly one primary section. Higher-precedence states win:

```text
Archived
    > Pinned
    > Custom group
    > External (when dedicated sectioning is enabled)
    > Quick chat
    > Workspace or date group
```

- Archived sessions appear only in the final archived section.
- Pinned sessions appear in the pinned section.
- A valid custom-group membership places an unpinned, unarchived session in that group, including a quick chat.
- When dedicated external sectioning is enabled, remaining external sessions appear together before the archived section. Pinning and custom-group membership retain their precedence; disabling sectioning returns external sessions to the ordinary grouping rules without changing that presentation state.
- Remaining unpinned quick chats appear in the dedicated chats section.
- Remaining sessions follow the selected workspace or date grouping.
- A regular session created by another regular session is initially placed
  immediately after its creator. While it has neither custom-group membership
  nor an explicit ungrouped preference, it inherits the creator's custom group
  when one becomes available. Subsequent user grouping, ungrouping, and
  reordering are ordinary persisted list state.

The active session remains visible even when a filter would otherwise exclude it, unless it belongs to another collection.

A caller can acquire a disposable reveal of a session row or its archive action for onboarding. The list temporarily includes that session despite filters and presentation caps, expands its section, and exposes the requested spotlight target. An archive-action reveal also keeps the action visible without hover or focus. Releasing the reveal restores normal filtering and action visibility without changing the user's saved filters.

## Grouping

### Workspace grouping

User-created groups and workspace sections share a user-managed order below the fixed sections. Workspace capping may initially hide inactive workspaces; search and explicit user promotion reveal them.

### Date grouping

User-created groups remain a contiguous user-managed block. Ungrouped sessions follow in fixed date sections.

### Quick chats

Quick chats are identified through `ISession.isQuickChat`, not by checking for an absent workspace. They remain session rows; the list never exposes `IChat` objects as top-level rows.

### Archived sessions

Archiving removes custom-group membership. Restoring a session does not restore its former membership, except when undoing a bulk archive from the list: that operation restores the captured membership if the group still exists. User-facing archive terminology may vary, but the underlying archived state and placement rule do not.

### Colors

Every custom group has a color; a new group receives the next unused palette color. Workspace sections and the built-in Pinned and Chats sections are uncolored until the user colors them, and a built-in section's color is list-wide rather than per collection. Other fixed sections are not colorable. Colors change presentation only, never placement, and have no effect while colored groups are disabled.

## Collections

Collections partition the list. Each group, each workspace section's ungrouped sessions, and each session belongs to exactly one collection, resolved from logical state rather than rendered placement:

```text
Custom-group membership (including pinned members)
    > Explicit session assignment
    > Creating session's collection
    > Workspace section's collection
    > Default collection
```

- Leaving a group by ungrouping, archiving, or deleting the group keeps the session in the group's collection.
- Moving a session into a collection removes it from a group of another collection.
- Moving a workspace section moves the section and its sessions shown in the source collection; sessions explicitly assigned elsewhere stay.
- A session created from the composer joins the collection that is active when it is sent.
- Deleting a collection moves its groups, workspaces, and sessions to another collection.

Switching collections activates the collection's last open session, or the new-session composer when it has none. Activating a committed session from another collection makes that collection active; later reassignment of the open session does not switch collections. With a single collection, or with collections disabled, the list behaves as if collections did not exist.

## Durable user intent

Pin, group, color, collection, and ordering state survives temporary provider-catalog removal. Providers may transiently publish incomplete catalogs while reconnecting or hydrating, so `onDidChangeSessions.removed` is not proof of deletion.

List-owned state is removed only when:

- the management service reports definitive deletion;
- archiving invalidates group membership;
- deleting a group removes its color and collection assignment;
- the user explicitly changes or removes the state.

Stale entries that match no current session are inert and may be compacted by their owning service.

## Sorting and filtering

The list supports created-time and updated-time sorting. Manual ordering stores list-owned sort keys for each mode without changing provider timestamps.

Filters compose across session type, status, archive/read state, and provider. The archived filter governs both archived sessions and archived nested chats; there is no per-session archive-visibility override. The agent host filter scopes to every provider the selected host entry covers, which is more than one when that entry groups several hosts and none while such a group is empty. The find widget matches session and section labels and bypasses presentation capping while a search is active.

## Drag and drop

Drag and drop changes only list-owned presentation state or opens sessions through the appropriate service:

- sessions may reorder within valid sections;
- sessions may move into user-created groups;
- non-archived sessions may move into the pinned section;
- user groups and workspace sections may reorder where the grouping mode allows;
- sessions, user groups, and workspace sections may move to another collection by dropping them on its switcher entry;
- dropping sessions on the Sessions grid opens them through `ISessionsService`.

Archived and fixed sections are not reorder targets. Multi-selection preserves relative order.

## Reactive presentation

Rows derive title, status, workspace, changes, capabilities, and quick-chat identity from session observables. Renderers must support tree virtualization: reusing a row template for another session must not retain stale state, animations, hovers, or disposables.

Row renderers use tree-supported row classes and APIs rather than traversing tree-owned DOM structure.

Session facades may expose catalog-backed peer-chat identities, titles, and interactivity before detailed chat state is loaded. Rendering a virtualized peer-chat row requests provider-neutral chat hydration through `ISessionsManagementService`; collapsed and offscreen sessions therefore do not require eager per-session state loading.

## Persistence

List presentation state is profile-scoped user state. This includes grouping, sorting, filtering, section and nested-session collapse, pins, custom groups, header colors, collections and their memberships, the active collection and each collection's last open session, manual sort keys, and section order. A nested session starts expanded, and the user's later collapse or expansion choice persists across list and window recreation. Storage keys are private implementation details; other components change list state through the owning service API.

## Change policy

Update this specification only when placement precedence, state ownership, or a cross-surface list invariant changes. Express concrete row behavior, menu enablement, picker flows, and regressions in focused tests instead.

## Related specifications

- [Sessions architecture](SESSIONS.md)
- [Layout](LAYOUT.md)
- [Mobile](MOBILE.md)
