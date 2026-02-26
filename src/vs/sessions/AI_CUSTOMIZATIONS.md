# AI Customizations – Design Document

This document describes the AI customization experience: a management editor and tree view that surface customization items (agents, skills, instructions, prompts, hooks, MCP servers) across workspace, user, and extension storage.

## Architecture

### File Structure

The management editor lives in `vs/workbench` (shared between core VS Code and sessions):

```
src/vs/workbench/contrib/chat/browser/aiCustomization/
├── aiCustomizationManagement.contribution.ts   # Commands + context menus
├── aiCustomizationManagement.ts                # IDs + context keys
├── aiCustomizationManagementEditor.ts          # SplitView list/editor
├── aiCustomizationManagementEditorInput.ts     # Singleton input
├── aiCustomizationListWidget.ts                # Search + grouped list
├── aiCustomizationWorkspaceService.ts          # Core VS Code workspace service impl
├── customizationCreatorService.ts              # AI-guided creation flow
├── mcpListWidget.ts                            # MCP servers section
├── aiCustomizationIcons.ts                     # Icons
└── media/
    └── aiCustomizationManagement.css

src/vs/workbench/contrib/chat/common/
└── aiCustomizationWorkspaceService.ts          # IAICustomizationWorkspaceService interface
```

The tree view and overview live in `vs/sessions` (sessions window only):

```
src/vs/sessions/contrib/aiCustomizationTreeView/browser/
├── aiCustomizationTreeView.contribution.ts     # View + actions
├── aiCustomizationTreeView.ts                  # IDs + menu IDs
├── aiCustomizationTreeViewViews.ts             # Tree data source + view
├── aiCustomizationOverviewView.ts              # Overview view (counts + deep links)
└── media/
    └── aiCustomizationTreeView.css
```

Sessions-specific overrides:

```
src/vs/sessions/contrib/chat/browser/
└── aiCustomizationWorkspaceService.ts          # Sessions workspace service override
src/vs/sessions/contrib/sessions/browser/
├── customizationCounts.ts                      # Source count utilities
└── customizationsToolbar.contribution.ts       # Sidebar customization links
```

### IAICustomizationWorkspaceService

The `IAICustomizationWorkspaceService` interface controls per-window behavior:

| Property | Core VS Code | Sessions Window |
|----------|-------------|----------|
| `managementSections` | All sections except Models | Same |
| `visibleStorageSources` | workspace, user, extension, plugin | workspace, user only |
| `preferManualCreation` | `false` (AI generation primary) | `true` (file creation primary) |
| `activeProjectRoot` | First workspace folder | Active session worktree |

## Key Services

- **Prompt discovery**: `IPromptsService` — parsing, lifecycle, storage enumeration
- **MCP servers**: `IMcpService` — server list, tool access
- **Active worktree**: `IActiveSessionService` — source of truth for workspace scoping (sessions only)
- **File operations**: `IFileService`, `ITextModelService` — file and model plumbing

Browser compatibility is required — no Node.js APIs.

## Feature Gating

All commands and UI respect `ChatContextKeys.enabled` and the `chat.customizationsMenu.enabled` setting.

## Settings

Settings use the `chat.customizationsMenu.` namespace:

| Setting | Default | Description |
|---------|---------|-------------|
| `chat.customizationsMenu.enabled` | `true` | Show the Chat Customizations editor in the Command Palette |
