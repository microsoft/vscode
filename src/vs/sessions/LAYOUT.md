# Agents Window Layout

This document describes the layout structure and concepts for the Agents Window workbench.

---

## 1. Overview

The Agents Window workbench (`Workbench` in `sessions/browser/workbench.ts`) provides a simplified, fixed layout optimized for agent session workflows. Unlike the default VS Code workbench, this layout:

- Does **not** support settings-based customization
- Has **fixed** part positions
- Excludes several standard workbench parts (activity bar, status bar, banner)

---

## 2. Layout Structure

```
┌────────────────────────────────────────────────────────────────────────────┐
│                                  Titlebar                                    │
├─────────┬───────────────────────────┬───────────────┬───────────────────────┤
│         │       Sessions Part       │ Editor (hid.) │     Auxiliary Bar     │
│ Sidebar ├───────────────────────────┴───────────────┴───────────────────────┤
│         │                              Panel                                 │
└─────────┴────────────────────────────────────────────────────────────────────┘
```

The **Sessions Part** is the primary content surface. It hosts an internal grid of one or more **Session Views** (left-to-right) — see [§4 Sessions Part](#4-sessions-part) for the visibility model.

Editors open as modal overlays via `ModalEditorPart`. The main editor part exists in the workbench grid but is hidden by default.

### 2.1 Parts

| Part | Position | Default Visibility | Purpose |
|------|----------|-------------------|---------|
| Titlebar | Top, full width | Always visible | Session picker, toggle actions, account widget |
| Sidebar | Left, below titlebar | Visible | Sessions list |
| Sessions Part | Center of right section | Visible | Grid of one or more session views (each rendering the active chat of its session) |
| Custom View Grid | Same row as the Sessions Part | Hidden | Grid of custom views shown *instead of* the Sessions Part — see [§2.4](#24-custom-view-grid) |
| Editor | In grid, beside Sessions Part | Hidden | Shown for explicit editor workflows |
| Auxiliary Bar | Right side | Visible | Changes view, file tree |
| Panel | Below Sessions Part + Aux Bar | Hidden | Terminal, debug output |

The Panel and Auxiliary Bar tab strips inherit the shared Modern UI pane-tab presentation from `workbench/contrib/styleOverrides/browser/media/tabs.css` through the workbench root's `modern-ui-tabs` class. Sessions-owned styles define only the part surface and inset; action geometry, active/hover/focus states, and badge placement remain owned by the shared pane-tab stylesheet so the Editor and Agents windows stay aligned.

### 2.2 Grid Tree

```
Orientation: VERTICAL (root)
├── Titlebar (leaf, full window width)
└── Content Section (HORIZONTAL)
    ├── Sidebar (leaf, 300px default)
    └── Right Section (VERTICAL)
        ├── Top Right (HORIZONTAL)
        │   ├── Sessions Part (leaf, remaining width)
        │   ├── Editor (leaf, hidden by default)
        │   ├── Auxiliary Bar (leaf, 340px default)
        │   └── Custom View Grid (leaf, hidden by default)
        └── Panel (leaf, 300px default, hidden)
```

The titlebar spans the full window width at the root level. Below it, a content section holds the sidebar (left) and the right section. The Sessions Part itself contains an **internal** horizontal grid (one leaf per visible session) — that grid is private to the part and is not part of the workbench grid above.

The **Sessions Part is the flexible ("remaining width") view** in the top-right row: it has `LayoutPriority.High` so it absorbs auxiliary bar / editor visibility changes and window resizes. The editor and auxiliary bar keep their user-set widths (`LayoutPriority.Normal` / `Low`). Making the editor the high-priority view caused its width to drift to its 300px minimum when the auxiliary bar was toggled across session switches.

The Sessions Part-to-Editor gap, the gap above the bottom Panel, and the outer right and bottom gutters share `AGENTS_FLOATING_PANEL_GAP` in TypeScript layout and its registered CSS token, `--vscode-agents-layout-floatingPanelGap`. Keeping the outer gutters on the same spacing tier prevents the shell edge from looking more inset than the gaps between parts. Their grid sashes keep the split boundaries unchanged, but expand and shift their hit areas to fill those visual gaps exactly. Each shows the standard persistent three-dot gripper at rest and yields to the full sash highlight while hovered or dragged. The Auxiliary Bar's leading padding and part-internal sashes retain their independent geometry.

When either the Sessions Part or Editor has been resized to its minimum width, activating that part by pointer or keyboard focus restores it to the available width by resizing its sibling to minimum width. This mirrors minimized editor-group activation while targeting only the Sessions/Editor pair, so the Sidebar and Auxiliary Bar retain their established widths. In single-pane layout the Editor grid node's effective minimum includes the visible docked Auxiliary Bar width, preventing activation from collapsing Details.

Editor-content overlays must use the editor pane container rather than the editor-group root. In the single-pane layout, the group spans both the editor and the docked detail panel while the pane container is inset to the editor's actual bounds; anchoring feedback controls such as the Submit toolbar to the group would place them over the detail panel.

### 2.3 Layout Priority Model

The workbench grid is built with `proportionalLayout: false` (see `createWorkbenchLayout()` in [browser/workbench.ts](src/vs/sessions/browser/workbench.ts)). In this mode the split views do **not** distribute resize deltas proportionally — instead each delta (window resize, or a part being shown/hidden) is absorbed by the highest-`LayoutPriority` view, while the others keep their established sizes. Each part therefore declares an explicit `priority`:

The single-pane layout preserves the established Sessions/Editor ratio when the outer container dimensions change and the actual Editor area is visible, after the non-proportional grid has laid out its fixed Sidebar and panel. This keeps the two primary horizontal surfaces balanced without allowing the Sidebar or docked Details width to drift; minimum-width constraints still take precedence when the available width is insufficient.

The shared editor grid node is also visible in Details-only layouts because it hosts the docked Auxiliary Bar. Grid-node visibility must not be treated as Editor visibility when deciding whether to preserve the Sessions/Editor ratio, or a container resize will incorrectly resize the user's Details width.

Sidebar visibility is intentionally excluded from that proportional adjustment. The Sessions Part is the high-priority view, so collapsing the Sessions list gives all freed width to the Sessions Part while the Editor and docked Details retain their user-set widths; showing the list takes that width back from Sessions.

| Part | `LayoutPriority` | Width behaviour |
|------|------------------|-----------------|
| Sidebar | `Low` | Fixed user-set width; never absorbs deltas. `minimumWidth` 170 (270 web), `maximumWidth` ∞, snaps closed below the minimum. |
| Sessions Part | **`High`** | Absorbs horizontal deltas in the non-proportional grid. In single-pane, an outer-container resize is post-adjusted to preserve its ratio with a visible Editor. `minimumWidth` 300, `maximumWidth` ∞. |
| Editor | `Normal` | Normally keeps its user-set width (`600` default) and responds to its sash. In single-pane, an outer-container resize also adjusts it proportionally while the actual Editor area is visible. |
| Auxiliary Bar | `Low` | Keeps its user-set width (`340` default); only resized via its own sash. |
| Custom View Grid | **`High`** | Claims the whole row. Never visible at the same time as the Sessions Part, so the "exactly one `High` view" invariant below still holds. |

In the single-pane detail-panel layout, first-run sidebar width is slightly narrower (280px) so a typical window keeps roughly balanced chat and third-pane widths when the pane is shown. Persisted `_savedPartSizes` always win over these defaults.

**Invariant — exactly one `High` view in the horizontal chain.** A grid branch derives its priority from its children (`BranchNode.priority` in [base/browser/ui/grid/gridview.ts](src/vs/base/browser/ui/grid/gridview.ts)): `High` if any child is `High`, else `Low` if any child is `Low`, else `Normal`. The Top Right row contains a `Low` auxiliary bar, so unless the Sessions Part is `High` the whole Right Section derives to `Low`. The Content Section would then be `Sidebar (Low) | Right Section (Low)` — two equal-priority views — and with no high-priority absorber the resize delta spreads across **both**, growing the sidebar toward half the window. The Sessions Part being `High` is what lifts the Right Section to `High` so it (not the sidebar) absorbs the delta.

> **Pitfall:** the `High` role must live on the Sessions Part, not the editor. It was previously on the editor, but that made the editor drift to its 300px minimum when the auxiliary bar was toggled across session switches. When moving the role, set the Sessions Part to `High` **and** the editor to `Normal` together — removing `High` from the editor without adding it to the Sessions Part leaves the chain with no `High` view and reintroduces the growing-sidebar bug.

### 2.4 Custom View Grid

The Custom View Grid (`CustomViewGridPart` in [browser/parts/customViewGridPart.ts](src/vs/sessions/browser/parts/customViewGridPart.ts)) hosts full-surface views that replace the sessions grid — for example a management or dashboard surface that is not tied to a single session.

**Contract — it is mutually exclusive with the sessions surface.** While a custom view is shown, the Sessions Part, the Editor part *in the grid*, the Auxiliary Bar (side panel) and the Panel (terminal) are all hidden, and vice versa. Only the titlebar and the primary sidebar remain. The *modal* editor part is not affected and may still open over the custom view.

Which view is shown is owned by `ICustomViewService` ([services/customView/browser/customViewService.ts](src/vs/sessions/services/customView/browser/customViewService.ts)): contributions register an `ICustomViewDescriptor` (id, title, view constructor and optional header actions) and call `showCustomView(id)` / `hideCustomView()`. The workbench observes `activeCustomView` and applies the layout; it is not persisted, so a reload always starts on the sessions grid.

**Desired vs. effective visibility.** The covered parts keep their *desired* visibility in `partVisibility` — showing a custom view only changes what the grid renders (`Workbench._effectiveVisible`). So a layout-controller change made while the custom view is shown (e.g. the user opened a different session in the background) is what gets restored when it is hidden, and `_savePartVisibility` never records the forced-hidden state. `IWorkbenchLayoutService.isVisible` reports the effective value and `onDidChangePartVisibility` fires for the parts whose effective visibility flips, so context keys stay truthful; the layout controller's per-session capture listeners skip those transitions (`_isCustomViewVisible`).

> **Pitfall:** `SplitView` calls `Part.setVisible` when a view's grid visibility changes, and the workbench maps that event straight back onto the desired visibility (`setSessionsHidden`, `setPanelHidden`, …). The custom view's grid updates therefore run under `_applyingCustomViewGridVisibility`, which makes that listener bail — without it, hiding the parts for a custom view *overwrites* the state that is supposed to be restored, and hiding the custom view leaves neither grid visible. For the same reason, showing a custom view first exits a maximized editor (a maximized editor owns the row instead of the sessions grid) and the grid descriptor is built from the effective values.

**Dismissal.** Opening a session (`SessionsService._startOpenSession`, which every explicit open gesture funnels through) hides the custom view. On phone layouts showing one pushes a `MobileNavigationStack` layer, so the Android back button dismisses it. Actions that operate on the hidden parts — Toggle Side Panel, Toggle Panel, and the secondary side bar toggle — are disabled while it is shown (`CustomViewVisibleContext`).

**Chrome.** Each grid leaf is a `CustomViewNode` ([browser/parts/customViewNode.ts](src/vs/sessions/browser/parts/customViewNode.ts)) that owns the shared header — title, optional description and the contributed actions rendered either as an icon toolbar or a button bar — above a scroll container. The header always has a bottom divider, independent of the content's scroll position. The header band and the content are centred and capped to `AGENTS_CENTERED_CONTENT_MAX_WIDTH` (the same measure the session views use); a view may override it with `AbstractCustomView.maxWidth`. Views only fill the content container and are disposed when hidden. On phone-class viewports `CustomViewGridParts` selects `MobileCustomViewGridPart` instead, mirroring `SessionsParts`/`MobileSessionsPart`.

> **Pitfall:** a custom view that implements `focus()` with its own focus target must not also show the host content's fallback outline. The Automations view suppresses that redundant outer outline while its cards and controls retain their keyboard focus indicators; otherwise clicking the content edge paints a focus ring around the entire view.

**Card chrome is shared.** The Sessions Part and the Custom View Grid both carry the `agents-part-card` class (`AGENTS_PART_CARD_CLASS`) and use `agentsPartCard.ts` for their metrics, themed colors and content-box math, so their padding, margins, background, border and corner radius are defined once and are identical.

---

## 3. Titlebar

The titlebar is a standalone implementation (`TitlebarPart`) — not extending `BrowserTitlebarPart`. It has three menu-driven sections:

| Section | Menu ID | Content |
|---------|---------|---------|
| Left | `Menus.TitleBarLeftLayout` | Toggle sidebar, new session (when sidebar hidden, A/B experiment), agent host filter |
| Center | `Menus.CommandCenter` | Session picker widget |
| Right | `Menus.TitleBarSessionMenu`, `Menus.TitleBarRightLayout`, `Menus.TitleBarUpdate` | Active-session actions (including Create Pull Request for created sessions with changes), remote connections, run script (split button), Open in VS Code, bottom-panel and auxiliary-bar layout toggles, account widget, and the rightmost Update indicator |

No menubar or `WindowTitle` dependency. Editor-specific actions remain in the editor header, while session-level actions are placed on the right of the title bar.

The Update indicator occupies its own trailing toolbar immediately before native window controls. At constrained widths, the titlebar measures each of its three sections so content that overflows inside the center grid cannot collide with the right controls. Optional toolbars yield as complete groups: center-adjacent actions and navigation first, then global layout/account actions, active-session actions, and finally Update. The session picker, left toolbar, and native window controls remain stable.

The account widget shows overlapping provider identities only for accounts that are currently verified as signed in. Its panel keeps provider and status groups in a stable order: Copilot, ChatGPT (or its sign-in action), then contributed account status such as Codebase Semantic Index, with dividers between groups. Subscription usage uses a two-row metric layout with the plan and percentage first, followed by reset timing and the usage label.

### Session Picker (Center)

The center section shows a clickable session picker widget. When a session is active it renders:
- **Provider icon** — the session type icon (e.g. Copilot CLI, Cloud)
- **Session title** — the AI-generated or user-assigned session title
- **Workspace name** — the repository or folder name
- **Branch / worktree** — the active git branch or worktree name in parentheses
- **Changes summary** — `+insertions -deletions` when the session has pending changes

When no session is active (new chat view) the widget hides its chrome so the center is empty. Clicking opens the session switcher quick pick.

When the primary side bar is hidden and at least one session is **blocked** the widget instead switches to a **requires-input** state (see [Blocked Sessions](#blocked-sessions-center) below).

After the user approves a pending action on a session from the sessions list (e.g. the **Allow** button on an approval row), the widget briefly shows a green "Approved N sessions" confirmation. Each approval within the rolling 3s window increments the count and restarts the countdown; while visible it takes precedence over the requires-input state. Driven by `ISessionActionFeedbackService` (`contrib/sessions`), whose `approvedCount` observable the widget reads.

In the single-pane layout, activating the session header **Changes** pill is treated as an explicit
editor open: it reveals the docked editor area and opens the Changes multi-diff editor even though
managed Changes tab activations remain excluded from automatic reveal.

Editor breadcrumbs omit the workspace-root segment when the Agents Window has one workspace folder.
The active session already establishes the repository/worktree context, so breadcrumbs start at the
first path segment within the workspace (for example, `src > services > session.ts`) instead of
repeating the synthetic `repository (branch)` workspace-folder label. With multiple workspace
folders, breadcrumbs retain the root segment for disambiguation but show only its plain folder name,
without the synthetic branch suffix. The Files view retains the full root labels.

Workspace-folder presentation is owned by `IWorkspaceFolderLabelService`. The standard workbench
implementation provides no override, leaving the existing URI-derived breadcrumb label unchanged;
the Agents implementation resolves the repository display name from session metadata, returning the
plain repository name for breadcrumbs and the verbose `repository (branch)` form used by workspace
projection and the Files view.

### Agent Host Filter (Left)

When multiple remote agent hosts are known, a dropdown pill in the left toolbar scopes the workbench to a specific host. When no hosts are known the pill acts as a re-discover trigger.

### Blocked Sessions (Center)

When at least one session is **blocked**, the center session picker widget (`SessionsTitleBarWidget`) switches from the active-session pill to a light orange "N sessions require input" state (orange label with a subtle background and border), and blinks gently twice whenever a newly blocked occurrence appears. A session counts as blocked when it needs input, or - while not in progress - has failing CI checks. Pull request comments do not make a session blocked. Raw detection is owned by the `BlockedSessions` model (`contrib/blockedSessions`), which reuses the shared, background-polled GitHub CI models and identifies CI occurrences by commit. The widget refines this into what the title bar surfaces via the `BlockedSessionsIndicatorModel` (`blockedSessionsIndicatorModel.ts`) it instantiates: it acknowledges the current occurrence when the user views the session or explicitly ignores it, applies optimistic approval dismissals, classifies the homogeneous requires-input reason (for the specific message), builds the pill label, and decides when the attention blink plays. Acknowledgement lasts only for that input request or CI failure; a later approval, a new failing commit, or an unblock-to-block transition surfaces the session again. Clicking the widget opens those sessions rendered exactly like the sessions list but flat - no sections, groups or workspace headers - via the reusable `SessionsFlatList` (exported from `sessionsList.ts`) in a dropdown anchored below the command center box using `IContextViewService`; clicking a row opens the session like the main list. Its header toolbar offers **Show All Sessions**, **Ignore All Input Needed**, and a trailing **Close** action whose hover shows the `Escape` keybinding. Its rows use `Menus.BlockedSessionsItem` instead of the main session-item toolbar menu and contribute **Ignore Input Needed** / **Ignore CI Failure** actions with the same bell-slash icon. When no session is blocked, the widget behaves as the normal active-session pill. Whether the widget enters this state is driven by the `BlockedSessionsIndicatorModel`'s `blockedSessions` observable.

Approval acknowledgement must use the pending tool call's stable id, not the approval model's load-time timestamp. Opening the new-session view can dispose and later reload the chat model; a timestamp-based id would make the same approval appear blocked again after that reload.

### Account Widget (Right)

Shows the signed-in GitHub profile image (falls back to the account codicon). Clicking opens a combined account and Copilot status panel with sign-in/sign-out and settings actions.

### Remote Connections (Right)

The remote connections toggle is a global titlebar action (`Menus.TitleBarRightLayout`) rather than a per-chat input action. This keeps tunnel hosting state visually scoped to the Agents window as a whole, so users do not interpret it as a setting that must be enabled separately for each chat session.

This Agents-window placement is intentionally different from the main editor window: outside the Agents window the same toggle remains in `MenuId.ChatInputSecondary` for agent-host chat inputs. Keep both menu items mutually exclusive with `IsSessionsWindowContext` so the editor window keeps its chat-input affordance while the Agents window shows only the titlebar affordance.

---

## 4. Sessions Part

The Sessions Part (`SessionsPart` in [browser/parts/sessionsPart.ts](src/vs/sessions/browser/parts/sessionsPart.ts)) is the central content surface of the Agents window. It does **not** render a chat directly — instead it owns an internal `SerializableGrid` of one or more **session views**.

### 4.1 Session View

A `SessionView` ([browser/parts/sessionView.ts](src/vs/sessions/browser/parts/sessionView.ts)) is a single leaf in the Sessions Part's internal grid. It hosts:

- A **session header** at the top ([browser/parts/sessionHeader.ts](src/vs/sessions/browser/parts/sessionHeader.ts)) — the session status icon + title, a meta row (the contributed workspace folder / changes / pull request buttons), and the session toolbars (Run, Open in VS Code, New Chat). The status icon ([browser/sessionStatusIcon.ts](src/vs/sessions/browser/sessionStatusIcon.ts)) shows the live spinner/status glyph for in-progress / needs-input / error states; in terminal/default states the title shows the read/unread **dot indicator** (filled link-colored dot when unread, small muted dot when read) — neither the session type icon nor the PR icon is shown in the title, since the pull request is surfaced in the meta row instead. (The status icon's `completedStateIcon` argument is generic: the header passes nothing so it falls back to the dot indicator, while the sessions list still passes the PR icon.) The meta row hosts a generic `Menus.SessionHeaderMeta` toolbar that any feature can contribute actions into; by default each contributed action renders as a consistent compact secondary `Button` with an inline `icon title` label via `SessionHeaderMetaActionViewItem` ([browser/parts/sessionHeaderMetaActionViewItem.ts](src/vs/sessions/browser/parts/sessionHeaderMetaActionViewItem.ts)) unless it registers its own action view item (spacing between the pills comes from the meta row's `gap`, no separator dot). The files view contributes the workspace folder pill (order -10, so it leads the row, gated by the per-view `SessionHasWorkspaceContext` key which `SessionView` sets when the session has a workspace label, with a custom action view item that extends `SessionHeaderMetaActionViewItem` to render the workspace icon — cloud / folder / worktree per workspace kind, where a session whose isolated worktree is still being created (`ISession.worktreePending`) already shows the worktree icon — plus the workspace label, and a hover showing the working-directory path and git branch (replaced by a "Creating worktree…" note while the worktree is pending, since the reported folder and branch are still those of the checkout the session was started from), registered from `contrib/files/browser/workspaceFolderActions.ts`) that, when activated, opens the Files view. The changes view contributes the diff stats as a clickable menu item (order 0, gated by the per-view `SessionHasChangesContext` key, which `SessionView` sets from the session's **Branch Changes** changeset, with a custom action view item that extends `SessionHeaderMetaActionViewItem` to render the diff-multiple icon, a `{n} files` label, and the live `+insertions -deletions` counts, registered via `IActionViewItemService` from `contrib/changes/browser/changesActions.ts`) that, when activated, opens the multi-file diff editor for the session. The pill always reflects the **Branch Changes** changeset (the branch-vs-base diff) — located in `IActiveSession.changesets` by the shared `BRANCH_CHANGES_CHANGESET_ID` (`services/sessions/common/session.ts`), falling back to `IActiveSession.changes` when absent — so it is independent of whichever changeset the Changes view currently has selected. While a session's isolated worktree is still being created (`ISession.worktreePending`) the key stays `false`, so the checkout's own changes are never attributed to the session. The GitHub contribution similarly contributes a pull request button (order 1, so it follows the changes button, gated by the per-view `SessionHasPullRequestContext` key, registered from `contrib/github/browser/pullRequestActions.ts`): one pull request renders its live icon + `#<number>`, opens that pull request on activation, and shows the repository/date/title/description/branch hover; several render the first (most recent) pull request's live icon + `<n> Pull Requests` and open a sticky, keyboard-accessible picker listing each pull request's live state icon, number, and truncated title. The first pull request remains the active projection used by the sessions list, CI/review actions, and context menus, while the header alone keeps the retained history's PR, CI, and review models live for its picker. The same contribution adds an issue button (order 2, so it follows the pull request button) for the GitHub issues the session's user messages referenced (gated by the per-view `SessionHasIssuesContext` key, registered from `contrib/github/browser/issueActions.ts`): a single issue renders as `#<number>` and hovers to the issue title/description, while several render as `<n> issues` and open a sticky picker listing each issue on click; the leading icon reflects the aggregate live issue state (open green, closed-as-completed purple, closed as not planned/duplicate muted). Visible once the bound session is created. It is also the drag handle for the session. Right-clicking the header opens `Menus.SessionHeaderContext`, which surfaces pin view / close (`1_view`), rename (`2_edit`), and mark read / unread (`3_read`). The built-in rename action is registered from `contrib/sessions/browser/sessionsActions.ts` and uses `ISessionsPartService` to find the matching `SessionView`, which delegates to the header's inline rename control.
- A **chat composite bar** below the header ([browser/parts/chatCompositeBar.ts](src/vs/sessions/browser/parts/chatCompositeBar.ts)) — the chat tab strip. Visibility tracks the number of **visible tabs** (`IActiveSession.visibleChatTabs`): it is shown only when the session has **more than one chat actually showing as a tab**, and always hidden when there is just one visible tab — even if other chats are **closed**, the single chat's **title diverged** from the session title, or the session has unopened subagents. User-created peer chats, including `/btw` side chats, participate in this ordinary tab model; tool-origin subagents stay hidden until explicitly opened. This rule is a single shared observable `IActiveSession.shouldShowChatTabs` ([services/sessions/browser/visibleSessions.ts](src/vs/sessions/services/sessions/browser/visibleSessions.ts)), read by both the composite bar and the `SessionShouldShowChatTabsContext` context key. The strip's own trailing **New Chat** action follows this visibility. The header's **New Chat** action is shown while the tab strip is hidden (a single visible tab); once the strip is shown the strip's trailing **New Chat** action offers it instead. The **Chats** (Conversations) menu is always rendered in the session header **meta row**, at the end of the pills (`Menus.SessionHeaderMeta`, order 100), independent of the tab strip's visibility — it appears once the session has more than one **committed (non-draft)** chat, or when the active chat has subagents. It renders as the meta toolbar's default submenu **icon** (the comment-discussion glyph), and clicking it opens the submenu as a dropdown. While the tab strip is shown the chat tabs are keyboard-navigable from the active session: `Ctrl/Cmd+Shift+]` / `Ctrl/Cmd+Shift+[` go to the next / previous chat (wrapping), `Ctrl/Cmd+W` closes the active chat tab (deleting an in-composer draft, hiding a committed chat) instead of the session — the same command (`sessions.chatCompositeBar.closeChat`) is contributed to the per-tab `Menus.SessionChatTab`, which the chat tab strip renders as each non-main tab's close button (forwarding the tab's chat as the action argument), and `Ctrl+Tab` / `Ctrl+Shift+Tab` open a **chat switcher** — a no-input, editor-switcher (MRU) quick pick over the session's **open** chats (skipping in-composer drafts), each shown with a chat icon (hold the modifier, press `Tab` to cycle, release to select), winning over the session-history secondary on that chord while the session has multiple open chats and falling back to session navigation otherwise (and to the editor's own `Ctrl+Tab` switcher while a quick pick is already open, since the open chords are gated on `inQuickOpen` negated); the **Go to Chat in Session** palette command (`sessions.showChatsPicker`, `Ctrl/Cmd+Shift+O`, gated on more than one committed chat) opens a **searchable** variant that additionally lists **Closed** chats in a separate group (selecting one reopens it) — these commands (`sessions.chatCompositeBar.navigateNextChat` / `navigatePreviousChat` / `closeChat` and `sessions.showChatsPicker` in `contrib/sessions/browser/sessionsActions.ts`) outrank the session-level navigation/close chords via a higher keybinding weight. Chat-to-chat navigation (next/previous chat and the `Ctrl+Tab` switcher) is gated on `SessionHasMultipleOpenChatsContext` (more than one **open** tab) — distinct from the broader `SessionShouldShowChatTabsContext` that drives strip visibility — so it stays a no-op when only a single open chat remains (e.g. one open + one closed chat); `closeChat` is gated on `SessionActiveChatIsClosableContext`, and the searchable palette command on `SessionHasMultipleCommittedChatsContext`.

- A **chat view** below the bars, swapped in/out based on session state.
- A floating toolbar overlay ([browser/parts/sessionHeader.ts](src/vs/sessions/browser/parts/sessionHeader.ts), `SessionViewFloatingToolbar`) shown for not-yet-created sessions in place of the header.

**Composer clipping.** Monaco measures its host from `clientWidth`, which includes padding. The new-session editor therefore expresses its horizontal inset with margin so its scrollable element remains inside the clipped input surface; the running-session editor's rounded working-state clip extends through the input's trailing padding so the full scrollbar remains visible.

The header and the composite bar are deliberately separate widgets: the header represents the session identity/actions and is always present, while the tab strip is a per-chat navigation concern that appears (and then stays, per the sticky rule above) once a session has multiple chats or a diverged default-chat title. They share visual tokens via `applySessionBarThemeColors` ([browser/parts/sessionBarStyles.ts](src/vs/sessions/browser/parts/sessionBarStyles.ts)) and stylesheet ([browser/parts/media/chatCompositeBar.css](src/vs/sessions/browser/parts/media/chatCompositeBar.css)). Because the Agents workbench is always modern, `chatCompositeBar.css` directly applies the modern editor-tab geometry while consuming the shared modern-tab state color tokens from [workbench/contrib/styleOverrides/browser/media/tabs.css](src/vs/workbench/contrib/styleOverrides/browser/media/tabs.css). Every selector is scoped through `.session-chat-tabs-bar` and chat-specific classes; the shared editor stylesheet remains unchanged. `SessionView` sums each widget's reported height to lay out the chat view below them. The header and tab strip are centered and capped to 990px via their own CSS classes (`.chat-composite-bar.session-header-bar` / `.chat-composite-bar.session-chat-tabs-bar` in [chatCompositeBar.css](src/vs/sessions/browser/parts/media/chatCompositeBar.css)). The chat view itself is still laid out at full session width so its scrollable viewport (and scrollbar) stays flush to the far-right edge; only the inner chat content (message/input cards, via `.interactive-item-container`, capped to 950px in [browser/media/style.css](src/vs/sessions/browser/media/style.css)) is width-constrained and centered via CSS. The scroll-to-bottom button follows the trailing edge of this centered content column rather than the full-width viewport edge. Each constrained message row is also the positioning context for request overlays such as steering-message actions, keeping those controls anchored to the message instead of the full-width scroll viewport.

**Pitfall:** absolute request overlays must not remain positioned against the full-width `.interactive-session` after message rows are independently constrained. Make the constrained row their positioning context or hover actions drift into the viewport gutter. Request rows must also override the tree's `.monaco-tl-contents { overflow: hidden; }`, otherwise controls positioned above the request are clipped at the row boundary.

**Pitfall:** don't cap the chat viewport width in `SessionView` layout when you need edge-aligned scrollbars. Keep the viewport full-width and center only the inner chat content so alignment and scroll ergonomics both hold.

**Pitfall:** Agents chat styles shared by session views and editor-hosted chats must provide a fallback when they reference SessionView-scoped CSS variables. Editor-hosted chats live outside the SessionView subtree, so an unresolved variable invalidates the entire declaration.

**Pitfall:** Changed-file rows must share left-aligned insertion and deletion column widths derived from the current list, with tabular numerals, so every `+` and `-` starts on the same vertical line. Apply the measured widths directly to rendered count spans rather than introducing unregistered CSS variables; keep the labels on the compact edit-session type role and spacing, since bold weights or per-value padding make the row stats too heavy.

**Pitfall:** a meta-row action view item that renders a `Button` (`.monaco-text-button`) cannot color a codicon glyph via a normal inline `style.color`, because `button.css` forces `.monaco-text-button .codicon { color: inherit !important }`. To give a meta icon its own theme color (e.g. the PR state color), set the color inline **with `!important` priority** (`el.style.setProperty('color', value, 'important')`) — an inline `!important` declaration wins over an external author `!important` rule in the cascade.

**Pitfall:** combined codicon glyphs (e.g. `git-pull-request-done`) have a wider horizontal advance (~16px) than `*-compact` glyphs (e.g. `worktree-compact`, 12px), so even at `font-size: 12px` their layout box stays wide and pushes the following label away. Setting `font-size` alone does not fix it — clamp the icon box with explicit `width`/`height` set to `--vscode-codiconFontSize-compact` plus `justify-content: center` so the extra advance overflows harmlessly and the label sits tight against the glyph.

**Pitfall:** don't put `overflow: hidden` on the meta row. The meta buttons are secondary `Button`s whose focus ring is drawn with `outline-offset: 2px`, so it extends a few pixels outside the button. When the meta row's height equals the button height (22px) and the row clips its overflow, the ring is sheared flat at the top and bottom. Leave the row `overflow: visible` and rely on the header's `padding-bottom` and the title-row gap above to give the ring room.

The chat view inside a session view is one of three kinds (`ChatViewKind` in [browser/parts/chatView.ts](src/vs/sessions/browser/parts/chatView.ts)), selected per autorun based on the bound session:

| Kind | Used when | Concrete view |
|------|-----------|---------------|
| `'newSession'` | The bound session is `undefined` **or** the session has not been created yet | `NewChatView` (workspace / session-type picker + input) |
| `'newChatInSession'` | The session exists but the active chat has `SessionStatus.Untitled` | `NewChatView` (variant for new chat in an existing session) |
| `'chat'` | The session and active chat are both created | `ChatView` (renders `session.activeChat`) |

Concrete implementations live under `contrib/chat/` and are obtained via `IChatViewFactory` so the `browser/` layer doesn't have to import contrib code.

The `NewChatView` input uses the control-tier corner radius for its send button, so the primary action is a rounded square in both desktop and phone layouts rather than a circular control. The focus outline follows the same control-tier shape. The input toolbar owns the spacing between adjacent actions through a shared flex gap rather than button-specific margins.

`ChatView` mounts session input banners directly above the chat input. The CI failures banner uses the orange accent for the card border/icon and for the primary Fix Checks button background/border.

The shared chat input can show a transparent VS Code pet overlay above the composer. `/vscode-pet` toggles the persisted preference in active chats and the new-session composer. The state hooks for idle, sleeping, processing, confirmation, completion, and activation remain wired, but currently every state shows the same idle buddy: blue in Stable and green in Insiders/development builds. Active chats anchor the pet to the actual input row so confirmation and question widgets above it do not add spacing, while the new-session composer anchors it to its input-area wrapper. Cursor-tracked pupils render over eye-less derivative sprites so movement cannot expose the original baked-in eyes; the source PNG and GIF assets remain unchanged. Enabling makes the pet hop into place; disabling makes it duck away before its image source is unloaded. Both transitions are interruptible and skipped when reduced motion is enabled. Hovering the pet invites the user to show it some love and teases future interactions.

When a `ChatView` loads its chat model (`acquireOrLoadSession`), it surfaces progress on **its own** progress bar, pinned to the top of that grid leaf. This mirrors how each editor group owns its `ProgressBar` (see `EditorGroupView`): the bar is created by the leaf host `AbstractChatView`, wrapped in a `ScopedProgressIndicator` (reused from `vs/workbench`) with an always-active scope, and driven via `AbstractChatView.showProgressWhile(promise, delay)`. Concurrent loads in other visible sessions each show their own progress instead of competing for a single part-wide bar, and overlapping loads on the same leaf are joined by the indicator so the bar only hides once all have settled. A short delay avoids flashing the bar for fast (cached) loads.

### 4.2 Visibility Model

The set of session views in the part is driven by `ISessionsService.visibleSessions` (services — see [services/sessions/browser/sessionsService.ts](src/vs/sessions/services/sessions/browser/sessionsService.ts)), which is backed by the `VisibleSessions` model helper (see [services/sessions/browser/visibleSessions.ts](src/vs/sessions/services/sessions/browser/visibleSessions.ts)).

Key invariants:

- **Multiple visible sessions, one active.** The Sessions Part may show one or several session views side-by-side. Exactly one of them is the **active** session at any time — the one that receives keyboard focus, drives context keys, and is reflected in the titlebar / sidebar / auxiliary bar.
- **Active session is observable.** Visible and active sessions are exposed as `IObservable<readonly (IActiveSession | undefined)[]>` and `IObservable<IActiveSession | undefined>` respectively. `SessionsService` (services) owns the single reconcile autorun: it subscribes once and calls `SessionsPartService.updateVisibleSessions(visible, active)`, which forwards to `SessionsPart`. The part is a **passive renderer** — it injects neither the model nor the view.
- **One slot may be the "empty" slot.** A visible session of `undefined` represents a not-yet-created chat — its session view renders the `'newSession'` chat view (workspace picker + input). The workspace and harness pickers are capped at 400px and 200px, respectively, so long labels truncate without crowding out the other controls. At most **one** slot may be `undefined` at any time. When the user submits its first message, the placeholder transitions into a real session and the grid slot is preserved.
- **Sticky vs non-sticky.** The visibility model marks each slot as sticky (user-pinned) or non-sticky. Non-sticky slots are recycled when a new session opens; sticky slots are preserved. The empty slot is always non-sticky. This lets the user pin a session to keep it visible while still flowing through other sessions in the remaining slots.
- **Slot reuse on reconcile.** `SessionsPart.updateVisibleSessions` grows or shrinks its internal pool of `SessionView`s to match the visible count, then rebinds each surviving slot to its session by position via `SessionView.openSession(session)`. Slots are never destroyed and recreated for an existing session — only added at the right or popped from the right when the count changes.
- **Focus promotes to active.** Focus-in or pointer-down on a non-placeholder session view promotes that session to active (via `SessionsPartService.onDidFocusSession` → `ISessionsService.setActive`, which updates the active visible slot — and hence `ISessionsService.activeSession`).
- **Maximize.** When two or more non-placeholder views are visible, the active view can be maximized within the part's internal grid; the part exposes `toggleMaximizeSession(sessionId)`.
- **Restored on reload.** The visibility model is persisted to workspace storage (order, sticky state, and which slot is active, including the empty new-session slot). On startup `ISessionsService.restoreVisibleSessions()` rebuilds the grid, waiting for each session's provider to make it available and re-applying order, sticky flags, and the active session. To avoid flicker, restore waits for the active session, then lays out all sessions that are already available in one atomic transaction (`VisibleSessions.restoreGrid`) rather than showing the active session alone and reflowing as siblings load. Sessions whose provider surfaces them later are inserted into their persisted position incrementally. Once the grid has been laid out, keyboard focus is moved into the restored active session (matching the behaviour when a session is opened explicitly) so the user can start typing immediately. Focus is driven by `ISessionsService` observing its own `activeSession` (the active visible slot) rather than any model service calling into the view. The move is guarded so it never steals focus from another surface: focus is pulled into a session only when it currently rests on `<body>`/nothing (startup restore) or already within the grid (moving between leaves), so an incidental active-session change (e.g. the fallback after deleting a session from the list) does not yank focus out of the list. Deliberate opens originating elsewhere move focus via their own explicit `focusSession` call. Restore must win the race against the empty new-session slot, whose workspace picker resolves asynchronously on the same provider-registration event restore waits for and would otherwise create and activate an untitled draft. Three mechanisms guarantee restore wins: (1) `ISessionsService` and `ISessionsManagementService` are both registered **eagerly** so the restore wiring and visibility model are alive before the first paint; (2) when restore rebinds the placeholder slot to the restored session, the new-session view (and its `NewChatWidget`) is disposed, and `NewChatWidget` guards its async workspace-selection handler with `this._store.isDisposed` so a late-resolving picker cannot create a draft for a slot that has already been claimed by a restored session; (3) untitled drafts are never persisted — `restoreVisibleSessions` drops them from the snapshot (`_snapshotVisibleSessionStates`) — so a stale draft can never be restored. The restoring state is intentionally not a UI suppression flag. (Restore itself drives no part-wide progress; once a session's leaf is laid out, that leaf shows its own load progress as described above.)

### 4.3 Mobile / Phone

On phone-class viewports the Sessions Part is replaced by `MobileSessionsPart` (chosen at construction time by `SessionsPartService`). It enforces a single visible session — never a side-by-side layout — and otherwise reuses the same `SessionView` host.

---

## 5. Editor Modal

Editors open as modal overlays rather than occupying grid space. The configuration `workbench.editor.useModal: 'all'` redirects all editor opens (without an explicit preferred group) to `ModalEditorPart`.

| Trigger | Behavior |
|---------|----------|
| Editor opens (no explicit group) | Opens in modal overlay |
| All editors closed / Escape / backdrop click | Modal closes and is disposed |

When the editor part is shown in the grid (not as a modal), its title toolbar (`MenuId.EditorTitleLayout`, right of the tabs) hosts layout actions registered in `contrib/editor/browser/editor.contribution.ts`, ordered left-to-right as: open in modal editor, **maximize / restore editor area**, a single **Toggle Details** action for the auxiliary bar (labelled "Toggle Secondary Side Bar" in the non-single-pane layout), and **close editor area**. The auxiliary-bar toggle sits to the right of maximize/restore because it changes the right-hand side of the layout. It reuses the core `workbench.action.toggleAuxiliaryBar` command (already registered in the agents window by the workbench auxiliary bar part, and available in the Command Palette under **View**) surfaced through two `when`-gated menu items in `browser/layoutActions.ts` so the icon flips without rendering a checked/highlighted state: the `right-panel-show` codicon shows when the auxiliary bar is hidden (`AuxiliaryBarVisibleContext` negated, click to show) and the `right-panel-hide` codicon shows when it is visible (click to hide). In the Agents-window tab strip, the editor-actions side first shrinks down to 50px before the tab scroller starts shrinking. When tab actions are placed on the left, tabs retain trailing spacing consistent with the modern editor tab style.

The Agents workbench opts into the shared tab presentation through the tab-specific `modern-ui-tabs` root class and imports `workbench/contrib/styleOverrides/browser/media/tabs.css` directly from its editor contribution. It does not apply the broad `style-override` class, because that class also changes workbench-wide part metrics and requires the complete Modern UI module set. Editor tab DOM, interaction behavior, and presentation therefore stay aligned with the standard VS Code editor window; Sessions owns only the actions contributed to the shared tab strip. Do not copy shared editor-tab rules into a Sessions stylesheet: duplicated presentation immediately drifts when the common editor tab design changes. The shared add-tab host stretches across the tab row's actual hit-target height and remains sticky at the trailing edge so its icon stays aligned and available while tabs scroll.

Agents-only editor-type exclusions are configuration defaults: `workbench.editor.hiddenEditorTypes` defaults to hiding Markdown Preview in the Agents window. Keep these exclusions at the picker boundary rather than threading Agents-specific editor ids through editor-group APIs; normal editor windows and editor resolution remain unchanged.

When the auxiliary bar is hidden the editor becomes the rightmost card and expands into the freed space; the workbench's 10px right gutter still applies, and a `.noauxiliarybar` rule in `browser/media/style.css` restores the editor's right border and right corner radii so it keeps its card appearance.

The single-pane editor group renders its title actions from sessions-owned menus, which shadow the core `MenuId.EditorTitle`. So `editor/title` items contributed by **extensions** would otherwise be dropped. `EditorTitleMenuBridgeContribution` in `contrib/editor/browser/editor.contribution.ts` (active only when `isSinglePaneLayoutEnabled`) bridges them: it listens to `MenuRegistry.onDidChangeMenu(MenuId.EditorTitle)` and mirrors **only** the extension-contributed items into the right-side `Menus.SessionsEditorHeaderSecondary` menu. Extension `navigation` items map to the inline `extension/navigation` group; every other extension group maps to `secondary/extension/<original-group>` so it remains in `...` with its relative grouping preserved. Header actions receive the active editor's original URI as their forwarded argument, matching standard editor-title invocation. Extension items are identified two ways: command items by `item.command.source` (set by the `commands` extension point in `menusExtensionPoint.ts`), and submenu items by their `api:`-prefixed `submenu.id` (extension submenus are registered as `MenuId.for('api:<id>')` by the `submenus` extension point). Core items have neither and are not bridged (they are already dual-contributed where needed). The mirror is kept in sync (a `DisposableStore` is cleared and rebuilt on every menu change) so it tracks extensions registering/unregistering.


The Toggle Details action (Toggle Secondary Side Bar in the non-single-pane layout) collapses or restores the secondary side bar while the editor stays open. In the single-pane layout it also has a default keybinding (**`⌥⌘L`**), and maximize/restore of the editor area has a default toggle keybinding (**`⌥⌘E`**, active only while the editor area is visible); both are scoped to the main sessions window with the single-pane setting enabled. The shared **Toggle Secondary Side Bar Visibility** command (`workbench.action.toggleAuxiliaryBar`) calls the layout service's `toggleSecondarySideBar()` operation. Its checked state uses the layout service's `isSecondarySideBarVisible()` context key, which is the auxiliary bar in classic layouts and the whole docked side pane in single-pane. Classic layouts toggle and announce the auxiliary bar. In single-pane, where the auxiliary bar is docked inside the editor, `toggleSecondarySideBar()` delegates to `toggleSidePane()`, which toggles the whole docked side pane and moves focus to the sessions list after hiding a focused side pane. If the editor was maximized, the toggle exits maximized mode before collapsing and restores maximization after the complete side-pane composition is shown again. The command therefore has consistent command-palette, keybinding, and focus behavior without inspecting a concrete layout. When a session's editor working set is restored on session switch, the editor part is revealed programmatically and the session's saved auxiliary bar visibility is honored (a side bar the user hid for a session stays hidden when returning to it).

The main editor part can be explicitly revealed for workflows that target it directly.

### Single-pane redesign (experimental — `sessions.layout.singlePaneDetailPanel`, default OFF)

> See [SINGLE_PANE_SCENARIOS.md](SINGLE_PANE_SCENARIOS.md) for the full scenario/state/transition catalog and the manual validation checklist.

The entire third-pane redesign is gated behind the experimental setting `sessions.layout.singlePaneDetailPanel`, read **once at startup** (a window reload applies a change). When the setting is **off** (default) the Agents window renders exactly as documented above (auxiliary bar as its own grid column with its composite tab strip + title, the standard multi-diff Changes editor). When **on**, the third pane becomes a **single pane with one full-width editor title region**. It supports `workbench.editor.showTabs` values `multiple` and `single`; while the unsupported `none` value is configured, the Agents editor part conditionally enforces `single`. When only the docked Auxiliary Bar is visible and the editor area is hidden, it enforces `multiple` so every managed detail tab remains directly available.

- The auxiliary bar is removed from the workbench grid and **docked inside the editor part** (absolutely positioned on the right, below the editor tab strip); the grid's top-right row becomes `Sessions | Editor`, and the editor part spans the editor + detail-panel width.
- The editor group's **title region and header-hosted breadcrumbs span the full width**, while the editor content is inset on the right by the detail-panel width via the concrete `EditorPart.setContentRightInset(px)` method (`EditorPart`/`EditorGroupView`; not on the `IEditorPart` interface; `0` = no-op for all other layouts). The detail panel is always docked on the right, so no left margin is needed.
- A **full-width header** sits below the editor title row, spanning the editor content and docked detail panel. In `multiple` mode the title row is the tab strip; in `single` mode it is the active-editor name, followed by editor actions, the Add Tab toolbar, its standard trailing-separator action, and layout actions. The Add Tab menu keeps every supported editor type visible in `single` mode even when that editor is already open, because hidden tabs otherwise provide no discoverable inventory; `multiple` mode continues to show only missing managed tabs. The single-title text uses the same leading content inset as the header, and the header itself owns the bottom separator so the stroke spans the docked detail width. `SinglePaneMainEditorPart.getGroupViewOptions()` enables the header with `showHeader` and supplies `Menus.SessionsEditorHeaderPrimary`, `Menus.SessionsEditorHeaderSecondary`, and `Menus.SessionsEditorHeaderLayout`. Whenever `showHeader` is enabled, breadcrumbs belong to `EditorHeaderControl` in that second row for every tab mode; the single-title control neither creates a competing inline breadcrumb nor repeats the path through its description. `EditorHeaderControl` owns the header DOM, evaluates those menus, renders their toolbars, and exposes its fixed visible height to `EditorTitleControl`; the title control includes that height in its layout. The header directly contains breadcrumbs followed by one actions container. That actions container owns the primary and secondary action hosts, followed by the layout-action host for **Toggle Details**. When the layout toolbar has visible items, the secondary toolbar uses the standard trailing-separator action to divide its actions (including `...`) from those layout actions; layout menu changes rebuild the paired toolbars so an empty layout toolbar never leaves an orphan separator. The layout host supplies the same far-side action gap that an internal separator receives from a single toolbar. The header must not create or style a separate separator element. Menu items own their active-editor `when` clauses. `SessionChangesEditor.scopedInstantiationService` only supplies its editor-scoped context for evaluating those clauses; its presence does not control whether the header is created.
- Text-file breadcrumbs reuse that **same fixed-height header row**. When `IEditorGroupViewOptions.showHeader` is enabled, `EditorTitleControl` creates `BreadcrumbsControl` directly in the header; otherwise it keeps the standard below-tabs placement in the title container. Header padding defines the shared left anchor for breadcrumbs and primary actions, so either starts at the same inset when the other is absent. Header-hosted breadcrumbs lay out at their actual flexed width, accounting for the header padding and sibling actions instead of using the full editor-group width. While the editor area is visible, the empty Files placeholder exposes the active session's first mounted working directory as its resource, so the row shows that Files view root; the breadcrumb model retains an exact workspace-root resource even when ordinary single-root file breadcrumbs omit that root. Detail-only layouts keep the breadcrumb hidden. This is a single-root fallback: multi-root sessions should eventually show a workspace-level breadcrumb that identifies the workspace and exposes all roots instead of presenting the first folder as the whole workspace. Editors without breadcrumbs or applicable menu actions hide the row and report zero header height.
- A vertical **sash** on the left edge of the docked panel resizes it (`DockedAuxiliaryBarController` in `browser/dockedAuxiliaryBarController.ts` owns `layout()` / `_ensureSash()`, created/driven by `SinglePaneMainEditorPart`). The preferred first-open width is 300px; explicit user resizes persist via the part-sizes snapshot. While the panel is visible it clamps to `[220px, editorWidth - 300px]`; dragging the raw sash width down to ~0 hides the docked detail panel, leaving the editor content visible. Temporary width growth from collapsing the sessions list is restored before persistence and must not become the user's detail width.
- Collapsing the sessions list transfers the freed sidebar width to the editor grid node when the editor content is **visible**, and to the **detail panel** (`_dockedAuxiliaryBarWidth`, with the editor node kept equal to it) when the editor content is **hidden** (detail-only). Reopening the sessions list restores the pre-collapse editor-node width / detail width. Keeping the hidden-editor node equal to the detail width ensures the width-based reveal-sync never mistakes a wide detail-only node for a revealed editor.
- When the editor part is hidden while the docked detail panel remains visible, the editor grid node stays visible for the shared tab strip but shrinks to the persisted detail-panel width, letting the Sessions part absorb the freed editor-content space. The detail panel fills that narrowed node below the tab strip and the editor content area collapses to zero. Its sash remains available so dragging the raw requested detail width below its 220px minimum hides the detail panel; the clamped visible width must not decide this. When a visible editor and its details no longer fit within the node, resize handling hides the details first and leaves editor content visible.
- A detail-only layout uses the exact docked detail-width model. The model starts at the comfortable 300px default only when no saved width exists; after the user drags the detail sash, hiding Editor, switching sessions, and reloading retain that exact width, including values below 300px.
- On reload, core editor restoration can emit `onWillOpenEditor` before the workbench reaches `Restored`. `SinglePaneWorkbench.revealEditorOnOpen` preserves a persisted hidden Editor during that phase, so an Aux-only pane paints directly without briefly revealing Editor; normal editor opens after restoration retain their usual reveal behavior.
- Side-pane visibility restoration does not depend on editor tabs being present. The controller does not hide a revealed Editor merely because the group is transiently empty; the persisted Editor/Aux composition renders first and managed tabs restore afterward. Explicitly closing the last tab during normal operation still closes the side pane through the workbench editor-close path.
- Applying a lifecycle visibility profile hides parts that are not in the target composition before showing target parts. In particular, Editor-only → Aux-only hides Editor before revealing Aux, so restoration never passes through a transient Editor+Aux layout.
- During reload there is a window after the workbench reaches `Restored` but before `restoreVisibleSessions()` supplies an active session. `SinglePaneDetailPanelStrategy` returns `Preserve` in that state; treating the missing session as `Hidden` would close persisted Aux, whose layout invariant reveals Editor, and paint Editor-only until the session profile arrives.
- Widening a detail-only editor node does not automatically reveal editor content. The editor area remains hidden until the user explicitly opens an editor workflow or toggles the editor area. This preserves the user's detail-only choice across sash drags and grid relayouts.
- When the outer editor sash makes a visible editor and its docked details too narrow to coexist, single-pane automatically hides details and leaves editor content visible. If the user widens the node past the detail width plus the editor minimum and a 100px hysteresis margin, it restores the details. This responsive detail behavior is exclusive to the single-pane layout.
- Revealing the side pane from *closed* (`setEditorHidden(false)`, e.g. the session-header Changes button opening the Changes editor) passes `Sizing.Distribute` to `SerializableGrid.setViewVisible`. The grid already knows the revealed view's location, so it distributes that containing split and Sessions and the side pane receive equal space without either part computing pixels, percentages, or a split reference. The side pane sash's double-click reset uses the same native grid distribution because the visible editor part has no fixed `preferredWidth`. In docked mode this runs on every reveal that has no saved user width to restore; a genuinely user-chosen width still takes precedence.
- Side-pane sizes are **workbench-level, not per session**: the editor grid node width is owned by the workbench grid and persisted globally (`workbench.sessions.partSizes`), so switching between sessions keeps the same side-pane width the user last set — the layout controller does not track or restore a per-session width. The workbench persists the docked side-pane geometry across reloads via `_savePartSizes` on `onWillSaveState`, restored by `createDesktopGridDescriptor`. Because the docked detail (auxiliary bar) lives **inside** the editor grid node, the persisted editor value is the pure editor-content width: `_persistedEditorWidth` subtracts the docked detail width **only when the detail is visible**, mirroring the descriptor, which adds it back only when the detail is visible. Subtracting it unconditionally (the earlier bug) shrank an **Editor-only** session's side pane by the detail width on every reload, compounding toward zero.
- `_dockedEditorSizeBeforeHide` is captured on hide **only for "Hide Editor"** (detail/auxiliary bar still visible, so the editor node stays visible at a real user-chosen width). When the **whole** side pane closes, the editor grid node collapses to `0px`; that is not captured as a user width, so reopening falls through to the last persisted width or the equal Sessions/side-pane split.
- **Hide Editor** / **Show Editor** render in the tab strip's editor-title layout cluster (`MenuId.EditorTitleLayout`), immediately after **Maximize/Restore Editor Area** (order `20` vs. `10`). They are mutually exclusive, gated on `MainEditorAreaVisibleContext` being true/false respectively, so only one is present at a time — unlike the earlier design, they always show and are always enabled regardless of whether the active tab has a docked detail or the detail panel is currently visible (no `HasDockedDetailsContext` gate, no `AuxiliaryBarVisibleContext` precondition), consistent with Maximize/Restore's own always-shown behavior in that cluster. Hide unconditionally reveals the auxiliary bar as part of its `run()` (so it always has somewhere to fall back to even if details were hidden beforehand), hides the editor part, and restores the sessions list (freeing the space it may have auto-collapsed for). Show reveals the editor area via the same explicit-reveal path (`revealEditorPartExplicitly()`) as the session-header Changes pill, then focuses the editor group. The full-width editor header's own trailing layout-action host (separate from the tab-strip cluster; see above for its separator behavior) now holds **Toggle Details** alone; Toggle Details is hidden for Browser/Search tabs, which have no detail. Opening a file or diff from the detail panel reveals the editor again. If the detail-panel toggle hides the detail while editor content is hidden, it reveals the editor content instead of leaving the pane empty; **Toggle Side Panel** remains the separate action that can hide both.
- Changes opens as a **custom `SessionChangesEditor`** (the multi-diff editor; in single-pane its *Branch Changes* dropdown + diff-stats + primary actions render in the full-width header part above, so the editor itself is header-less and the diff fills the pane). Each file header shows the live `+insertions -deletions` counts from the selected changeset alongside the file label. Clicking a Branch Changes file honors the same `sessions.changes.openSingleFileDiff` setting and Alt inversion as the standard layout, opening either a docked single-file diff or revealing the file in this multi-diff editor. When Changes details are visible, the full-width header exposes the List/Tree view-mode action for both the multi-file Changes editor and every docked single-file diff editor, including binary or custom-editor fallbacks; it shows the inline/side-by-side diff toggle only for the multi-file editor and text diff panes that support that layout. The auxiliary bar's composite tab strip + title are hidden, and `SinglePaneDetailPanelStrategy` maps the active editor tab to the detail container (Changes → files + Checks, File → Explorer, Browser → hidden). Activating a Changes/file editor switches the detail container to match but does **not** force-reveal a hidden detail — except when the empty Files placeholder becomes active or when the detail was transiently hidden by a Browser tab.
- **Run Code Review** renders as the first inline action on the right while the single-pane Changes editor area is visible. When the editor area is collapsed, it moves into the first group of the right-side `...` overflow, followed by a separator and the remaining overflow actions.
- Closing the last editor tab hides both the editor content and the docked detail panel, leaving the Agents window chat-only. Opening any tab reveals the editor part again, and `DetailPanelController` restores the matching detail content for File/Changes tabs.
- **Editor-area tab collapse:** when the editor area is hidden (detail-only), the single-pane controller closes **every non-docked** editor tab (anything not `instanceof DockedEditorInput`) so only the docked Changes and Files tabs remain, capturing each closable one's untyped input **and tab index** (`editor.toUntyped()`); when the editor area is shown again the captured ones are reopened **at their original positions** (`SinglePaneEditorAreaCollapseStrategy._collapseNonManagedTabs` / `_restoreCollapsedTabs`, registered by `SinglePaneLayoutController._registerAuxiliaryControllers`). It is serialized on the shared docked-tab `Sequencer`, skipped during a layout-driven restore (`ISinglePaneLayoutContext.isRestoringSessionLayout`), and the capture is dropped on a session change. Non-restorable tabs (e.g. an **untitled Search editor**, whose `toUntyped()` returns `undefined`) are still closed but not restored; dirty editors are closed too (the workbench save/confirm flow applies), so they don't linger in a "closed" editor area.
- **Side-pane visibility is shared by session lifecycle type, not individual session.** `SinglePaneSidePaneVisibilityStrategy` persists exactly two `{ editorVisible, auxiliaryBarVisible }` profiles under `sessions.singlePane.sidePaneVisibility`: one for New Sessions and one for Existing Sessions. Geometry remains workbench-owned; Quick Chats store nothing. Every workspace-session resource switch reapplies the matching shared profile, including Existing→Existing, so transient editor working-set/tab restoration cannot overwrite Aux visibility. Submit preserves the current composition and seeds Existing from it.
- CSS is scoped by a `.dock-detail-panel` class on the workbench container; `:not(.dock-detail-panel)` reproduces the original grid-based styling.
- The docked auxiliary bar draws its own left and top borders with `--vscode-agentsPanel-border` so the detail panel reads as a bordered region connected to the middle divider.

---

## 6. Feature Support

| Feature | Supported | Notes |
|---------|-----------|-------|
| Sidebar / Aux Bar / Panel toggle | ✅ | Fixed positions (sidebar: left, panel: bottom) |
| Maximize Panel | ✅ | Excludes titlebar |
| Resize Parts | ✅ | Via grid sash or programmatic API |
| Zen Mode / Centered Layout / Menu Bar Toggle | ❌ No-op | — |
| Maximize Auxiliary Bar | ❌ No-op | — |

---

## 7. Parts Architecture

The Sidebar, Auxiliary Bar, and Panel extend `AbstractPaneCompositePart`; the Titlebar extends `Part` directly; the Sessions Part also extends `Part` (it is not a pane composite — it owns its own internal grid of session views, see [§4](#4-sessions-part)). All parts are instantiated eagerly so they register themselves with the workbench layout service before `createWorkbenchLayout()` builds the grid. The pane-composite parts are accessed through `AgenticPaneCompositePartService`, which replaces the standard `IPaneCompositePartService`.

Key differences from standard workbench parts:
- **No activity bar** — account widget lives in the sidebar footer
- **Fixed composite bar** — for pane-composite parts the position is always `Title`; the sidebar hides its composite bar (only the sessions list shows)
- **Card appearance** — Sessions Part, Auxiliary Bar, and Panel render as cards with rounded borders and margins; Sidebar is flush
- **Separate storage keys** — each part uses `workbench.agentsession.*` keys to avoid conflicts with regular workbench state
- **Sidebar footer** — a menu-driven toolbar below the sessions list, hosting the account widget
- **macOS traffic lights** — sidebar includes a spacer (70px) for window controls when using custom titlebar

---

## 8. Contributions

Contributions are registered via module imports in entry points (`sessions.common.main.ts`, `sessions.desktop.main.ts`).

Key UI surfaces:
- **Sessions View** — sidebar, shows sessions grouped by workspace with pinned section
- **Changes View** — auxiliary bar, shows file changes for the active session
- **Chat composite bar** — per-session peer-chat tabs; user-created side chats reuse this surface while tool-origin subagents stay hidden until opened
- **Chat / New Chat views** — hosted inside each `SessionView` in the Sessions Part, registered via `IChatViewFactory` from `contrib/chat/`

All session-window contributions use `WindowVisibility.Sessions` to only appear in the Agents Window.

---

## 9. Lifecycle

1. `constructor()` → `startup()` → `initServices()` → `initLayout()`
2. `renderWorkbench()` — creates DOM and parts (editor part created hidden)
3. `createWorkbenchLayout()` — builds the workbench grid
4. `createWorkbenchManagement()` — eagerly creates the welcome/setup service. Wiring of the Sessions Part lives in `SessionsService` (an eager singleton): it owns the single reconcile autorun that reads `ISessionsService.visibleSessions` and calls `SessionsPartService.updateVisibleSessions(...)`, and it observes its own `activeSession` (the active visible slot) to move keyboard focus into that session's view via `SessionsPartService.focusSession` (guarded so it does not steal focus from a session the user is already interacting with). The part itself is a passive renderer; focus is a pure view concern — the management service never reaches into the part.
5. `layout()` → `restore()` — opens default view containers for visible parts

**Initial part visibility:** Sidebar ✅, Sessions Part ✅, Auxiliary Bar ✅, Editor ❌, Panel ❌. The editor pane comprises the editor and auxiliary-bar parts; the workbench adds `noeditorpane` only when both are hidden. In the single-pane layout, it instead reads the docked editor grid node's visibility, which is also visible for a detail-only pane.

---

## 10. Per-Session Layout State

The session layout controllers manage layout state as the user switches between sessions. All state is persisted to workspace storage so it survives restarts. This section is a summary — see **[LAYOUT_CONTROLLER.md](LAYOUT_CONTROLLER.md)** for the full specification (switch trigger, multi-session handling, persistence, and invariants).

The implementation is split across three files in `contrib/layout/browser/`, each with a file-level spec of numbered rules (`B*`/`D*`/`M*`) that the code and tests reference by tag. Each concrete controller self-registers behind a platform guard:

- **`BaseLayoutController`** ([baseSessionLayoutController.ts](contrib/layout/browser/baseSessionLayoutController.ts), [spec](contrib/layout/browser/baseSessionLayoutController.md)) — abstract; shared panel / working-set / persistence / multi-session logic.
- **`LayoutController`** ([desktopSessionLayoutController.ts](contrib/layout/browser/desktopSessionLayoutController.ts), [spec](contrib/layout/browser/desktopSessionLayoutController.md)) — desktop and web desktop layout. Adds the auxiliary bar / view-state management described below (via the `_registerViewStateManagement()` hook). Imported from `sessions.desktop.main.ts` and `sessions.web.main.ts`.
- **`MobileLayoutController`** ([mobileSessionLayoutController.ts](contrib/layout/browser/mobileSessionLayoutController.ts), [spec](contrib/layout/browser/mobileSessionLayoutController.md)) — web phone layout (`isWeb && isMobile`). Keeps the shared logic but omits auxiliary bar management, which would cause disruptive auto-expand on narrow viewports. Imported from `sessions.web.main.ts`.

### Auxiliary Bar

Each session independently remembers whether the auxiliary bar is visible and which view container is active. When switching to a session, the saved state is restored. When switching away, the current state is captured.

**The side pane never opens automatically for existing sessions.** It is only shown when the user opens it; the controller never auto-reveals it on session switch or when a chat turn produces new file changes. A session with no explicit "visible" choice (including one that just converted from the new-session view to an existing session) keeps the side pane hidden until the user opens it.

**Default view on new sessions:** An untitled (new-session) session opens the side pane by default — the Files view, or the Changes view once it has changes — and that choice sticks until the user changes it. When a new session is submitted (it converts to a real session while staying active) the side pane is kept as the user left it: if it was open it stays open and switches to the Changes view so changes are visible as soon as they land; if it was closed it stays closed.

The Changes view's body is a vertical `SplitView` of File Changes, Other Files, and Checks. File Changes grows to its full rendered content height when possible, but never beyond it; its viewport budget reserves the Other Files header plus up to three file rows and the Checks header plus up to five check rows. Absent sections reserve no height and collapsed sections reserve only their header. Remaining height expands Other Files first and Checks second, up to each section's content height. Once the user moves a sash, manual pane sizes remain in effect until changing content constraints require adjustment; a temporarily empty pane relies on `SplitView`'s cached visible size when it reappears rather than reapplying its preferred default. Other Files and Checks remember their collapsed state independently per session for the lifetime of the window, including while their content is temporarily absent; draft-to-committed session replacement transfers that state. When File Changes has no changed files, it keeps a 140px minimum height for the empty state.

**Editor maximized:** While the editor area is maximized (`IAgentWorkbenchLayoutService.isEditorMaximized()`), the Changes view is always shown in the auxiliary bar, **irrespective of the session's previous or saved state**. This is driven directly from the auxiliary-bar sync autorun, so it holds across session changes and changes-state updates while maximized. The forced visibility is never captured as the session's per-session preference, so when the editor is un-maximized the autorun re-runs and restores the session's real auxiliary bar state.

`setEditorMaximized` (in `browser/workbench.ts`) treats maximize as a fully reversible state: on entering it snapshots the editor part's size and the surrounding parts' visibility, and on exiting it restores the auxiliary bar to its pre-maximize visibility and resizes the editor part back to its captured width. Without this, the auxiliary bar that the controller forces visible while maximized would otherwise remain (and shrink the editor) after un-maximizing, so the editor would not return to its previous size.

### Panel

The panel (terminal / debug output) is hidden by default for all sessions. Each session independently tracks the user's last explicit show/hide action, and that state is restored on session switch. Its height remains workbench-level state rather than per-session state. In single-pane layout, revealing the Editor preserves the visible panel height; otherwise the grid can shrink the panel to its minimum while it redistributes space for the restored Editor node.

### Editor Working Sets

Each session remembers which editors were open, regardless of `workbench.editor.useModal`: browser editors dock in the shared grid editor part even when other editors are forced modal (`useModal: 'all'`), so their tabs still need per-session tracking. On session switch the previous session's open editors are saved as a named working set and the incoming session's working set is restored. Archived or deleted sessions have their working sets removed.

A session also remembers whether its editor part was hidden (e.g. the user closed the Side Panel while keeping editors open). Restoring such a session keeps the editor part hidden rather than forcing it back open with the working set.

This is coordinated carefully: the active session observable is updated before the workspace folders update, so `LayoutController` waits until the workspace folders reflect the new session before applying the working set (to avoid restoring editors into the wrong workspace).

---

## 11. CSS

The workbench root element has class `agent-sessions-workbench`. Visibility classes (`nosidebar`, `noauxiliarybar`, `nosessionspart`, `nopanel`) are toggled on the main container.

The shell background uses an accent-tinted radial gradient derived from `button.background`, with titlebar and sidebar wrappers transparent so the gradient reads continuously. High-contrast themes disable the gradient.
