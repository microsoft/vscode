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
| Editor | In grid, beside Sessions Part | Hidden | Shown for explicit editor workflows |
| Auxiliary Bar | Right side | Visible | Changes view, file tree |
| Panel | Below Sessions Part + Aux Bar | Hidden | Terminal, debug output |

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
        │   └── Auxiliary Bar (leaf, 340px default)
        └── Panel (leaf, 300px default, hidden)
```

The titlebar spans the full window width at the root level. Below it, a content section holds the sidebar (left) and the right section. The Sessions Part itself contains an **internal** horizontal grid (one leaf per visible session) — that grid is private to the part and is not part of the workbench grid above.

The **Sessions Part is the flexible ("remaining width") view** in the top-right row: it has `LayoutPriority.High` so it absorbs auxiliary bar / editor visibility changes and window resizes. The editor and auxiliary bar keep their user-set widths (`LayoutPriority.Normal` / `Low`). Making the editor the high-priority view caused its width to drift to its 300px minimum when the auxiliary bar was toggled across session switches.

### 2.3 Layout Priority Model

The workbench grid is built with `proportionalLayout: false` (see `createWorkbenchLayout()` in [browser/workbench.ts](src/vs/sessions/browser/workbench.ts)). In this mode the split views do **not** distribute resize deltas proportionally — instead each delta (window resize, or a part being shown/hidden) is absorbed by the highest-`LayoutPriority` view, while the others keep their established sizes. Each part therefore declares an explicit `priority`:

| Part | `LayoutPriority` | Width behaviour |
|------|------------------|-----------------|
| Sidebar | `Low` | Fixed user-set width; never absorbs deltas. `minimumWidth` 170 (270 web), `maximumWidth` ∞, snaps closed below the minimum. |
| Sessions Part | **`High`** | The single flexible view — grows/shrinks to absorb every horizontal delta. `minimumWidth` 300, `maximumWidth` ∞. |
| Editor | `Normal` | Keeps its user-set width (`600` default); only resized via its own sash. |
| Auxiliary Bar | `Low` | Keeps its user-set width (`340` default); only resized via its own sash. |

In the single-pane detail-panel layout, first-run sidebar width is slightly narrower (280px) so a typical window keeps roughly balanced chat and third-pane widths when the pane is shown. Persisted `_savedPartSizes` always win over these defaults.

**Invariant — exactly one `High` view in the horizontal chain.** A grid branch derives its priority from its children (`BranchNode.priority` in [base/browser/ui/grid/gridview.ts](src/vs/base/browser/ui/grid/gridview.ts)): `High` if any child is `High`, else `Low` if any child is `Low`, else `Normal`. The Top Right row contains a `Low` auxiliary bar, so unless the Sessions Part is `High` the whole Right Section derives to `Low`. The Content Section would then be `Sidebar (Low) | Right Section (Low)` — two equal-priority views — and with no high-priority absorber the resize delta spreads across **both**, growing the sidebar toward half the window. The Sessions Part being `High` is what lifts the Right Section to `High` so it (not the sidebar) absorbs the delta.

> **Pitfall:** the `High` role must live on the Sessions Part, not the editor. It was previously on the editor, but that made the editor drift to its 300px minimum when the auxiliary bar was toggled across session switches. When moving the role, set the Sessions Part to `High` **and** the editor to `Normal` together — removing `High` from the editor without adding it to the Sessions Part leaves the chain with no `High` view and reintroduces the growing-sidebar bug.

---

## 3. Titlebar

The titlebar is a standalone implementation (`TitlebarPart`) — not extending `BrowserTitlebarPart`. It has three menu-driven sections:

| Section | Menu ID | Content |
|---------|---------|---------|
| Left | `Menus.TitleBarLeftLayout` | Toggle sidebar, new session (when sidebar hidden, A/B experiment), agent host filter |
| Center | `Menus.CommandCenter` | Session picker widget (plus `Menus.TitleBarSessionMenu` for active-session actions) |
| Right | `Menus.TitleBarRightLayout` | Remote connections, run script (split button), Open Terminal/VS Code, toggle auxiliary bar, account widget |

No menubar, no editor actions, no `WindowTitle` dependency.

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

### Agent Host Filter (Left)

When multiple remote agent hosts are known, a dropdown pill in the left toolbar scopes the workbench to a specific host. When no hosts are known the pill acts as a re-discover trigger.

### Blocked Sessions (Center)

When at least one session is **blocked**, the center session picker widget (`SessionsTitleBarWidget`) switches from the active-session pill to an orange "N sessions require input" state (orange foreground, background and border), and blinks twice whenever a newly blocked session appears. A session counts as blocked when it needs input, or — while not in progress — has failing CI checks or unresolved pull request comments. Raw detection is owned by the `BlockedSessions` model (`contrib/blockedSessions`), which reuses the shared, background-polled GitHub CI / review-thread models via `computePullRequestIconStatus`. The widget refines this into what the title bar surfaces via the `BlockedSessionsIndicatorModel` (`blockedSessionsIndicatorModel.ts`) it instantiates: it drops sessions the user can already see, applies optimistic approval dismissals, classifies the homogeneous requires-input reason (for the specific message), builds the pill label, and decides when the attention blink plays. Blink detection keys off the underlying model's blocked-session ids (independent of visibility) so it fires only when a session *genuinely* becomes blocked — never merely because the user navigated to a different session. Clicking the widget opens those sessions rendered exactly like the sessions list but flat — no sections, groups or workspace headers — via the reusable `SessionsFlatList` (exported from `sessionsList.ts`) in a dropdown anchored below the command center box using `IContextViewService`; clicking a row opens the session like the main list. The flat list passes `toolbarActions: false` so its rows render no inline action toolbar (pin, mark as done, etc.), which don't apply to blocked sessions. When no session is blocked, the widget behaves as the normal active-session pill. Whether the widget enters this state is driven by the `BlockedSessionsIndicatorModel`'s `blockedSessions` observable.

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

- A **session header** at the top ([browser/parts/sessionHeader.ts](src/vs/sessions/browser/parts/sessionHeader.ts)) — the session status icon + title, a meta row (the contributed workspace folder / changes / pull request / terminals buttons), and the session toolbars (Run, Open in VS Code, New Chat). The status icon ([browser/sessionStatusIcon.ts](src/vs/sessions/browser/sessionStatusIcon.ts)) shows the live spinner/status glyph for in-progress / needs-input / error states; in terminal/default states the title shows the read/unread **dot indicator** (filled link-colored dot when unread, small muted dot when read) — neither the session type icon nor the PR icon is shown in the title, since the pull request is surfaced in the meta row instead. (The status icon's `completedStateIcon` argument is generic: the header passes nothing so it falls back to the dot indicator, while the sessions list still passes the PR icon.) The meta row hosts a generic `Menus.SessionHeaderMeta` toolbar that any feature can contribute actions into; by default each contributed action renders as a consistent compact secondary `Button` with an inline `icon title` label via `SessionHeaderMetaActionViewItem` ([browser/parts/sessionHeaderMetaActionViewItem.ts](src/vs/sessions/browser/parts/sessionHeaderMetaActionViewItem.ts)) unless it registers its own action view item (spacing between the pills comes from the meta row's `gap`, no separator dot). The files view contributes the workspace folder pill (order -10, so it leads the row, gated by the per-view `SessionHasWorkspaceContext` key which `SessionView` sets when the session has a workspace label, with a custom action view item that extends `SessionHeaderMetaActionViewItem` to render the workspace icon — cloud / folder / worktree per workspace kind — plus the workspace label, and a hover showing the working-directory path and git branch, registered from `contrib/files/browser/workspaceFolderActions.ts`) that, when activated, opens the Files view. The changes view contributes the diff stats as a clickable menu item (order 0, gated by the per-view `SessionHasChangesContext` key, which `SessionView` sets from the session's **Branch Changes** changeset, with a custom action view item that extends `SessionHeaderMetaActionViewItem` to render the diff-multiple icon, a `{n} files` label, and the live `+insertions -deletions` counts, registered via `IActionViewItemService` from `contrib/changes/browser/changesActions.ts`) that, when activated, opens the multi-file diff editor for the session. The pill always reflects the **Branch Changes** changeset (the branch-vs-base diff) — located in `IActiveSession.changesets` by the shared `BRANCH_CHANGES_CHANGESET_ID` (`services/sessions/common/session.ts`), falling back to `IActiveSession.changes` when absent — so it is independent of whichever changeset the Changes view currently has selected. The GitHub contribution similarly contributes a pull request button (order 1, so it follows the changes button) showing the PR icon + `#<number>` (gated by the per-view `SessionHasPullRequestContext` key, which `SessionView` sets from the session's GitHub info, with a custom action view item that extends `SessionHeaderMetaActionViewItem` to render the live `#<number>` as its label, registered from `contrib/github/browser/pullRequestActions.ts`) that, when activated, opens the pull request on GitHub; its leading icon reads `gitHubInfo.pullRequest.icon` and renders its themed color (set as an inline `color` with `!important` priority) so the glyph reflects the live PR state; its hover is owned by the GitHub contribution and shows the repository link/date, PR title, up to three lines of description, and target/source branch pills. The sessions terminal contribution similarly contributes a terminals button (order 2, so it follows the pull request button) showing the terminal icon + `{n} terminals` (gated by the per-view `SessionHasTerminalsContext` key, which `SessionView` sets from the terminal counts exposed by `ISessionTerminalsService` — backed by `SessionsTerminalContribution`). The label counts the session's terminals that have had at least one command sent in them (empty terminals that never ran a command are excluded), while the hover reports how many of those are currently running something (active) via `ITerminalInstance.hasChildProcesses` — e.g. a watch task or an in-progress `npm install`. The contribution records "has had a command" stickily per terminal (from executed text, command detection or a started child process) and recomputes the active subset live; the custom action view item extends `SessionHeaderMetaActionViewItem` to render the live count and the `{n} active terminals` hover, registered from `contrib/terminal/browser/terminalMetaActions.ts`) that, when activated, reveals the terminal view for the session. Visible once the bound session is created. It is also the drag handle for the session. Right-clicking the header opens `Menus.SessionHeaderContext`, which surfaces pin view / close (`1_view`), rename (`2_edit`), and mark read / unread (`3_read`). The built-in rename action is registered from `contrib/sessions/browser/sessionsActions.ts` and uses `ISessionsPartService` to find the matching `SessionView`, which delegates to the header's inline rename control.
- A **chat composite bar** below the header ([browser/parts/chatCompositeBar.ts](src/vs/sessions/browser/parts/chatCompositeBar.ts)) — the chat tab strip. Visibility tracks the number of **chats** in the session (**including in-composer draft chats**, and **counting closed chats**): it is shown as soon as the session has more than one chat and stays shown when chats are **closed** back down to a single open chat, hiding only when there is exactly one chat overall whose title matches the session title. It is **also** shown for a single remaining chat whose **title diverged** from the session title (so that chat's title stays visible somewhere). This rule is a single shared observable `IActiveSession.shouldShowChatTabs` ([services/sessions/browser/visibleSessions.ts](src/vs/sessions/services/sessions/browser/visibleSessions.ts)), read by both the composite bar and the `SessionShouldShowChatTabsContext` context key. The strip's own trailing **New Chat** action follows this visibility. The header's **New Chat** action is shown while the tab strip is hidden (a single chat with no diverged title); once the strip is shown the strip's trailing **New Chat** action offers it instead. The **New Chat** and **Conversations** controls are therefore split across the header and the tab strip on the same `SessionShouldShowChatTabsContext` boundary: the **Conversations** menu appears once the session has more than one **committed (non-draft)** chat — in the session header while the tab strip is hidden, and in the **chat tab bar action menu** at the end of the tab strip (`Menus.SessionChatTabBar`, rendered by the chat composite bar) once the strip is shown. While the tab strip is shown the chat tabs are keyboard-navigable from the active session: `Ctrl/Cmd+Shift+]` / `Ctrl/Cmd+Shift+[` go to the next / previous chat (wrapping), `Ctrl/Cmd+W` closes the active chat tab (deleting an in-composer draft, hiding a committed chat) instead of the session — the same command (`sessions.chatCompositeBar.closeChat`) is contributed to the per-tab `Menus.SessionChatTab`, which the chat tab strip renders as each non-main tab's close button (forwarding the tab's chat as the action argument), and `Ctrl+Tab` / `Ctrl+Shift+Tab` open a **chat switcher** — a no-input, editor-switcher (MRU) quick pick over the session's **open** chats (skipping in-composer drafts), each shown with a chat icon (hold the modifier, press `Tab` to cycle, release to select), winning over the session-history secondary on that chord while the session has multiple open chats and falling back to session navigation otherwise (and to the editor's own `Ctrl+Tab` switcher while a quick pick is already open, since the open chords are gated on `inQuickOpen` negated); the **Go to Chat in Session** palette command (`sessions.showChatsPicker`, `Ctrl/Cmd+Shift+O`, gated on more than one committed chat) opens a **searchable** variant that additionally lists **Closed** chats in a separate group (selecting one reopens it) — these commands (`sessions.chatCompositeBar.navigateNextChat` / `navigatePreviousChat` / `closeChat` and `sessions.showChatsPicker` in `contrib/sessions/browser/sessionsActions.ts`) outrank the session-level navigation/close chords via a higher keybinding weight. Chat-to-chat navigation (next/previous chat and the `Ctrl+Tab` switcher) is gated on `SessionHasMultipleOpenChatsContext` (more than one **open** tab) — distinct from the broader `SessionShouldShowChatTabsContext` that drives strip visibility — so it stays a no-op when only a single open chat remains (e.g. a diverged-title single chat, or one open + one closed chat); `closeChat` is gated on `SessionActiveChatIsClosableContext`, and the searchable palette command on `SessionHasMultipleCommittedChatsContext`.
- A **chat view** below the bars, swapped in/out based on session state.
- A floating toolbar overlay ([browser/parts/sessionHeader.ts](src/vs/sessions/browser/parts/sessionHeader.ts), `SessionViewFloatingToolbar`) shown for not-yet-created sessions in place of the header.

The header and the composite bar are deliberately separate widgets: the header represents the session identity/actions and is always present, while the tab strip is a per-chat navigation concern that appears (and then stays, per the sticky rule above) once a session has multiple chats or a diverged default-chat title. They share visual tokens via `applySessionBarThemeColors` ([browser/parts/sessionBarStyles.ts](src/vs/sessions/browser/parts/sessionBarStyles.ts)) and stylesheet ([browser/parts/media/chatCompositeBar.css](src/vs/sessions/browser/parts/media/chatCompositeBar.css)). `SessionView` sums each widget's reported height to lay out the chat view below them. The header and tab strip are centered and capped to 990px via their own CSS classes (`.chat-composite-bar.session-header-bar` / `.chat-composite-bar.session-chat-tabs-bar` in [chatCompositeBar.css](src/vs/sessions/browser/parts/media/chatCompositeBar.css)). The chat view itself is still laid out at full session width so its scrollable viewport (and scrollbar) stays flush to the far-right edge; only the inner chat content (message/input cards, via `.interactive-item-container`, capped to 950px in [browser/media/style.css](src/vs/sessions/browser/media/style.css)) is width-constrained and centered via CSS. Each constrained message row is also the positioning context for request overlays such as steering-message actions, keeping those controls anchored to the message instead of the full-width scroll viewport.

**Pitfall:** absolute request overlays must not remain positioned against the full-width `.interactive-session` after message rows are independently constrained. Make the constrained row their positioning context or hover actions drift into the viewport gutter. Request rows must also override the tree's `.monaco-tl-contents { overflow: hidden; }`, otherwise controls positioned above the request are clipped at the row boundary.

**Pitfall:** don't cap the chat viewport width in `SessionView` layout when you need edge-aligned scrollbars. Keep the viewport full-width and center only the inner chat content so alignment and scroll ergonomics both hold.

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

`ChatView` mounts session input banners directly above the chat input. The CI failures banner uses the orange accent for the card border/icon and for the primary Fix Checks button background/border.

When a `ChatView` loads its chat model (`acquireOrLoadSession`), it surfaces progress on **its own** progress bar, pinned to the top of that grid leaf. This mirrors how each editor group owns its `ProgressBar` (see `EditorGroupView`): the bar is created by the leaf host `AbstractChatView`, wrapped in a `ScopedProgressIndicator` (reused from `vs/workbench`) with an always-active scope, and driven via `AbstractChatView.showProgressWhile(promise, delay)`. Concurrent loads in other visible sessions each show their own progress instead of competing for a single part-wide bar, and overlapping loads on the same leaf are joined by the indicator so the bar only hides once all have settled. A short delay avoids flashing the bar for fast (cached) loads.

### 4.2 Visibility Model

The set of session views in the part is driven by `ISessionsService.visibleSessions` (services — see [services/sessions/browser/sessionsService.ts](src/vs/sessions/services/sessions/browser/sessionsService.ts)), which is backed by the `VisibleSessions` model helper (see [services/sessions/browser/visibleSessions.ts](src/vs/sessions/services/sessions/browser/visibleSessions.ts)).

Key invariants:

- **Multiple visible sessions, one active.** The Sessions Part may show one or several session views side-by-side. Exactly one of them is the **active** session at any time — the one that receives keyboard focus, drives context keys, and is reflected in the titlebar / sidebar / auxiliary bar.
- **Active session is observable.** Visible and active sessions are exposed as `IObservable<readonly (IActiveSession | undefined)[]>` and `IObservable<IActiveSession | undefined>` respectively. `SessionsService` (services) owns the single reconcile autorun: it subscribes once and calls `SessionsPartService.updateVisibleSessions(visible, active)`, which forwards to `SessionsPart`. The part is a **passive renderer** — it injects neither the model nor the view.
- **One slot may be the "empty" slot.** A visible session of `undefined` represents a not-yet-created chat — its session view renders the `'newSession'` chat view (workspace picker + input). At most **one** slot may be `undefined` at any time. When the user submits its first message, the placeholder transitions into a real session and the grid slot is preserved.
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

When the editor part is shown in the grid (not as a modal), its title toolbar (`MenuId.EditorTitleLayout`, right of the tabs) hosts layout actions registered in `contrib/editor/browser/editor.contribution.ts`, ordered left-to-right as: open in modal editor, **maximize / restore editor area**, a single **Toggle Details** action for the auxiliary bar (labelled "Toggle Secondary Side Bar" in the non-single-pane layout), and **close editor area**. The auxiliary-bar toggle sits to the right of maximize/restore because it changes the right-hand side of the layout. It reuses the core `workbench.action.toggleAuxiliaryBar` command (already registered in the agents window by the workbench auxiliary bar part, and available in the Command Palette under **View**) surfaced through two `when`-gated menu items in `browser/layoutActions.ts` so the icon flips without rendering a checked/highlighted state: the `right-panel-show` codicon shows when the auxiliary bar is hidden (`AuxiliaryBarVisibleContext` negated, click to show) and the `right-panel-hide` codicon shows when it is visible (click to hide). In the Agents-window tab strip, the editor-actions side first shrinks down to 50px before the tab scroller starts shrinking.

When the auxiliary bar is hidden the editor becomes the rightmost card and expands into the freed space; the workbench's 10px right gutter still applies, and a `.noauxiliarybar` rule in `browser/media/style.css` restores the editor's right border and right corner radii so it keeps its card appearance.

The single-pane editor group renders its title actions from the sessions-owned menus (`getGroupViewOptions` in `browser/parts/singlePaneEditorPart.ts` maps `editorActions` to `Menus.SessionsEditorTitle`), which shadows the core `MenuId.EditorTitle`. So `editor/title` items contributed by **extensions** would otherwise be dropped. `EditorTitleMenuBridgeContribution` in `contrib/editor/browser/editor.contribution.ts` (active only when `isSinglePaneLayoutEnabled`) bridges them: it listens to `MenuRegistry.onDidChangeMenu(MenuId.EditorTitle)` and mirrors **only** the extension-contributed items into `Menus.SessionsEditorTitle`. Extension items are identified two ways: command items by `item.command.source` (set by the `commands` extension point in `menusExtensionPoint.ts`), and submenu items by their `api:`-prefixed `submenu.id` (extension submenus are registered as `MenuId.for('api:<id>')` by the `submenus` extension point). Core items have neither and are not bridged (they are already dual-contributed where needed). The mirror is kept in sync (a `DisposableStore` is cleared and rebuilt on every menu change) so it tracks extensions registering/unregistering.


The Toggle Details action (Toggle Secondary Side Bar in the non-single-pane layout) collapses or restores the secondary side bar while the editor stays open. In the single-pane layout it also has a default keybinding (**`⌥⌘L`**), and maximize/restore of the editor area has a default toggle keybinding (**`⌥⌘E`**, active only while the editor area is visible); both are scoped to the main sessions window with the single-pane setting enabled. When a session's editor working set is restored on session switch, the editor part is revealed programmatically and the session's saved auxiliary bar visibility is honored (a side bar the user hid for a session stays hidden when returning to it).

The main editor part can be explicitly revealed for workflows that target it directly.

### Single-pane redesign (experimental — `sessions.layout.singlePaneDetailPanel`, default OFF)

> See [SINGLE_PANE_SCENARIOS.md](SINGLE_PANE_SCENARIOS.md) for the full scenario/state/transition catalog and the manual validation checklist.

The entire third-pane redesign is gated behind the experimental setting `sessions.layout.singlePaneDetailPanel`, read **once at startup** (a window reload applies a change). When the setting is **off** (default) the Agents window renders exactly as documented above (auxiliary bar as its own grid column with its composite tab strip + title, the standard multi-diff Changes editor). When **on**, the third pane becomes a **single pane with one full-width tab bar**:

- The auxiliary bar is removed from the workbench grid and **docked inside the editor part** (absolutely positioned on the right, below the editor tab strip); the grid's top-right row becomes `Sessions | Editor`, and the editor part spans the editor + detail-panel width.
- The editor group's **title/tab strip spans the full width** while its content is inset on the right by the detail-panel width, via the concrete `EditorPart.setContentRightInset(px)` method (`EditorPart`/`EditorGroupView`; not on the `IEditorPart` interface; `0` = no-op for all other layouts).
- A **full-width header** sits below the tab bar, spanning the editor content and the docked detail panel, and hosts contributed actions. **The header menus are a group-level configuration; opting in is per-editor.** An editor part configures its groups with optional menu ids via `IEditorGroupViewOptions.menuIds` (`{ headerPrimary, headerSecondary, editorActions, tabsBarContext }`) — the core `EditorGroupView` never references any concrete menu point, it just renders whatever menu ids it was constructed with. `EditorPart.getGroupViewOptions()` is a protected hook (default `undefined`) that supplies these options to every group the part creates; `SinglePaneMainEditorPart` overrides it to return `Menus.SessionsEditorHeaderPrimary` / `Menus.SessionsEditorHeaderSecondary` / `Menus.SessionsEditorTitle` / `Menus.SessionsEditorTabsBarContext` (all defined in the sessions layer's shared menu registry, `browser/menus.ts`, not in core `platform/actions`). A header only renders while the **active editor opts in** via `IEditorPane.getHeaderActions()`, which returns just `{ instantiationService }` (the editor-scoped instantiation service so the header actions' `when` clauses evaluate in the editor's context) or `undefined` for no header; `EditorGroupView._renderEditorHeader` (run on every active-editor change) renders the group's configured menus as leading/trailing `MenuWorkbenchToolBar`s (`.editor-group-header-primary` / `.editor-group-header-secondary`, wrap-reversed so trailing actions float up) using that scoped service, hiding the whole header while both menus are empty. The header is a **real flow row inside the editor group** — `EditorGroupView` renders an optional `.editor-group-header` between its `.title` (tabs) and `.editor-container`, and **owns the header rendering and sizing**: the internal `setHeaderContent(render)` creates the inner content element, runs the render callback, and keeps the row **auto-sized to the content** via a `ResizeObserver` (wrapping and growing as needed, firing `onDidChangeHeaderHeight`); `headerHeight` exposes the reserved height. The group lays it out in flow (no absolute positioning) and shifts the editor pane down by its height. `SinglePaneMainEditorPart` renders no header DOM; it only offsets the docked auxiliary bar + sash down by `group.headerHeight` (`IDockedAuxiliaryBarHost.getHeaderHeight()`, re-applied on `onDidChangeHeaderHeight` via `_registerGroupHeader()`). The **Changes editor** (`SessionChangesEditor`) implements `getHeaderActions()` in single-pane (returning its scoped instantiation service), so the group renders `Menus.SessionsEditorHeaderPrimary` (to the left: the *Branch Changes* dropdown + diff-stats `navigation` — the diff-stats is an icon-less "N files +X -Y" label with the *files* count in `descriptionForeground`) and `Menus.SessionsEditorHeaderSecondary` (to the right, all inline unless overflowed: *Run Code Review* first in the `navigation` group, then a separated `1_diff` group with collapse/expand + *Show Side by Side Diff* / *Show Inline Diff* (mutually exclusive by render mode); the sentinel `secondary` group — *View as List/Tree* — falls into the toolbar's overflow "…" menu) for the Changes tab only. When the editor area is **collapsed**, the left header's non-interactive diff-stats label is replaced by a compact clickable "+X -Y" reveal (`VIEW_SESSION_CHANGES_COMMAND_ID`, rendered by the base `ChangesDiffStatsActionItem`, gated `MainEditorAreaVisibleContext.negate()`) that opens the Changes editor on click. The **Create Pull Request** button bar (`ChangesActionsBar`) is hosted in the editor tabs title: a header anchor action (`CHANGES_HEADER_ACTIONS_ID`, registered in `changesViewActions.ts`, contributed to `Menus.SessionsEditorTitle` group `navigation` order 5 and gated on the active Changes editor, top-right editor group, main window, dock-detail-panel setting, and `SessionHasChangesContext`) is rendered by the editor group's title actions. Its custom view item is supplied by `SessionChangesEditor.getActionViewItem()` as `ChangesActionsBarActionViewItem`, and the CSS makes the editor-actions side shrink to 50px before the tab scroller shrinks; split-button labels ellipsize while the dropdown segment stays visible. It hides entirely when its `AgentsChangesToolbar` menu has no actions. (In the classic non-single-pane layout the same `ChangesActionsBar` is still rendered inside `SessionChangesEditor`'s internal header.) The header-primary custom action view items (picker, single-pane diff-stats pill) are registered globally by `(menuId, actionId)` via `IActionViewItemService` in `ChangesEditorHeaderContribution` (`contrib/changes/browser/changesView.ts`), so the group's generic menu toolbars resolve them. The same *Branch Changes* picker and diff-stats actions are also contributed to the classic aux-bar Changes view menus (`ChatEditingSessionChangesFileHeaderToolbar` / `…RightToolbar`), which that view renders with its own action view items — so the two surfaces stay independent.
- A vertical **sash** on the left edge of the docked panel resizes it (`DockedAuxiliaryBarController` in `browser/dockedAuxiliaryBarController.ts` owns `layout()` / `_ensureSash()`, created/driven by `SinglePaneMainEditorPart`). The preferred first-open width is 300px; explicit user resizes persist via the part-sizes snapshot. While the panel is visible it clamps to `[220px, editorWidth - 300px]`; dragging the raw sash width down to ~0 hides the docked detail panel, leaving the editor content visible. Temporary width growth from collapsing the sessions list is restored before persistence and must not become the user's detail width.
- Collapsing the sessions list transfers the freed sidebar width to the editor grid node when the editor content is **visible**, and to the **detail panel** (`_dockedAuxiliaryBarWidth`, with the editor node kept equal to it) when the editor content is **hidden** (detail-only). Reopening the sessions list restores the pre-collapse editor-node width / detail width. Keeping the hidden-editor node equal to the detail width ensures the width-based reveal-sync never mistakes a wide detail-only node for a revealed editor.
- When the editor part is hidden while the docked detail panel remains visible, the editor grid node stays visible for the shared tab strip but shrinks to the persisted detail-panel width, letting the Sessions part absorb the freed editor-content space. The detail panel fills that narrowed node below the tab strip, the editor content area collapses to zero, and the sash is disabled without overwriting the persisted detail-panel width. If the user drags the left workbench grid sash until a visible editor node is squeezed back to the detail width, the editor content is hidden the same way, leaving detail-only.
- If the user drags the workbench grid sash to widen that narrowed editor node, the width-based reveal-sync (`_syncEditorVisibility`) reveals the editor content again — but only once the node is widened past the detail width by a reveal margin (`nodeWidth >= detailWidth + _EDITOR_REVEAL_MARGIN`, i.e. 200px). This mirrors the squeeze-to-hide threshold. The detail keeps its width and the editor takes the remainder (the docked controller shrinks the detail toward its minimum if needed to keep the editor content); there is no even-split jump. The wide gap between the reveal margin and the hide threshold (`detailWidth + 4`) gives hysteresis so a small drag can't oscillate. The sync bails while `suppressEditorPartAutoVisibility` is held (session-switch/reload restore), so only a genuine user sash drag drives it.
- Revealing the side pane from *closed* (`setEditorHidden(false)`, e.g. the session-header Changes button opening the Changes editor) gives the editor a comfortable width via the single-pane `_applyEditorSplitSize()` override (`max(300, floor(windowWidth * 0.6))`, i.e. **60% of the full window width** — the shared ratio `SIDE_PANE_WIDTH_RATIO` in `parts/editorPartSizing.ts`; the base grid layout instead does a plain even split of the main area). In docked mode this runs on **every** reveal that has no `_dockedEditorSizeBeforeHide` to restore — not just the first per window — because hiding collapses the editor node to the detail width and the grid caches it, so a later reveal (including in another session, where the per-window `_hasAppliedInitialEditorSplit` flag is already set) would otherwise restore the narrow cached width. A genuinely user-chosen width captured on hide (`_dockedEditorSizeBeforeHide`) takes precedence and is restored as-is. Non-docked layout keeps the original first-reveal-only gating via `_hasAppliedInitialEditorSplit`.
- Side-pane sizes are **workbench-level, not per session**: the editor grid node width is owned by the workbench grid and persisted globally (`workbench.sessions.partSizes`), so switching between sessions keeps the same side-pane width the user last set — the layout controller does not track or restore a per-session width. The workbench persists the docked side-pane geometry across reloads via `_savePartSizes` on `onWillSaveState`, restored by `createDesktopGridDescriptor`. Because the docked detail (auxiliary bar) lives **inside** the editor grid node, the persisted editor value is the pure editor-content width: `_persistedEditorWidth` subtracts the docked detail width **only when the detail is visible**, mirroring the descriptor, which adds it back only when the detail is visible. Subtracting it unconditionally (the earlier bug) shrank an **Editor-only** session's side pane by the detail width on every reload, compounding toward zero.
- `_dockedEditorSizeBeforeHide` is captured on hide **only for "Hide Editor"** (detail/auxiliary bar still visible, so the editor node stays visible at a real user-chosen width). When the **whole** side pane closes (auxiliary bar also hidden — e.g. **Toggle Side Panel** or the last-tab close, where `setEditorHidden(true)` runs with `partVisibility.auxiliaryBar === false`), the editor grid node collapses to `0px`, so capturing it would restore a bogus/cramped width; instead `_dockedEditorSizeBeforeHide` is cleared and the stale sidebar-collapse grow snapshots (`_editorSizeGrownForSidebarHide` / `_detailWidthGrownForSidebarHide`) are dropped, so reopening falls through to the 60%-of-window split. Because the split is computed from the full window width (not the remaining main area), reopening the side pane is a generous width rather than the cramped node a captured `0px` (or a stale pre-collapse snapshot) would restore.
- The shared editor title's inline layout cluster orders maximize/restore before the Hide Editor chevron, followed by the detail-panel toggle. The detail-panel toggle is conditional (shown only when the active tab is Changes or Files, i.e. hidden for Browser/Search tabs, which have no detail). No chevron is shown while the editor is hidden; opening a file or diff from the detail panel reveals the editor again. If the detail-panel toggle hides the detail while editor content is hidden, it reveals the editor content instead of leaving the pane empty; **Toggle Side Panel** remains the separate action that can hide both.
- Changes opens as a **custom `SessionChangesEditor`** (the multi-diff editor; in single-pane its *Branch Changes* dropdown + diff-stats + primary actions render in the full-width header part above, so the editor itself is header-less and the diff fills the pane), and clicking a Branch Changes file always reveals that file in this multi-diff editor (ignoring `sessions.changes.openSingleFileDiff` and the Alt inversion used by the standard layout). The auxiliary bar's composite tab strip + title are hidden, and `DetailPanelController` maps the active editor tab to the detail container (Changes → files + Checks, File → Explorer, Browser → hidden). Activating a File or Changes editor reveals the matching detail panel once; after that, an explicit detail-panel hide is respected until the active editor changes. Browser-driven hides are transient: switching back to File or Changes re-opens the detail panel.
- Closing the last editor tab hides both the editor content and the docked detail panel, leaving the Agents window chat-only. Opening any tab reveals the editor part again, and `DetailPanelController` restores the matching detail content for File/Changes tabs.
- **Editor-area tab collapse:** when the editor area is hidden (detail-only), the single-pane controller closes **every non-docked** editor tab (anything not `instanceof DockedEditorInput`) so only the docked Changes and Files tabs remain, capturing each closable one's untyped input **and tab index** (`editor.toUntyped()`); when the editor area is shown again the captured ones are reopened **at their original positions** (`SinglePaneEditorAreaCollapseStrategy._collapseNonManagedTabs` / `_restoreCollapsedTabs`, registered by `SinglePaneLayoutController._registerAuxiliaryControllers`). It is serialized on the shared docked-tab `Sequencer`, skipped during a layout-driven restore (`ISinglePaneLayoutContext.isRestoringSessionLayout`), and the capture is dropped on a session change. Non-restorable tabs (e.g. an **untitled Search editor**, whose `toUntyped()` returns `undefined`) are still closed but not restored; dirty editors are closed too (the workbench save/confirm flow applies), so they don't linger in a "closed" editor area.
- While a new (uncreated) workspace session view is active, the editor content is kept hidden **continuously** so the Files detail panel and editor tab bar remain visible without showing editor content by default. The rule is **level-triggered** on the active editor + editor-part visibility (in `singlePaneLayoutController.ts`): it hides the editor whenever the active editor is **not real content** (a `FileEditorInput` for a real file or a `BrowserEditorInput`), treating the managed empty landing tab (`EmptyFileEditorInput`) and "no active editor" as not real content. Because it re-reads visibility + active editor, any spurious reveal (a session-switch working-set restore, a layout race, the 60%-of-window split) is **re-hidden** — so reopening a new session after visiting a created session keeps the editor closed. While there is no real content the width-based reveal-sync is also suppressed (`setSuppressDockedEditorRevealSync(true)`), so sidebar-collapse, grid relayout, and grid-sash drags never re-reveal the editor there. Once a real file/diff is the active editor the hide **short-circuits** (and the suppress flag clears), so a real open (via `onWillOpenEditor` → `setEditorHidden(false)`) or the detail-panel toggle reveals it and sticks. On submit, a Changes tab is added and the Changes detail is shown, but the editor content stays closed. The auto-managed Changes and File tabs never reveal the editor content.
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
- **Chat / New Chat views** — hosted inside each `SessionView` in the Sessions Part, registered via `IChatViewFactory` from `contrib/chat/`

All session-window contributions use `WindowVisibility.Sessions` to only appear in the Agents Window.

---

## 9. Lifecycle

1. `constructor()` → `startup()` → `initServices()` → `initLayout()`
2. `renderWorkbench()` — creates DOM and parts (editor part created hidden)
3. `createWorkbenchLayout()` — builds the workbench grid
4. `createWorkbenchManagement()` — eagerly creates the welcome/setup service. Wiring of the Sessions Part lives in `SessionsService` (an eager singleton): it owns the single reconcile autorun that reads `ISessionsService.visibleSessions` and calls `SessionsPartService.updateVisibleSessions(...)`, and it observes its own `activeSession` (the active visible slot) to move keyboard focus into that session's view via `SessionsPartService.focusSession` (guarded so it does not steal focus from a session the user is already interacting with). The part itself is a passive renderer; focus is a pure view concern — the management service never reaches into the part.
5. `layout()` → `restore()` — opens default view containers for visible parts

**Initial part visibility:** Sidebar ✅, Sessions Part ✅, Auxiliary Bar ✅, Editor ❌, Panel ❌

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

The Changes view's body is a vertical `SplitView` of File Changes, Other Files, and Checks. Other Files is the flexible middle pane: while it is expanded, File Changes is capped to its content height and Checks is capped to its checks content height, so Other Files receives the remaining space; when Other Files is hidden or collapsed, File Changes receives the remaining space after Checks reaches its content height. When File Changes has no changed files, it keeps a 140px minimum height for the empty state.

**Editor maximized:** While the editor area is maximized (`IAgentWorkbenchLayoutService.isEditorMaximized()`), the Changes view is always shown in the auxiliary bar, **irrespective of the session's previous or saved state**. This is driven directly from the auxiliary-bar sync autorun, so it holds across session changes and changes-state updates while maximized. The forced visibility is never captured as the session's per-session preference, so when the editor is un-maximized the autorun re-runs and restores the session's real auxiliary bar state.

`setEditorMaximized` (in `browser/workbench.ts`) treats maximize as a fully reversible state: on entering it snapshots the editor part's size and the surrounding parts' visibility, and on exiting it restores the auxiliary bar to its pre-maximize visibility and resizes the editor part back to its captured width. Without this, the auxiliary bar that the controller forces visible while maximized would otherwise remain (and shrink the editor) after un-maximizing, so the editor would not return to its previous size.

### Panel

The panel (terminal / debug output) is hidden by default for all sessions. Each session independently tracks the user's last explicit show/hide action, and that state is restored on session switch.

### Editor Working Sets

Each session remembers which editors were open, regardless of `workbench.editor.useModal`: browser editors dock in the shared grid editor part even when other editors are forced modal (`useModal: 'all'`), so their tabs still need per-session tracking. On session switch the previous session's open editors are saved as a named working set and the incoming session's working set is restored. Archived or deleted sessions have their working sets removed.

A session also remembers whether its editor part was hidden (e.g. the user closed the Side Panel while keeping editors open). Restoring such a session keeps the editor part hidden rather than forcing it back open with the working set.

This is coordinated carefully: the active session observable is updated before the workspace folders update, so `LayoutController` waits until the workspace folders reflect the new session before applying the working set (to avoid restoring editors into the wrong workspace).

---

## 11. CSS

The workbench root element has class `agent-sessions-workbench`. Visibility classes (`nosidebar`, `noauxiliarybar`, `nosessionspart`, `nopanel`) are toggled on the main container.

The shell background uses an accent-tinted radial gradient derived from `button.background`, with titlebar and sidebar wrappers transparent so the gradient reads continuously. High-contrast themes disable the gradient.
