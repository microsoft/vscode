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
├── aiCustomizationDebugPanel.ts                # Debug diagnostics panel
├── aiCustomizationWorkspaceService.ts          # Core VS Code workspace service impl
├── customizationCreatorService.ts              # AI-guided creation flow
├── mcpListWidget.ts                            # MCP servers section
├── aiCustomizationIcons.ts                     # Icons
└── media/
    └── aiCustomizationManagement.css

src/vs/workbench/contrib/chat/common/
└── aiCustomizationWorkspaceService.ts          # IAICustomizationWorkspaceService + IStorageSourceFilter
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
├── aiCustomizationWorkspaceService.ts          # Sessions workspace service override
└── promptsService.ts                           # AgenticPromptsService (CLI user roots)
src/vs/sessions/contrib/sessions/browser/
├── customizationCounts.ts                      # Source count utilities (type-aware)
└── customizationsToolbar.contribution.ts       # Sidebar customization links
```

### IAICustomizationWorkspaceService

The `IAICustomizationWorkspaceService` interface controls per-window behavior:

| Property / Method | Core VS Code | Sessions Window |
|----------|-------------|----------|
| `managementSections` | All sections except Models | Same minus MCP |
| `getStorageSourceFilter(type)` | All sources, no user root filter | Per-type (see below) |
| `isSessionsWindow` | `false` | `true` |
| `activeProjectRoot` | First workspace folder | Active session worktree |

### IStorageSourceFilter

A unified per-type filter controlling which storage sources and user file roots are visible.
Replaces the old `visibleStorageSources`, `getVisibleStorageSources(type)`, and `excludedUserFileRoots`.

```typescript
interface IStorageSourceFilter {
  sources: readonly PromptsStorage[];         // Which storage groups to display
  includedUserFileRoots?: readonly URI[];     // Allowlist for user roots (undefined = all)
}
```

The shared `applyStorageSourceFilter()` helper applies this filter to any `{uri, storage}` array.

**Sessions filter behavior by type:**

| Type | sources | includedUserFileRoots |
|------|---------|----------------------|
| Hooks | `[local]` | N/A |
| Prompts | `[local, user]` | `undefined` (all roots) |
| Agents, Skills, Instructions | `[local, user]` | `[~/.copilot, ~/.claude, ~/.agents]` |

**Core VS Code:** All types use `[local, user, extension, plugin]` with no user root filter.

### AgenticPromptsService (Sessions)

Sessions overrides `PromptsService` via `AgenticPromptsService` (in `promptsService.ts`):

- **Discovery**: `AgenticPromptFilesLocator` scopes workspace folders to the active session's worktree
- **Creation targets**: `getSourceFolders()` override replaces VS Code profile user roots with `~/.copilot/{subfolder}` for CLI compatibility
- **Hook folders**: Falls back to `.github/hooks` in the active worktree

### Count Consistency

`customizationCounts.ts` uses the **same data sources** as the list widget's `loadItems()`:

| Type | Data Source | Notes |
|------|-------------|-------|
| Agents | `getCustomAgents()` | Parsed agents, not raw files |
| Skills | `findAgentSkills()` | Parsed skills with frontmatter |
| Prompts | `getPromptSlashCommands()` | Filters out skill-type commands |
| Instructions | `listPromptFiles()` + `listAgentInstructions()` | Includes AGENTS.md, CLAUDE.md etc. |
| Hooks | `listPromptFiles()` | Raw hook files |

### Debug Panel

Toggle via Command Palette: "Toggle Customizations Debug Panel". Shows a 4-stage pipeline view:

1. **Raw PromptsService data** — per-storage file lists + type-specific extras
2. **After applyStorageSourceFilter** — what was removed and why
3. **Widget state** — allItems vs displayEntries with group counts
4. **Source/resolved folders** — creation targets and discovery order

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
