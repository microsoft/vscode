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

### Agent Host Filter (Left)

When multiple remote agent hosts are known, a dropdown pill in the left toolbar scopes the workbench to a specific host. When no hosts are known the pill acts as a re-discover trigger.

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

- A **session header** at the top ([browser/parts/sessionHeader.ts](src/vs/sessions/browser/parts/sessionHeader.ts)) — the session status icon + title, a meta row (the contributed workspace folder / changes / pull request buttons), and the session toolbars (Run, Open in VS Code, New Chat). The status icon ([browser/sessionStatusIcon.ts](src/vs/sessions/browser/sessionStatusIcon.ts)) shows the live spinner/status glyph for in-progress / needs-input / error states; in terminal/default states the title shows the read/unread **dot indicator** (filled link-colored dot when unread, small muted dot when read) — neither the session type icon nor the PR icon is shown in the title, since the pull request is surfaced in the meta row instead. (The status icon's `completedStateIcon` argument is generic: the header passes nothing so it falls back to the dot indicator, while the sessions list still passes the PR icon.) The meta row hosts a generic `Menus.SessionHeaderMeta` toolbar that any feature can contribute actions into; by default each contributed action renders as a consistent compact secondary `Button` with an inline `icon title` label via `SessionHeaderMetaActionViewItem` ([browser/parts/sessionHeaderMetaActionViewItem.ts](src/vs/sessions/browser/parts/sessionHeaderMetaActionViewItem.ts)) unless it registers its own action view item (spacing between the pills comes from the meta row's `gap`, no separator dot). The files view contributes the workspace folder pill (order -10, so it leads the row, gated by the per-view `SessionHasWorkspaceContext` key which `SessionView` sets when the session has a workspace label, with a custom action view item that extends `SessionHeaderMetaActionViewItem` to render the workspace icon — cloud / folder / worktree per workspace kind — plus the workspace label, and a hover showing the working-directory path and git branch, registered from `contrib/files/browser/workspaceFolderActions.ts`) that, when activated, opens the Files view. The changes view contributes the diff stats as a clickable menu item (order 0, gated by the per-view `SessionHasChangesContext` key, which `SessionView` sets from the session's **Branch Changes** changeset, with a custom action view item that extends `SessionHeaderMetaActionViewItem` to render the diff-multiple icon, a `{n} files` label, and the live `+insertions -deletions` counts, registered via `IActionViewItemService` from `contrib/changes/browser/changesActions.ts`) that, when activated, opens the multi-file diff editor for the session. The pill always reflects the **Branch Changes** changeset (the branch-vs-base diff) — located in `IActiveSession.changesets` by the shared `BRANCH_CHANGES_CHANGESET_ID` (`services/sessions/common/session.ts`), falling back to `IActiveSession.changes` when absent — so it is independent of whichever changeset the Changes view currently has selected. The GitHub contribution similarly contributes a pull request button (order 1, so it follows the changes button) showing the PR icon + `#<number>` (gated by the per-view `SessionHasPullRequestContext` key, which `SessionView` sets from the session's GitHub info, with a custom action view item that extends `SessionHeaderMetaActionViewItem` to render the live `#<number>` as its label, registered from `contrib/github/browser/pullRequestActions.ts`) that, when activated, opens the pull request on GitHub; its leading icon reads `gitHubInfo.pullRequest.icon` and renders its themed color (set as an inline `color` with `!important` priority) so the glyph reflects the live PR state; its hover is owned by the GitHub contribution and shows the repository link/date, PR title, up to three lines of description, and target/source branch pills. Visible once the bound session is created. It is also the drag handle for the session. Right-clicking the header opens `Menus.SessionHeaderContext`, which surfaces pin view / close (`1_view`), rename (`2_edit`), and mark read / unread (`3_read`). The built-in rename action is registered from `contrib/sessions/browser/sessionsActions.ts` and uses `ISessionsPartService` to find the matching `SessionView`, which delegates to the header's inline rename control.
- A **chat composite bar** below the header ([browser/parts/chatCompositeBar.ts](src/vs/sessions/browser/parts/chatCompositeBar.ts)) — the chat tab strip. Visibility tracks the number of **open chats**: it is shown as soon as the session has more than one open chat (**including in-composer draft chats**) and hidden again when chats are removed back down to just the main chat. The strip's own trailing **New Chat** action follows this visibility. The header's **New Chat** action is shown while the tab strip is hidden (a single open chat); once the strip is shown (more than one open chat, including drafts) the strip's trailing **New Chat** action offers it instead. The **New Chat** and **Conversations** controls are therefore split across the header and the tab strip on the same `SessionHasMultipleOpenChatsContext` boundary: the **Conversations** menu appears once the session has more than one **committed (non-draft)** chat — in the session header while the tab strip is hidden, and in the **chat tab bar action menu** at the end of the tab strip (`Menus.SessionChatTabBar`, rendered by the chat composite bar) once the strip is shown. While the tab strip is shown the chat tabs are keyboard-navigable from the active session: `Ctrl/Cmd+Shift+]` / `Ctrl/Cmd+Shift+[` go to the next / previous chat (wrapping), `Ctrl/Cmd+W` closes the active chat tab (deleting an in-composer draft, hiding a committed chat) instead of the session — the same command (`sessions.chatCompositeBar.closeChat`) is contributed to the per-tab `Menus.SessionChatTab`, which the chat tab strip renders as each non-main tab's close button (forwarding the tab's chat as the action argument), and `Ctrl+Tab` / `Ctrl+Shift+Tab` open a **chat switcher** — a no-input, editor-switcher (MRU) quick pick over the session's **open** chats (skipping in-composer drafts), each shown with a chat icon (hold the modifier, press `Tab` to cycle, release to select), winning over the session-history secondary on that chord while the session has multiple open chats and falling back to session navigation otherwise (and to the editor's own `Ctrl+Tab` switcher while a quick pick is already open, since the open chords are gated on `inQuickOpen` negated); the **Go to Chat in Session** palette command (`sessions.showChatsPicker`, `Ctrl/Cmd+Shift+O`, gated on more than one committed chat) opens a **searchable** variant that additionally lists **Closed** chats in a separate group (selecting one reopens it) — these commands (`sessions.chatCompositeBar.navigateNextChat` / `navigatePreviousChat` / `closeChat` and `sessions.showChatsPicker` in `contrib/sessions/browser/sessionsActions.ts`) outrank the session-level navigation/close chords via a higher keybinding weight and are gated on `SessionHasMultipleOpenChatsContext` / `SessionActiveChatIsClosableContext`.
- A **chat view** below the bars, swapped in/out based on session state.
- A floating toolbar overlay ([browser/parts/sessionHeader.ts](src/vs/sessions/browser/parts/sessionHeader.ts), `SessionViewFloatingToolbar`) shown for not-yet-created sessions in place of the header.

The header and the composite bar are deliberately separate widgets: the header represents the session identity/actions and is always present, while the tab strip is a per-chat navigation concern that appears (and then stays, per the sticky rule above) once a session has multiple chats or a diverged default-chat title. They share visual tokens via `applySessionBarThemeColors` ([browser/parts/sessionBarStyles.ts](src/vs/sessions/browser/parts/sessionBarStyles.ts)) and stylesheet ([browser/parts/media/chatCompositeBar.css](src/vs/sessions/browser/parts/media/chatCompositeBar.css)). `SessionView` sums each widget's reported height to lay out the chat view below them. The header and tab strip are centered and capped to 990px via their own CSS classes (`.chat-composite-bar.session-header-bar` / `.chat-composite-bar.session-chat-tabs-bar` in [chatCompositeBar.css](src/vs/sessions/browser/parts/media/chatCompositeBar.css)). The chat view itself is still laid out at full session width so its scrollable viewport (and scrollbar) stays flush to the far-right edge; only the inner chat content (message/input cards, via `.interactive-item-container`, capped to 950px in [browser/media/style.css](src/vs/sessions/browser/media/style.css)) is width-constrained and centered via CSS.

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

When the editor part is shown in the grid (not as a modal), its title toolbar (`MenuId.EditorTitleLayout`, right of the tabs) hosts layout actions registered in `contrib/editor/browser/editor.contribution.ts`, ordered left-to-right as: open in modal editor, **maximize / restore editor area**, a single **Toggle Secondary Side Bar** action for the auxiliary bar, and **close editor area**. The auxiliary-bar toggle sits to the right of maximize/restore because it changes the right-hand side of the layout. It reuses the core `workbench.action.toggleAuxiliaryBar` command (already registered in the agents window by the workbench auxiliary bar part, and available in the Command Palette under **View**) surfaced through two `when`-gated menu items in `browser/layoutActions.ts` so the icon flips without rendering a checked/highlighted state: the `right-panel-show` codicon shows when the auxiliary bar is hidden (`AuxiliaryBarVisibleContext` negated, click to show) and the `right-panel-hide` codicon shows when it is visible (click to hide).

When the auxiliary bar is hidden the editor becomes the rightmost card and expands into the freed space; the workbench's 10px right gutter still applies, and a `.noauxiliarybar` rule in `browser/media/style.css` restores the editor's right border and right corner radii so it keeps its card appearance.

The Toggle Secondary Side Bar action collapses or restores the secondary side bar while the editor stays open. When a session's editor working set is restored on session switch, the editor part is revealed programmatically and the session's saved auxiliary bar visibility is honored (a side bar the user hid for a session stays hidden when returning to it).

The main editor part can be explicitly revealed for workflows that target it directly.

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

**Editor maximized:** While the editor area is maximized (`IAgentWorkbenchLayoutService.isEditorMaximized()`), the Changes view is always shown in the auxiliary bar, **irrespective of the session's previous or saved state**. This is driven directly from the auxiliary-bar sync autorun, so it holds across session changes and changes-state updates while maximized. The forced visibility is never captured as the session's per-session preference, so when the editor is un-maximized the autorun re-runs and restores the session's real auxiliary bar state.

`setEditorMaximized` (in `browser/workbench.ts`) treats maximize as a fully reversible state: on entering it snapshots the editor part's size and the surrounding parts' visibility, and on exiting it restores the auxiliary bar to its pre-maximize visibility and resizes the editor part back to its captured width. Without this, the auxiliary bar that the controller forces visible while maximized would otherwise remain (and shrink the editor) after un-maximizing, so the editor would not return to its previous size.

### Panel

The panel (terminal / debug output) is hidden by default for all sessions. Each session independently tracks the user's last explicit show/hide action, and that state is restored on session switch.

### Editor Working Sets

When `workbench.editor.useModal` is not `'all'`, each session remembers which editors were open. On session switch the previous session's open editors are saved as a named working set and the incoming session's working set is restored. Archived or deleted sessions have their working sets removed.

A session also remembers whether its editor part was hidden (e.g. the user closed the Side Panel while keeping editors open). Restoring such a session keeps the editor part hidden rather than forcing it back open with the working set.

This is coordinated carefully: the active session observable is updated before the workspace folders update, so `LayoutController` waits until the workspace folders reflect the new session before applying the working set (to avoid restoring editors into the wrong workspace).

---

## 11. CSS

The workbench root element has class `agent-sessions-workbench`. Visibility classes (`nosidebar`, `noauxiliarybar`, `nosessionspart`, `nopanel`) are toggled on the main container.

The shell background uses an accent-tinted radial gradient derived from `button.background`, with titlebar and sidebar wrappers transparent so the gradient reads continuously. High-contrast themes disable the gradient.
