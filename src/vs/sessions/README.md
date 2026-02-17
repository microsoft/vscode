# vs/sessions — Agentic Sessions Window Layer

## Overview

The `vs/sessions` layer hosts the implementation of the **Agentic Window**, a dedicated workbench experience optimized for agent session workflows. This is a distinct top-level layer within the VS Code architecture, sitting alongside `vs/workbench`.

## Architecture

### Layering Rules

```
vs/base          ← Foundation utilities
vs/platform      ← Platform services
vs/editor        ← Text editor core
vs/workbench     ← Standard workbench
vs/sessions      ← Agentic window (this layer)
```

**Key constraint:** `vs/sessions` may import from `vs/workbench` (and all layers below it), but `vs/workbench` must **never** import from `vs/sessions`. This ensures the standard workbench remains independent of the agentic window implementation.

### Allowed Dependencies

| From `vs/sessions` | Can Import |
|--------------------|------------|
| `vs/base/**` | ✅ |
| `vs/platform/**` | ✅ |
| `vs/editor/**` | ✅ |
| `vs/workbench/**` | ✅ |
| `vs/sessions/**` | ✅ (internal) |

| From `vs/workbench` | Can Import |
|----------------------|------------|
| `vs/sessions/**` | ❌ **Forbidden** |

### Folder Structure

The `vs/sessions` layer follows the same layering conventions as `vs/workbench`:

```
src/vs/sessions/
├── README.md                           ← This specification
├── LAYOUT.md                           ← Layout specification for the agentic workbench
├── AI_CUSTOMIZATIONS.md                ← AI customization design document
├── sessions.common.main.ts             ← Common (browser + desktop) entry point
├── sessions.desktop.main.ts            ← Desktop entry point
├── common/                             ← Shared types and context keys
│   └── contextkeys.ts                  ← ChatBar context keys
├── browser/                            ← Core workbench implementation
│   ├── workbench.ts                    ← Main workbench layout (Workbench class)
│   ├── layoutActions.ts                ← Layout toggle actions
│   ├── menus.ts                        ← Menu IDs for agent sessions menus (Menus export)
│   ├── paneCompositePartService.ts     ← AgenticPaneCompositePartService
│   ├── style.css                       ← Layout styles
│   ├── widget/                         ← Agent sessions chat widget
│   │   ├── AGENTS_CHAT_WIDGET.md       ← Chat widget architecture documentation
│   │   ├── agentSessionsChatWidget.ts  ← Main chat widget wrapper
│   │   ├── agentSessionsChatTargetConfig.ts ← Target configuration (observable)
│   │   ├── agentSessionsTargetPickerActionItem.ts ← Target picker for input toolbar
│   │   └── media/
│   │       └── agentSessionsChatWidget.css
│   └── parts/                          ← Workbench part implementations
│       ├── titlebarPart.ts             ← Simplified titlebar part & title service
│       ├── sidebarPart.ts              ← Sidebar part (with footer)
│       ├── auxiliaryBarPart.ts         ← Auxiliary bar part (with run script dropdown)
│       ├── panelPart.ts               ← Panel part
│       ├── chatBarPart.ts             ← Chat bar part
│       ├── projectBarPart.ts          ← Project bar part (folder entries)
│       ├── editorModal.ts             ← Editor modal overlay
│       ├── parts.ts                   ← AgenticParts enum
│       ├── agentSessionsChatInputPart.ts  ← Chat input part adapter
│       ├── agentSessionsChatWelcomePart.ts ← Chat welcome part
│       └── media/                     ← Part CSS
├── electron-browser/                   ← Desktop-specific entry points
│   ├── sessions.main.ts
│   ├── sessions.ts
│   ├── sessions.html
│   └── sessions-dev.html
├── contrib/                            ← Feature contributions
│   ├── accountMenu/browser/            ← Account menu widget and sidebar footer
│   │   └── account.contribution.ts
│   ├── aiCustomizationManagement/      ← AI customization management editor
│   │   └── browser/
│   ├── aiCustomizationTreeView/        ← AI customization tree view sidebar
│   │   └── browser/
│   ├── changesView/browser/            ← File changes view
│   │   ├── changesView.contribution.ts
│   │   └── changesView.ts
│   ├── chat/browser/                   ← Chat-related actions and services
│   │   ├── chat.contribution.ts
│   │   ├── branchChatSessionAction.ts
│   │   ├── runScriptAction.ts
│   │   └── promptsService.ts
│   ├── configuration/browser/          ← Configuration contribution
│   │   └── configuration.contribution.ts
│   └── sessions/browser/              ← Sessions view and title bar widget
│       ├── sessions.contribution.ts
│       ├── sessionsViewPane.ts
│       ├── sessionsTitleBarWidget.ts
│       ├── activeSessionService.ts
│       └── media/
```

## What is the Agentic Window?

The Agentic Window (`Workbench`) provides a simplified, fixed-layout workbench tailored for agent session workflows. Unlike the standard VS Code workbench:

- **Fixed layout** — Part positions are not configurable via settings
- **Simplified chrome** — No activity bar, no status bar, no banner
- **Chat-first UX** — Chat bar is a primary part alongside sidebar and auxiliary bar
- **Modal editor** — Editors appear as modal overlays rather than in the main grid
- **Session-aware titlebar** — Titlebar shows active session with a session picker
- **Sidebar footer** — Account widget and sign-in live in the sidebar footer

See [LAYOUT.md](LAYOUT.md) for the detailed layout specification.

## Adding New Functionality

When adding features to the agentic window:

1. **Core workbench code** (layout, parts, services) goes under `browser/`
2. **Feature contributions** (views, actions, editors) go under `contrib/<featureName>/browser/`
3. Register contributions by importing them in `sessions.desktop.main.ts` (or `sessions.common.main.ts` for browser-compatible code)
4. Do **not** add imports from `vs/workbench` back to `vs/sessions`
5. Contributions can import from `vs/sessions/browser/` (core) and other `vs/sessions/contrib/*/` modules
6. Update the layout spec (`LAYOUT.md`) for any layout changes
