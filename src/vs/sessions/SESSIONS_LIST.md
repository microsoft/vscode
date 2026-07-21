# Sessions List

The sessions list is the primary navigation surface in the Agents Window. It occupies the **Sidebar** and presents all sessions from all registered providers as a grouped, filterable, sortable list.

---

## Overview

The sessions list (`SessionsView` + `SessionsList`) displays every session known to `ISessionsManagementService`. Sessions are aggregated from all registered providers and shown in collapsible **sections**. The user can group, sort, filter, pin, and archive sessions. Selecting a session navigates to it.

### Key Files

| File | Purpose |
|------|---------|
| `contrib/sessions/browser/views/sessionsView.ts` | `SessionsView` — ViewPane with header, new-session button, sort/group/filter persistence |
| `contrib/sessions/browser/views/sessionsList.ts` | `SessionsList` — tree control, grouping/filtering logic, menu IDs, context keys |
| `services/sessions/browser/sessionsListModelService.ts` | `ISessionsListModelService` — pin/sort state + shared status icon (UI-only, not synced to providers) |
| `services/sessions/browser/sessionGroupsService.ts` | `ISessionGroupsService` — user-created groups and session→group membership (UI-only) |
| `services/sessions/browser/sessionSectionOrderService.ts` | `ISessionSectionOrderService` — manual top-level order of groups + workspace sections and workspace promotion (UI-only) |
| `contrib/sessions/browser/views/sessionsViewActions.ts` | All registered actions (sort, group, filter, pin, archive, rename, navigate) |

---

## Features

### Session Row

Each session row displays:

- **Status icon** — animated indicator for InProgress / NeedsInput / Error / Completed / Unread; quick chats never show a PR glyph (they have no GitHub PR association) and no per-row chat icon is shown either (the Chats section header, Pinned section, or custom group already conveys their identity)
- **Title** — the session's display title (observable)
- **Type icon** (regular sessions only) — folder/worktree/cloud icon indicating the workspace kind; omitted for quick chats
- **Workspace badge** — folder/worktree/cloud icon + label (hidden when redundant with section header)
- **Diff stats** (regular sessions only) — `+insertions −deletions` when the session has pending changes; omitted for quick chats
- **Status description or timestamp** (regular sessions only) — InProgress/NeedsInput/Error show a status message, otherwise a relative timestamp; quick chats show none of this (their compact spinner status icon already conveys "in progress", and diff stats/timestamps are omitted for their more compact row)
- **Approval row** (optional) — pending agent approvals with an "Allow" button

Quick-chat rows (`.session-item.quick-chat`, driven by the reactive `ISession.isQuickChat` observable) are single-line entries: the details (second) row is hidden entirely and its content is never built — smaller icon, one line of title only, tighter row height (see `SessionsTreeDelegate.ITEM_HEIGHT_QUICK_CHAT`). Regular sessions keep the standard two-line row (title + details row).

`SessionsFlatList` reuses the same session row renderer for sectionless surfaces, including the approval row and dynamic row height updates. Consumers that size their own container listen for content-height changes and relayout the list. When embedded inside another hover, consumers disable row hovers so moving over the list does not replace the parent hover.

### Grouping

Sessions are organized into sections with fixed priority:

```
1. Pinned        ← always first, not reorderable
2. Chats         ← workspace-less "quick chat" sessions; always-visible, directly below Pinned
3. Groups        ← user-created groups, user-ordered (see below)
4. Regular       ← grouped by workspace or date
5. Done/Archived ← always last, not reorderable
```

The **Chats** section holds workspace-less quick-chat sessions, detected via the `isQuickChatSession(session)` helper (which reads the session's own `ISession.isQuickChat` observable — **not** `workspace === undefined`, which can be transiently undefined for workspace-bound sessions too). It renders **inside the Sessions list directly below the Pinned section** (above the workspace/date groups) in **both** grouping modes — quick chats are neither a workspace nor a date bucket, so they are partitioned out of workspace/date grouping and rendered as their own entry right after Pinned. The section is **always visible** (even with no quick chats) whenever a provider advertises `supportsQuickChats` — subject to the `sessions.list.showEmptyDefaultGroups` setting (default `true`; when `false` the empty Chats section is hidden). Both the Pinned and Chats section headers carry a **leading icon** (`Codicon.pinned` for Pinned, `Codicon.commentDiscussion` for Chats) and share the standard section-header font/styling (the two headers look consistent — no prominent top-title variant). The Chats header shows the chat icon, the label "Chats", and a **"+" New Quick Chat** action in its section toolbar (also bound to **Cmd+K Cmd+N**) — the *only* create affordance for quick chats (Cmd+N always creates a new **session**, not a quick chat; there is no quick-chat action in the top Sessions header). "Mark All as Done" is not offered on the Chats section. When the section has **no quick chats**, it shows a muted, centered **"No chats" placeholder row** (a synthetic non-session list item, like the "show more" rows) instead of an empty section. A pinned quick chat still appears in Pinned (pin wins), and an archived one still goes to Done (archive wins). Quick-chat rows never show a per-row chat/PR glyph as their **status icon** (their identity is already conveyed by the Chats section, the Pinned section, or a custom group), have no type icon in the details row, and carry no workspace badge/diff stats/timestamp (see Session Row above).

Each quick chat is its **own single-chat session** (New Quick Chat = a new session per create), so it occupies one list row like any other session — there are no chat-level (`IChat`) rows. A quick chat is pinned/grouped/archived as a whole session: a pinned quick chat appears in Pinned (pin wins), an archived one goes to Done (archive wins). The earlier "single quick-chat container session whose peer `IChat`s become their own rows" model was descoped.

Two grouping modes (user-switchable):

- **By Workspace** (default) — user groups and one section per workspace label share a single, freely-reorderable user-managed order below Pinned. By default groups come first and workspaces are alphabetical ("Unknown" workspace last) until the user drags them.
- **By Date** — user groups form a contiguous, user-ordered block directly below Pinned; the non-grouped sessions follow in the fixed date sections (Recent, Older), where Recent holds up to 10 sessions from the last 7 days and Older holds the rest. Groups never mix into the date sections.

User groups are **fully user-managed**: their order is owned by `ISessionSectionOrderService`, defaults to newest-first, and is shared across both grouping modes (it no longer derives from the recency of a group's member sessions).

Archived sessions always go to the "Done" section regardless of grouping mode. Archive wins over pin — an archived session is never shown in Pinned.

### Sorting

- **By Created** (default) — `createdAt` descending
- **By Updated** — `updatedAt` descending

### Workspace and User Group Capping

When grouping by workspace, the list shows only **primary** workspace sections by default:

- A workspace qualifies as primary if it has recent activity (last 4 days), matches the open window's folder, or contains the most recently updated session
- Remaining workspaces collapse behind a "+N more workspaces" toggle
- Within each workspace or user-created group, sessions beyond 5 (configurable by the same assignment treatment) also show a "Show more" toggle and then a "Show less" toggle once expanded
- The find widget bypasses all capping

### Filtering

Multiple filter dimensions combine:

| Filter | Default | Effect |
|--------|---------|--------|
| Session type | All shown | Hides sessions of specific types (per available session types) |
| Status | All shown | Hides sessions by `SessionStatus` (InProgress, NeedsInput, Error, Completed, Untitled) |
| Archived | Hidden | Shows/hides the Done section |
| Read | All shown | Optionally shows only unread sessions |
| Agent host | All | Scopes to a specific agent host provider |

The **active session is always visible** even if it would be excluded by filters.

### Find

A built-in find widget filters the list by session title and section label. When a search pattern is entered, it bypasses workspace group capping so all matching sessions are visible. Simply opening the find widget (without typing) does not reorder the list.

### Pinning

Pinned sessions appear in a dedicated "Pinned" section at the top. The section is **only shown when it has pinned sessions** — when there are no pinned sessions the section is hidden entirely. Pin state is managed by `ISessionsListModelService` and persisted locally (not synced to providers).

The **Pinned** and **Chats** sections start **collapsed on first open** (their default collapse state is `PreserveOrCollapsed` when no saved state exists). Once the user expands or collapses either section, that choice is persisted per-section under `sessionsListControl.sectionCollapseState` and honored on subsequent loads.

### Manual Reordering (Drag & Drop)

Two things can be reordered by dragging: **sessions** (within a section/group) and **top-level headers** (user groups and workspace sections). An insertion line is shown between rows/headers while dragging.

#### Reordering sessions

Regular sessions can be reordered by dragging them up or down within the list. Pinned sessions can be reordered within the Pinned section.

- **Storage** — reordering stores a synthetic numeric *sort key* per session in `ISessionsListModelService` (persisted locally, not synced). It is used **only** for sorting; the provider's real `createdAt`/`updatedAt` are never modified. A separate override map is kept for each sort mode (Created vs Updated).
- **Sort key** — on drop, the new key is the midpoint between the effective keys of the sessions immediately above and below the drop point. Dropping above the first session uses the current time (so it sorts to the top). Dropping below the last session steps below the last key.
- **Dropping the fake value** — if a session's natural timestamp already sorts it into the dropped slot (e.g. after dragging it down and back), the stored override is removed so the list falls back to natural ordering.
- **Grouping by Date** — the regular list is one continuous sequence, so dragging can move a session across date buckets (e.g. to the top makes it "Recent").
- **Grouping by Workspace** — reordering is restricted to within the same workspace group; drops onto another workspace are rejected.
- **Pinned** — dropping a non-archived session on the Pinned header pins it and lets it sort naturally. Dropping it on a pinned session shows an insertion line, pins it, and stores the sort key needed to place it at that location.
- **User groups** — dropping a non-archived session on a group header adds or moves it into the group and lets it sort naturally. Dropping it on a session inside the group shows an insertion line for the exact slot and highlights only the group header to indicate the receiving group.
- **Scope** — archived (Done) sessions do not reorder or move into groups. Drops onto the Done section, unsupported section headers, and "show more" rows are rejected.
- **Multi-selection** — dragging multiple selected sessions moves them as a contiguous block, preserving their relative order. The drag label reads `"N sessions"`. Dragging sessions into the sessions grid opens all of them.

#### Reordering groups and workspaces

Dragging a **group header** or a **workspace section header** over another reorderable header shows an insertion line above/below it and moves the dragged header to that slot on drop.

- **Storage** — the top-level order is owned by `ISessionSectionOrderService` (persisted locally, not synced) as a flat list of identities (`group:<id>` and `workspace:<label>`). Identities the user has never moved fall back to the list's default order, so new groups/workspaces appear in their natural place until dragged. Stale identities (deleted groups, vanished workspaces) are garbage-collected.
- **By Workspace** — groups and workspace sections share one order and can be freely intermixed. Dragging a workspace also **promotes** it so it stays visible (escapes the "+N more workspaces" capping).
- **By Date** — only group headers are draggable; they reorder within the groups block. Workspace order changes made in the other mode are preserved. The date sections are fixed and are not drop targets.
- **Invariants** — the Pinned section is always first and the Done section always last; neither (nor the date sections, nor "show more" rows) is draggable or a valid header drop target.
- **Shared order** — the relative order of groups is the same in both grouping modes, and also drives the "Add to Group" / "Move to Group" menu order.

The insertion line relies on the base list widget's `drop-target-before`/`drop-target-after` feedback (colored by `list.dropBetweenBackground`). The widget converts an "after" indicator on row *i* into a "before" indicator on row *i+1*, so hovering the bottom half of the upper row and the top half of the lower row render the exact same DOM line with no shift.

Archived sessions do not show the session group context menu actions ("Create Group", "Add to Group", "Move to Group", or "Remove from Group").

### Read / Unread

- Read/unread state is **owned by the sessions provider** and surfaced via `ISession.isRead`. Marking happens through `ISessionsManagementService.markRead` / `markUnread` / `markAllRead`, which route to the provider's `setSessionReadState`. The agent-host provider persists it via the protocol `IsRead` status bit; the Copilot Chat provider via its agent session model (`setRead`); the local chat provider via its persisted session metadata.
- Sessions start as **unread**
- A session becomes **read** when the user opens it or explicitly marks it
- A session becomes **unread** when it produces new output in the background — a turn completes, is cancelled, or errors while the session is not being viewed. Each provider detects this and marks its own session unread: the agent-host provider server-side in `agentSideEffects`, the local chat provider via its tracked session model, and the Copilot Chat provider on the `InProgress` → terminal transition. `SessionsService` only keeps the **active** session marked read.
- Legacy view-level read state (previously persisted by `SessionsListModelService` under `sessionsListControl.readSessions`) is migrated once into provider ownership by `SessionsListModelService.migrateLegacyReadState`. The migration is additive — it only ever promotes a session to read (never back to unread) — and runs once per session.
- Pin/sort state is cleaned up when a provider reports a real session removal; remote agent host disconnects hide cached sessions without reporting them as removed

### Navigation

- **Clicking a session** marks it read and calls `SessionsManagementService.openSession()`
- **Active session tracking** — the list auto-scrolls to and selects the active session via an `autorun` on `activeSession`
- **Keyboard shortcuts** — `Ctrl/Cmd+1..9` opens sessions by index; `Ctrl/Cmd+PageUp` / `Ctrl/Cmd+PageDown` navigates the visible list (`Cmd+Alt+Left` / `Cmd+Alt+Right` and `Cmd+Shift+[` / `Cmd+Shift+]` on macOS); `Ctrl+Alt+-` / `Ctrl+Alt+Shift+-` for back/forward navigation
- **Mobile** — opening a session also closes the sidebar drawer

### Mobile

On phone layout (`IsPhoneLayoutContext`):

- Session rows are taller for touch targets; inline toolbars are always visible (no hover)
- A **filter chips** row appears below the header with status toggles (Completed, In Progress, Failed) and a Sort chip
- Sort/Group options open as a **bottom sheet** instead of a menu

---

## Menu Entry Points

The sessions list defines menu IDs that contributions can target to add actions. All are exported from `sessionsList.ts` and `sessionsView.ts`.

### Session Item Menus

| Menu | Constant | Where it appears | Use for |
|------|----------|------------------|---------|
| `SessionItemToolbar` | `SessionItemToolbarMenuId` | Inline toolbar on each session row (hover on desktop, always on mobile) | Primary actions like pin, archive. Group `navigation` for icons, other groups for overflow. |
| `SessionItemContextMenu` | `SessionItemContextMenuId` | Right-click context menu on session rows | Secondary actions like rename, mark read/unread, and "Open Pull Request" (in the `navigation`/open group, gated on `sessionHasPullRequest`). Groups: `navigation`, `0_pin`, `0_read`, `1_edit`. |

### Section Header Menu

| Menu | Constant | Where it appears | Use for |
|------|----------|------------------|---------|
| `SessionSectionToolbar` | `SessionSectionToolbarMenuId` | Toolbar on section headers (Pinned, workspace groups, Done) | Section-scoped actions like "New Session for Workspace" and "Mark All as Done". The Done section restores sessions individually (or via multi-selection) rather than with a section-wide action. Section headers also show a collapsible chevron on hover/focus; the chevron uses the same ghost icon hover background token as toolbar icon buttons. |

### Group Header Menu

| Menu | Constant | Where it appears | Use for |
|------|----------|------------------|---------|
| `SessionGroupToolbar` | `SessionGroupToolbarMenuId` | Toolbar on user-created group headers | Group-scoped actions: "New Session" (opens the new-session composer and joins the started session to the group), "Rename", and "Delete Group". The "New Session" intent is recorded via `ISessionGroupsService.setPendingNewSessionGroup` and bound to the committed session when it is started; abandoning the new session clears it. |

### View Title Menus

| Menu | Constant | Where it appears | Use for |
|------|----------|------------------|---------|
| `SessionsViewPaneFilterSubMenu` | `SessionsViewFilterSubMenu` | Filter/sort dropdown in the view title bar | Sort, group, and workspace capping toggles. |
| `SessionsViewPaneFilterOptionsSubMenu` | `SessionsViewFilterOptionsSubMenu` | Nested under the filter sub-menu | Session type and status filter checkboxes. |

### Contributing an Action

Register an `Action2` and target one of the menu IDs above. Use the context keys (below) in `when` clauses to scope the action to the right sessions or sections.

```typescript
registerAction2(class MySessionAction extends Action2 {
    constructor() {
        super({
            id: 'myExtension.mySessionAction',
            title: localize2('myAction', "My Action"),
            menu: {
                id: SessionItemContextMenuId,
                group: '1_edit',
                when: ContextKeyExpr.equals('sessionType', 'my-session-type'),
            },
        });
    }
    run(accessor: ServicesAccessor, ...args: unknown[]): void {
        // action logic
    }
});
```

---

## Context Keys

Context keys available for `when` clauses when contributing to session list menus.

### Per-Session Item

| Key | Type | Description |
|-----|------|-------------|
| `sessionItem.isPinned` | boolean | Whether the session is pinned |
| `sessionIsArchived` | boolean | Whether the session is archived |
| `sessionIsRead` | boolean | Whether the session has been read |
| `sessionItem.hasBranchName` | boolean | Whether the session has a git branch name |
| `sessionType` | string | Session type ID (use to scope actions to specific providers) |
| `sessionProviderId` | string | Provider ID |
| `sessionHasPullRequest` | boolean | Whether the session is associated with a GitHub pull request |

### Per-Section

| Key | Type | Description |
|-----|------|-------------|
| `sessionSection.type` | string | `'pinned'`, `'quickchats'`, `'archived'`, `'workspace:<label>'`, `'recent'`, etc. |

### View-Level

| Key | Type | Description |
|-----|------|-------------|
| `sessionsViewPane.grouping` | string | Current grouping mode (`'workspace'` or `'date'`) |
| `sessionsViewPane.sorting` | string | Current sorting mode (`'created'` or `'updated'`) |
| `sessionsViewPane.workspaceGroupCapped` | boolean | Whether workspace sections and user groups are capped or fully expanded |
