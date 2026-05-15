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
| `contrib/sessions/browser/views/sessionsListModelService.ts` | `ISessionsListModelService` — pin/read state (UI-only, not synced to providers) |
| `contrib/sessions/browser/views/sessionsViewActions.ts` | All registered actions (sort, group, filter, pin, archive, rename, navigate) |

---

## Features

### Session Row

Each session row displays:

- **Status icon** — animated indicator for InProgress / NeedsInput / Error / Completed / Unread
- **Title** — the session's display title (observable)
- **Workspace badge** — folder/worktree/cloud icon + label (hidden when redundant with section header)
- **Diff stats** — `+insertions −deletions` when the session has pending changes
- **Status description or timestamp** — InProgress/NeedsInput/Error show a status message; otherwise a relative timestamp
- **Approval row** (optional) — pending agent approvals with an "Allow" button

### Grouping

Sessions are organized into sections with fixed priority:

```
1. Pinned        ← always first
2. Regular       ← grouped by workspace or date
3. Done/Archived ← always last
```

Two grouping modes (user-switchable):

- **By Workspace** (default) — one section per workspace label, sorted alphabetically. "Unknown" workspace sorts last.
- **By Date** — sections: Today, Yesterday, Last 7 Days, Older.

Archived sessions always go to the "Done" section regardless of grouping mode. Archive wins over pin — an archived session is never shown in Pinned.

### Sorting

- **By Created** (default) — `createdAt` descending
- **By Updated** — `updatedAt` descending

### Workspace Group Capping

When grouping by workspace, the list shows only **primary** workspace sections by default:

- A workspace qualifies as primary if it has recent activity (last 4 days), matches the open window's folder, or contains the most recently updated session
- Remaining workspaces collapse behind a "Show N more" toggle
- Within each workspace, sessions beyond 5 also show a "Show more" toggle
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

A built-in find widget filters the list by session title and section label. When active, it bypasses workspace group capping so all matching sessions are visible.

### Pinning

Pinned sessions appear in a dedicated "Pinned" section at the top. Pin state is managed by `ISessionsListModelService` and persisted locally (not synced to providers).

### Read / Unread

- Sessions start as **unread**
- A session becomes **read** when the user opens it or explicitly marks it
- A session becomes **unread** when it completes in the background (transitions from InProgress to a terminal status while not active)

### Navigation

- **Clicking a session** marks it read and calls `SessionsManagementService.openSession()`
- **Active session tracking** — the list auto-scrolls to and selects the active session via an `autorun` on `activeSession`
- **Keyboard shortcuts** — `Ctrl/Cmd+1..9` opens sessions by index; `Ctrl+Alt+-` / `Ctrl+Alt+Shift+-` for back/forward navigation
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
| `SessionItemContextMenu` | `SessionItemContextMenuId` | Right-click context menu on session rows | Secondary actions like rename, mark read/unread. Groups: `0_pin`, `0_read`, `1_edit`. |

### Section Header Menu

| Menu | Constant | Where it appears | Use for |
|------|----------|------------------|---------|
| `SessionSectionToolbar` | `SessionSectionToolbarMenuId` | Toolbar on section headers (Pinned, workspace groups, Done) | Section-scoped actions like "New Session for Workspace", "Archive All", "Restore All". |

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
                when: ContextKeyExpr.equals('chatSessionType', 'my-session-type'),
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
| `sessionItem.isArchived` | boolean | Whether the session is archived |
| `sessionItem.isRead` | boolean | Whether the session has been read |
| `sessionItem.hasBranchName` | boolean | Whether the session has a git branch name |
| `chatSessionType` | string | Session type ID (use to scope actions to specific providers) |
| `ChatSessionProviderIdContext` | string | Provider ID |

### Per-Section

| Key | Type | Description |
|-----|------|-------------|
| `sessionSection.type` | string | `'pinned'`, `'archived'`, `'workspace:<label>'`, `'today'`, etc. |

### View-Level

| Key | Type | Description |
|-----|------|-------------|
| `sessionsViewPane.grouping` | string | Current grouping mode (`'workspace'` or `'date'`) |
| `sessionsViewPane.sorting` | string | Current sorting mode (`'created'` or `'updated'`) |
