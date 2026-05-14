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
┌─────────┬────────────────────────────────────────────────────────────────────┐
│         │                            Titlebar                                │
│         ├───────────────────────────┬────────────────┬───────────────────────┤
│ Sidebar │         Chat Bar          │ Editor (hid.) │     Auxiliary Bar     │
│         ├───────────────────────────┴────────────────┴───────────────────────┤
│         │                              Panel                                 │
└─────────┴────────────────────────────────────────────────────────────────────┘
```

Editors open as modal overlays via `ModalEditorPart`. The main editor part exists in the grid but is hidden by default.

### 2.1 Parts

| Part | Position | Default Visibility | Purpose |
|------|----------|-------------------|---------|
| Titlebar | Top of right section | Always visible | Session picker, toggle actions, account widget |
| Sidebar | Left, full height | Visible | Sessions list |
| Chat Bar | Center of right section | Visible | Main chat interface |
| Editor | In grid, beside Chat Bar | Hidden | Shown for explicit editor workflows |
| Auxiliary Bar | Right side | Visible | Changes view, file tree |
| Panel | Below Chat Bar + Aux Bar | Hidden | Terminal, debug output |

### 2.2 Grid Tree

```
Orientation: HORIZONTAL (root)
├── Sidebar (leaf, 300px default)
└── Right Section (VERTICAL)
    ├── Titlebar (leaf)
    ├── Top Right (HORIZONTAL)
    │   ├── Chat Bar (leaf, remaining width)
    │   ├── Editor (leaf, hidden by default)
    │   └── Auxiliary Bar (leaf, 380px default)
    └── Panel (leaf, 300px default, hidden)
```

The sidebar spans full window height at the root level. All other parts are within the right section.

---

## 3. Titlebar

The titlebar is a standalone implementation (`TitlebarPart`) — not extending `BrowserTitlebarPart`. It has three menu-driven sections:

| Section | Menu ID | Content |
|---------|---------|---------|
| Left | `Menus.TitleBarLeft` | Toggle sidebar, agent host filter |
| Center | `Menus.CommandCenter` | Session picker widget |
| Right | `Menus.TitleBarRight` | Run script (split button), Open Terminal/VS Code, toggle auxiliary bar, account widget |

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

---

## 4. Editor Modal

Editors open as modal overlays rather than occupying grid space. The configuration `workbench.editor.useModal: 'all'` redirects all editor opens (without an explicit preferred group) to `ModalEditorPart`.

| Trigger | Behavior |
|---------|----------|
| Editor opens (no explicit group) | Opens in modal overlay |
| All editors closed / Escape / backdrop click | Modal closes and is disposed |

The main editor part can be explicitly revealed for workflows that target it directly.

---

## 5. Feature Support

| Feature | Supported | Notes |
|---------|-----------|-------|
| Sidebar / Aux Bar / Panel toggle | ✅ | Fixed positions (sidebar: left, panel: bottom) |
| Maximize Panel | ✅ | Excludes titlebar |
| Resize Parts | ✅ | Via grid sash or programmatic API |
| Zen Mode / Centered Layout / Menu Bar Toggle | ❌ No-op | — |
| Maximize Auxiliary Bar | ❌ No-op | — |

---

## 6. Parts Architecture

Parts extend `AbstractPaneCompositePart` (except titlebar which extends `Part`) and are instantiated eagerly by `AgenticPaneCompositePartService`, which replaces the standard `IPaneCompositePartService`.

Key differences from standard workbench parts:
- **No activity bar** — account widget lives in the sidebar footer
- **Fixed composite bar** — position is always `Title`; sidebar and chat bar hide their composite bars
- **Card appearance** — Chat Bar, Auxiliary Bar, and Panel render as cards with rounded borders and margins; Sidebar is flush
- **Separate storage keys** — each part uses `workbench.agentsession.*` keys to avoid conflicts with regular workbench state
- **Sidebar footer** — a menu-driven toolbar below the sessions list, hosting the account widget
- **macOS traffic lights** — sidebar includes a spacer (70px) for window controls when using custom titlebar

---

## 7. Contributions

Contributions are registered via module imports in entry points (`sessions.common.main.ts`, `sessions.desktop.main.ts`).

Key views:
- **Sessions View** — sidebar, shows sessions grouped by workspace with pinned section
- **Changes View** — auxiliary bar, shows file changes for the active session
- **Chat** — chat bar, main chat interface with session type/workspace pickers

All session-window contributions use `WindowVisibility.Sessions` to only appear in the Agents Window.

---

## 8. Lifecycle

1. `constructor()` → `startup()` → `initServices()` → `initLayout()`
2. `renderWorkbench()` — creates DOM and parts (editor part created hidden)
3. `createWorkbenchLayout()` — builds the grid
4. `layout()` → `restore()` — opens default view containers for visible parts

**Initial part visibility:** Sidebar ✅, Chat Bar ✅, Auxiliary Bar ✅, Editor ❌, Panel ❌

---

## 9. Per-Session Layout State

`LayoutController` (`contrib/layout/browser/sessionLayoutController.ts`) manages layout state as the user switches between sessions. All state is persisted to workspace storage so it survives restarts.

### Auxiliary Bar

Each session independently remembers whether the auxiliary bar is visible and which view container is active. When switching to a session, the saved state is restored. When switching away, the current state is captured.

**Auto-reveal on changes:** When a chat turn completes and new file changes appeared (changes count was zero when the turn was submitted, non-zero when it ends), the auxiliary bar is automatically revealed to show the Changes view. This lets the user see what the agent modified without manual intervention. On mobile the auto-reveal is suppressed to avoid disruptive layout shifts.

**Default view on new sessions:** An untitled session always opens the Files view. A session with a workspace but no changes defaults to the Files view; once changes exist it defaults to the Changes view.

### Panel

The panel (terminal / debug output) is hidden by default for all sessions. Each session independently tracks the user's last explicit show/hide action, and that state is restored on session switch.

### Editor Working Sets

When `workbench.editor.useModal` is not `'all'`, each session remembers which editors were open. On session switch the previous session's open editors are saved as a named working set and the incoming session's working set is restored. Archived or deleted sessions have their working sets removed.

This is coordinated carefully: the active session observable is updated before the workspace folders update, so `LayoutController` waits until the workspace folders reflect the new session before applying the working set (to avoid restoring editors into the wrong workspace).

---

## 10. CSS

The workbench root element has class `agent-sessions-workbench`. Visibility classes (`nosidebar`, `noauxiliarybar`, `nochatbar`, `nopanel`) are toggled on the main container.

The shell background uses an accent-tinted radial gradient derived from `button.background`, with titlebar and sidebar wrappers transparent so the gradient reads continuously. High-contrast themes disable the gradient.