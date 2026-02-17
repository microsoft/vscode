---
name: sessions
description: Agent Sessions window architecture — covers the sessions-first app, layering, folder structure, chat widget, menus, contributions, entry points, and development guidelines. Use when implementing features or fixing issues in the Agent Sessions window.
---

When working on the Agent Sessions window (`src/vs/sessions/`), always follow these guidelines:

## 1. Read the Specification Documents First

The `src/vs/sessions/` directory contains authoritative specification documents. **Always read the relevant spec before making changes.**

| Document | Path | Covers |
|----------|------|--------|
| Layer spec | `src/vs/sessions/README.md` | Layering rules, dependency constraints, folder conventions |
| Layout spec | `src/vs/sessions/LAYOUT.md` | Grid structure, part positions, sizing, CSS classes, API reference |
| AI Customizations | `src/vs/sessions/AI_CUSTOMIZATIONS.md` | AI customization editor and tree view design |
| Chat Widget | `src/vs/sessions/browser/widget/AGENTS_CHAT_WIDGET.md` | Chat widget wrapper architecture, deferred session creation, option delivery |
| AI Customization Mgmt | `src/vs/sessions/contrib/aiCustomizationManagement/browser/SPEC.md` | Management editor specification |
| AI Customization Tree | `src/vs/sessions/contrib/aiCustomizationTreeView/browser/SPEC.md` | Tree view specification |

If you modify the implementation, you **must** update the corresponding spec to keep it in sync. Update the Revision History table at the bottom of `LAYOUT.md` with a dated entry.

## 2. Architecture Overview

### 2.1 Layering

```
vs/base          ← Foundation utilities
vs/platform      ← Platform services
vs/editor        ← Text editor core
vs/workbench     ← Standard VS Code workbench
vs/sessions      ← Agent Sessions window (this layer)
```

**Key constraint:** `vs/sessions` may import from `vs/workbench` and all layers below it. `vs/workbench` must **never** import from `vs/sessions`.

### 2.2 Dependency Rules

- ✅ Import from `vs/base`, `vs/platform`, `vs/editor`, `vs/workbench`
- ✅ Import within `vs/sessions` (internal)
- ❌ Never import `vs/sessions` from `vs/workbench`
- Run `npm run valid-layers-check` to verify layering

### 2.3 How It Differs from VS Code

| Aspect | VS Code Workbench | Agent Sessions Window |
|--------|-------------------|----------------------|
| Layout | Configurable part positions | Fixed layout, no settings customization |
| Chrome | Activity bar, status bar, banner | Simplified — none of these |
| Primary UX | Editor-centric | Chat-first (Chat Bar is a primary part) |
| Editors | In the grid layout | Modal overlay above the workbench |
| Titlebar | Menubar, editor actions, layout controls | Session picker, run script, toggle sidebar/panel |
| Navigation | Activity bar with viewlets | Sidebar (views) + sidebar footer (account) |
| Entry point | `vs/workbench` workbench class | `vs/sessions/browser/workbench.ts` `Workbench` class |

## 3. Folder Structure

```
src/vs/sessions/
├── README.md                               # Layer specification (read first)
├── LAYOUT.md                               # Authoritative layout specification
├── AI_CUSTOMIZATIONS.md                    # AI customization design document
├── sessions.common.main.ts                 # Common (browser + desktop) entry point
├── sessions.desktop.main.ts                # Desktop entry point (imports all contributions)
├── common/                                 # Shared types and context keys
│   └── contextkeys.ts                      # ChatBar context keys
├── browser/                                # Core workbench implementation
│   ├── workbench.ts                        # Main Workbench class (implements IWorkbenchLayoutService)
│   ├── menus.ts                            # Agent sessions menu IDs (Menus export)
│   ├── layoutActions.ts                    # Layout toggle actions (sidebar, panel, auxiliary bar)
│   ├── paneCompositePartService.ts         # AgenticPaneCompositePartService
│   ├── style.css                           # Layout-specific styles
│   ├── widget/                             # Agent sessions chat widget
│   │   ├── AGENTS_CHAT_WIDGET.md           # Chat widget architecture doc
│   │   ├── agentSessionsChatWidget.ts      # Main wrapper around ChatWidget
│   │   ├── agentSessionsChatTargetConfig.ts # Observable target state
│   │   ├── agentSessionsTargetPickerActionItem.ts # Target picker for input toolbar
│   │   └── media/
│   └── parts/                              # Workbench part implementations
│       ├── parts.ts                        # AgenticParts enum
│       ├── titlebarPart.ts                 # Titlebar (3-section toolbar layout)
│       ├── sidebarPart.ts                  # Sidebar (with footer for account widget)
│       ├── chatBarPart.ts                  # Chat Bar (primary chat surface)
│       ├── auxiliaryBarPart.ts             # Auxiliary Bar (with run script dropdown)
│       ├── panelPart.ts                    # Panel (terminal, output, etc.)
│       ├── projectBarPart.ts              # Project bar (folder entries)
│       ├── editorModal.ts                  # Editor modal overlay
│       ├── agentSessionsChatInputPart.ts   # Chat input part adapter
│       ├── agentSessionsChatWelcomePart.ts # Welcome view (mascot + target buttons + pickers)
│       └── media/                          # Part CSS files
├── electron-browser/                       # Desktop-specific entry points
│   ├── sessions.main.ts                    # Desktop main bootstrap
│   ├── sessions.ts                         # Electron process entry
│   ├── sessions.html                       # Production HTML shell
│   └── sessions-dev.html                   # Development HTML shell
└── contrib/                                # Feature contributions
    ├── accountMenu/browser/                # Account widget for sidebar footer
    ├── aiCustomizationManagement/browser/  # AI customization management editor
    ├── aiCustomizationTreeView/browser/    # AI customization tree view sidebar
    ├── changesView/browser/                # File changes view
    ├── chat/browser/                       # Chat actions (run script, branch, prompts)
    ├── configuration/browser/              # Configuration overrides
    └── sessions/browser/                   # Sessions view, title bar widget, active session service
```

## 4. Layout

Use the `agent-sessions-layout` skill for detailed guidance on the layout. Key points:

### 4.1 Visual Layout

```
┌─────────┬───────────────────────────────────────────────────────┐
│         │                    Titlebar                           │
│         ├────────────────────────────────────┬──────────────────┤
│ Sidebar │              Chat Bar              │  Auxiliary Bar   │
│         ├────────────────────────────────────┴──────────────────┤
│         │                      Panel                            │
└─────────┴───────────────────────────────────────────────────────┘
```

- **Sidebar** spans full window height (root grid level)
- **Titlebar** is inside the right section
- **Chat Bar** is the primary interaction surface
- **Panel** is hidden by default (terminal, output, etc.)
- **Editor** appears as a **modal overlay**, not in the grid

### 4.2 Parts

| Part | Default Visibility | Notes |
|------|-------------------|-------|
| Titlebar | Always visible | 3-section toolbar (left/center/right) |
| Sidebar | Visible | Sessions view, AI customization tree |
| Chat Bar | Visible | Primary chat widget |
| Auxiliary Bar | Visible | Changes view, etc. |
| Panel | Hidden | Terminal, output |
| Editor | Hidden | Modal overlay, auto-shows on editor open |

**Not included:** Activity Bar, Status Bar, Banner.

### 4.3 Editor Modal

Editors appear as modal overlays (80% of workbench, min 400×300, max 1200×900). The modal auto-shows when an editor opens and auto-hides when all editors close. Click backdrop, press Escape, or click X to dismiss.

## 5. Chat Widget

The Agent Sessions chat experience is built around `AgentSessionsChatWidget` — a wrapper around the core `ChatWidget` that adds:

- **Deferred session creation** — the UI is interactive before any session resource exists; sessions are created on first message send
- **Target configuration** — observable state tracking which agent provider (Local, Cloud) is selected
- **Welcome view** — branded empty state with mascot, target buttons, option pickers, and input slot
- **Initial session options** — option selections travel atomically with the first request
- **Configurable picker placement** — pickers can appear in welcome view, input toolbar, or both

Read `browser/widget/AGENTS_CHAT_WIDGET.md` for the full architecture.

### Key classes:
- `AgentSessionsChatWidget` (`browser/widget/agentSessionsChatWidget.ts`) — main wrapper
- `AgentSessionsChatTargetConfig` (`browser/widget/agentSessionsChatTargetConfig.ts`) — reactive target state
- `AgentSessionsChatWelcomePart` (`browser/parts/agentSessionsChatWelcomePart.ts`) — welcome view
- `AgentSessionsChatInputPart` (`browser/parts/agentSessionsChatInputPart.ts`) — standalone input adapter

## 6. Menus

The agent sessions window uses **its own menu IDs** defined in `browser/menus.ts` via the `Menus` export. **Never use shared `MenuId.*` constants** from `vs/platform/actions` for agent sessions UI — use the `Menus.*` equivalents instead.

| Menu ID | Purpose |
|---------|---------|
| `Menus.TitleBarLeft` | Left toolbar (toggle sidebar) |
| `Menus.TitleBarCenter` | Not used directly (see CommandCenter) |
| `Menus.TitleBarRight` | Right toolbar (run script, open, toggle auxiliary bar) |
| `Menus.CommandCenter` | Center toolbar with session picker widget |
| `Menus.TitleBarControlMenu` | Submenu intercepted to render `SessionsTitleBarWidget` |
| `Menus.PanelTitle` | Panel title bar actions |
| `Menus.SidebarTitle` | Sidebar title bar actions |
| `Menus.SidebarFooter` | Sidebar footer (account widget) |
| `Menus.AuxiliaryBarTitle` | Auxiliary bar title actions |
| `Menus.AuxiliaryBarTitleLeft` | Auxiliary bar left title actions |
| `Menus.OpenSubMenu` | "Open..." split button (Open Terminal, Open in VS Code) |
| `Menus.ChatBarTitle` | Chat bar title actions |

## 7. Context Keys

Defined in `common/contextkeys.ts`:

| Context Key | Type | Purpose |
|-------------|------|---------|
| `activeChatBar` | `string` | ID of the active chat bar panel |
| `chatBarFocus` | `boolean` | Whether chat bar has keyboard focus |
| `chatBarVisible` | `boolean` | Whether chat bar is visible |

## 8. Contributions

Feature contributions live under `contrib/<featureName>/browser/` and are registered via imports in `sessions.desktop.main.ts` (desktop) or `sessions.common.main.ts` (browser-compatible).

### 8.1 Key Contributions

| Contribution | Location | Purpose |
|-------------|----------|---------|
| **Sessions View** | `contrib/sessions/browser/` | Sessions list in sidebar, session picker, active session service |
| **Title Bar Widget** | `contrib/sessions/browser/sessionsTitleBarWidget.ts` | Session picker in titlebar center |
| **Account Widget** | `contrib/accountMenu/browser/` | Account button in sidebar footer |
| **Run Script** | `contrib/chat/browser/runScriptAction.ts` | Run configured script in terminal |
| **Branch Chat Session** | `contrib/chat/browser/branchChatSessionAction.ts` | Branch a chat session |
| **Open in VS Code / Terminal** | `contrib/chat/browser/chat.contribution.ts` | Open worktree in VS Code or terminal |
| **Prompts Service** | `contrib/chat/browser/promptsService.ts` | Agentic prompts service override |
| **Changes View** | `contrib/changesView/browser/` | File changes in auxiliary bar |
| **AI Customization Editor** | `contrib/aiCustomizationManagement/browser/` | Management editor for prompts, hooks, MCP, etc. |
| **AI Customization Tree** | `contrib/aiCustomizationTreeView/browser/` | Sidebar tree for AI customizations |
| **Configuration** | `contrib/configuration/browser/` | Configuration overrides |

### 8.2 Service Overrides

The agent sessions window registers its own implementations for:

- `IPaneCompositePartService` → `AgenticPaneCompositePartService` (creates agent-specific parts)
- `IPromptsService` → `AgenticPromptsService` (scopes prompt discovery to active session worktree)
- `IActiveSessionService` → `ActiveSessionService` (tracks active session)

### 8.3 `WindowVisibility.Sessions`

Views and contributions that should only appear in the agent sessions window (not in regular VS Code) use `WindowVisibility.Sessions` in their registration.

## 9. Entry Points

| File | Purpose |
|------|---------|
| `sessions.common.main.ts` | Common entry — imports browser-compatible services, workbench contributions |
| `sessions.desktop.main.ts` | Desktop entry — imports desktop services, electron contributions, all `contrib/` modules |
| `electron-browser/sessions.main.ts` | Desktop bootstrap |
| `electron-browser/sessions.ts` | Electron process entry |
| `electron-browser/sessions.html` | Production HTML shell |
| `electron-browser/sessions-dev.html` | Development HTML shell |

## 10. Development Guidelines

### 10.1 Adding New Features

1. **Core workbench code** (layout, parts, services) → `browser/`
2. **Feature contributions** (views, actions, editors) → `contrib/<featureName>/browser/`
3. Register by importing in `sessions.desktop.main.ts` (or `sessions.common.main.ts` for browser-compatible)
4. Use `Menus.*` from `browser/menus.ts` for menu registrations — never shared `MenuId.*`
5. Use separate storage keys prefixed with `workbench.agentsession.*` or `workbench.chatbar.*`
6. Use agent session part classes, not standard workbench parts
7. Mark views with `WindowVisibility.Sessions` so they only appear in this window

### 10.2 Layout Changes

1. **Read `LAYOUT.md` first** — it's the authoritative spec
2. Use the `agent-sessions-layout` skill for detailed implementation guidance
3. Maintain fixed positions — no settings-based customization
4. Update `LAYOUT.md` and its Revision History after any changes
5. Preserve no-op methods for unsupported features (zen mode, centered layout, etc.)
6. Handle pane composite lifecycle when hiding/showing parts

### 10.3 Chat Widget Changes

1. **Read `browser/widget/AGENTS_CHAT_WIDGET.md` first**
2. Prefer composition over modifying core `ChatWidget` — add behavior in the wrapper
3. Use `IAgentChatTargetConfig` observable for target state, not direct session creation
4. Ensure `initialSessionOptions` travel atomically with the first request
5. Test both first-load (extension not yet activated) and new-session flows

### 10.4 AI Customization Changes

1. **Read `AI_CUSTOMIZATIONS.md` first** — it covers the management editor and tree view design
2. Lean on existing VS Code services (`IPromptsService`, `IMcpService`, `IChatService`)
3. Browser compatibility required — no Node.js APIs
4. Active worktree comes from `IActiveSessionService`

### 10.5 Validation

1. Check `VS Code - Build` task output for compilation errors before declaring work complete
2. Run `npm run valid-layers-check` for layering violations
3. Verify part visibility toggling (show/hide/maximize)
4. Test editor modal open/close behavior
5. Test sidebar footer renders with account widget
