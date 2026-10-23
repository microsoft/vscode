# Sessions list

> **Specification change gate:** Do not update this document for row rendering, styling, actions, picker flows, or bug fixes. Update it only when placement precedence, state ownership, or a cross-surface list contract changes.

## Scope

The Sessions list is the primary navigation surface in the Agents Window. It aggregates provider-neutral sessions into a grouped, filterable tree and owns user presentation state such as pins, custom groups, ordering, and collapsed sections.

This specification defines stable placement and state-ownership rules. Row styling, labels, icons, action placement, animation, picker workflows, and implementation algorithms belong in code and focused tests.

## Ownership

| Concern | Owner |
|---------|-------|
| Session catalog and lifecycle | `ISessionsManagementService` |
| Pin and per-sort ordering state | `ISessionsListModelService` |
| Order of a session's nested chats | The session's provider |
| Custom groups, group and grouping-section appearance, nesting, automatic-section parents, mixed child order, and session membership | `ISessionGroupsService` |
| Top-level custom group and grouping-section order | `ISessionSectionOrderService` |
| Tree composition and presentation | `SessionsView` and `SessionsList` |

List-owned state is local presentation state. It is not synchronized back to a provider and must not mutate provider timestamps or metadata.

Grouping-section appearance is persisted by the section's stable identity, independently of its nesting and grouping mode. Temporary absence of a workspace or remote host does not discard its appearance; custom groups and their subgroups keep independent overrides.

## Inputs

The list consumes sessions from `ISessionsManagementService`. Providers decide whether a model represents a workspace session, quick chat, automation, or archived session through provider-neutral fields.

Automation runs are excluded from the primary Sessions list. Surfaces that need session-row presentation without sectioning use `SessionsFlatList`.

## Placement precedence

A session appears in exactly one primary section. Higher-precedence states win:

```text
Archived
    > Pinned
    > Custom group
    > External (when dedicated sectioning is enabled)
    > Quick chat (workspace and repository grouping only)
    > Workspace, repository, environment, or date group
```

- Archived sessions appear only in the final archived section.
- Pinned sessions appear in the pinned section.
- A valid custom-group membership places an unpinned, unarchived session in that group, including a quick chat. A session belongs to at most one group at any nesting depth.
- When dedicated external sectioning is enabled, remaining external sessions appear together before the archived section. Pinning and custom-group membership retain their precedence; disabling sectioning returns external sessions to the ordinary grouping rules without changing that presentation state.
- Under workspace or repository grouping, remaining unpinned quick chats appear in the dedicated chats section. Under date or environment grouping there is no chats section; quick chats follow that grouping like other sessions, and so do comparison groups without a workspace.
- Remaining sessions follow the selected workspace, repository, environment, or date grouping.
- A regular session created by another regular session is initially placed
  immediately after its creator. While it has neither custom-group membership
  nor an explicit ungrouped preference, it inherits the creator's custom group
  when one becomes available. Subsequent user grouping, ungrouping, and
  reordering are ordinary persisted list state.
- A session a nested chat was promoted to joins the custom group of the session it was promoted from, whatever started the promotion, unless it already has a placement of its own. It keeps ordinary placement when that session has no group.

The active session remains visible even when a filter would otherwise exclude it.

A caller can acquire a disposable reveal of a session row or its archive action for onboarding. The list temporarily includes that session despite filters and presentation caps, expands its section, and exposes the requested spotlight target. An archive-action reveal also keeps the action visible without hover or focus. A workspace reveal targets the header of the workspace section that contains the session, or the session row when the list is not grouped by workspace. Releasing the reveal restores normal filtering and action visibility without changing the user's saved filters.

## Grouping

### Workspace grouping

User-created groups and workspace sections share a user-managed order below the fixed sections. Workspace capping may initially hide inactive workspaces; search and explicit user promotion reveal them.

### Repository grouping

Repository grouping places sessions by the GitHub repository of their primary folder, so the sessions of one repository share a section whichever environment runs them. A cloud session names its repository through its workspace; other sessions report it through their Git metadata. Sessions without a GitHub repository keep their workspace section. A section shows its repository's name, adding the owner only when several repository sections share that name.

Repository sections otherwise behave like workspace sections: they share the user-managed order with custom groups, follow the same capping, and nest comparison groups of their repository.

### Date grouping

User-created groups and the date sections share a user-managed order below the fixed sections. The date sections keep their fixed relative order and cannot be dragged, while groups default above them and can move between and below them. Ungrouped sessions follow in the date sections.

### Environment grouping

Environment grouping uses the provider-neutral environment identity, combining sessions across harnesses and workspaces on This Computer, in Cloud, or on the same remote host. Environment sections otherwise follow workspace sections' user-managed ordering and capping rules. Their identities remain stable across display-name changes.

### Nested custom groups

User-created groups form a tree without a depth limit. In every grouping mode, only top-level groups take part in the order above; a group lists its child groups and active automatic sections in a shared user-managed order above its own sessions. Actions on a group's sessions, such as marking them done, include its subgroups and currently nested sections. Deleting a group deletes its subgroups, ungroups their explicit session members, and returns their automatic sections to the top level; undo restores section placements unless they have since moved to another group. Comparison groups cannot be manually nested or hold children; they retain their automatic placement within grouping sections.

A workspace, repository, or environment section can belong to one custom group at any depth. This places the section, not its sessions, in that group: future matching sessions follow it, and higher-precedence placements remain unchanged. Section placement is remembered independently for each grouping mode, including the workspace fallback in Repository mode, and only applies in that mode. Nested sections do not consume the top-level Recent section limit, while their own session limits still apply. Temporarily empty sections retain their parents and child order without rendering an empty automatic header.

### Quick chats

Quick chats are identified through `ISession.isQuickChat`, not by checking for an absent workspace. They remain session rows; the list never exposes `IChat` objects as top-level rows.

A quick chat can have nested chats like any session whose provider supports multiple chats, and chats move into and out of quick chats; the provider's per-chat movability decides, never the quick-chat flag. Where the grouping has a chats section, a quick chat stays in it even when it holds chats that brought a folder of their own: those chat rows show their folder, and its scratch-folder chats show none.

New Nested Session opens the New Session composer for a nested chat of any session, without the agent (harness) and environment pickers: the nested chat uses the session's agent, provider and host. The folder picker lists folders like the New Session workspace picker (folder name, then its parent folder): it preselects the session's folder, or No Workspace in a session without one, and offers the session's folder, recent folders of the provider, No Workspace, then the provider's browse actions and Open Folder… for a provider on this computer. Folders of the session's other chats are not offered. When the session's folder no longer exists, No Workspace is preselected and the trigger says why; only a definite "not found" counts (a host that can't tell keeps the session folder), and a send waits for that check. Scratch folders, including a quick chat's own, are never offered as folders; the host refuses one. A picked folder joins the session's folders for that chat; No Workspace gives the chat its own scratch folder, also in a workspace session, where it shows no folder. For a Git folder, New Worktree and the branch picker give the chat its own worktree from the picked branch. An agent without multiple working directories offers only the session's folder (No Workspace in a session without one). The choice applies when the first request is sent, to the untitled chat the composer opened with, so the nested session stays one chat: an unchanged default leaves it as it is; otherwise the host gives it the chosen workspace before the request, and refuses (leaving the chat as it was) once the chat has a turn. Hosts that don't advertise `vscode.createChatWorkspace` keep the composer without workspace pickers.

### Archived sessions

Archiving removes custom-group membership. Restoring a session does not restore its former membership, except when undoing a bulk archive from the list: that operation restores the captured membership if the group still exists. User-facing archive terminology may vary, but the underlying archived state and placement rule do not.

## Durable user intent

Pin, group, and ordering state survives temporary provider-catalog removal. Providers may transiently publish incomplete catalogs while reconnecting or hydrating, so `onDidChangeSessions.removed` is not proof of deletion.

List-owned state is removed only when:

- the management service reports definitive deletion;
- archiving invalidates group membership;
- the user explicitly changes or removes the state.

Stale entries that match no current session are inert and may be compacted by their owning service.

## Sorting and filtering

The list supports created-time and updated-time sorting. Manual ordering stores list-owned sort keys for each mode without changing provider timestamps.

Filters compose across harness, environment, creating application within each environment, and archive state. Providers apply External visibility before publishing their catalogs; list filters further narrow those catalogs. Application options come from the current catalog before list filtering, including cached sessions from disconnected environments. Environment and application preferences use stable identifiers, not mutable display names, and survive an option's disappearance.

The archived filter governs both archived sessions and archived nested chats; there is no per-session archive-visibility override. The agent host filter scopes to every provider the selected host entry covers, which is more than one when that entry groups several hosts and none while such a group is empty. The find widget matches session and section labels and bypasses presentation capping while a search is active.

## Drag and drop

Drag and drop changes only list-owned presentation state, archives or restores sessions through the owning services, or opens sessions through the appropriate service.

A session drop resolves to a destination placement: Pinned, a custom group, an ungrouped section, or Archived. Moving sessions into a placement applies only the state that placement precedence reads: it archives or restores, pins or unpins, and joins or leaves a custom group as needed. A session may enter an ungrouped section only if that is the section it renders in when ungrouped.

- sessions may reorder within valid sections and move into Pinned, a custom group, or their own ungrouped section, which unpins or ungroups them as needed;
- dropping sessions on the archived section archives them with an undo affordance; dropping archived sessions elsewhere restores them;
- date sections derive from the sort key, so dropping on a date section header places sessions at the top of that section, and dropping below the last row places non-archived sessions at the end of the date sections; because date grouping also promotes recently updated sessions and caps Recent, a drop into a date section is offered only when the sessions will render in that section;
- dropping a session on a nested chat row places it after that chat's session;
- nested chats render in their provider's order (by update time under updated-time sorting); the list never stores an order of its own for them. When moving chats by drag and drop is on and the provider can move a chat, the chat may reorder within its session, by dragging or with Move Up and Move Down, or move to another or a new session, and the provider reorders or moves it. No move asks for confirmation first. A nested chat the provider can't move, or several nested chats together, can't be dropped, and Move Up and Move Down are unavailable for it;
- user groups and workspace, repository, or environment sections may reorder where the grouping mode allows, move into custom groups, and return to the top level; a user group never moves into itself or one of its subgroups;
- dropping sessions on the Sessions grid opens them through `ISessionsService`.

Archived sections and comparison groups keep a fixed order, and comparison group membership cannot change by dragging. Multi-selection preserves relative order.

## Agent tools

The `readSessionsList` and `organizeSessionsList` client tools let an agent read and change the list as the user can. Reading reports the view options and the composed tree, including rows and sections that capping hides, using stable header ids (section ids, and `group:<id>` for custom groups) and session ids. Changes go through `SessionsList` and `SessionsView` rather than directly through the owning services, so they follow the same placement precedence, validity rules, and undo affordances as drag and drop and the list's actions. The tools exist only in the Agents window, form the `vscodeSessionsList` client tool set, and are deferred behind tool search on agent hosts.

## Reactive presentation

Rows derive title, status, workspace, changes, capabilities, and quick-chat identity from session observables. Renderers must support tree virtualization: reusing a row template for another session must not retain stale state, animations, hovers, or disposables.

Row renderers use tree-supported row classes and APIs rather than traversing tree-owned DOM structure.

Session facades may expose catalog-backed peer-chat identities, titles, interactivity, and status before detailed chat state is loaded. Rendering a virtualized peer-chat row requests provider-neutral chat hydration through `ISessionsManagementService`; collapsed and offscreen sessions therefore do not require eager per-session state loading.

A collapsed session row uses the provider's aggregate status without inspecting individual chat statuses. When expanded, the parent row represents the main chat and visible side chats, while peer rows represent their own chats.

## Persistence

List presentation state is profile-scoped user state. This includes grouping, sorting, filtering, section and nested-session collapse, the show more or show less choice of each capped workspace, repository, or environment section, the Chats section, and custom group, pins, custom groups with their nesting, automatic-section parents and mixed child order, manual sort keys, and top-level section order. A nested session starts expanded, and the user's later collapse or expansion choice persists across list and window recreation. Storage keys are private implementation details; other components change list state through the owning service API.

## Change policy

Update this specification only when placement precedence, state ownership, or a cross-surface list invariant changes. Express concrete row behavior, menu enablement, picker flows, and regressions in focused tests instead.

## Related specifications

- [Sessions architecture](SESSIONS.md)
- [Layout](LAYOUT.md)
- [Mobile](MOBILE.md)
