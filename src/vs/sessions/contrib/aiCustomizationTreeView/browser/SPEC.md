# AI Customization Tree View Specification

## Overview

The AI Customization Tree View is a sidebar tree that groups AI customization files by type and storage. It is optimized for agent sessions and filters worktree items to the active session repository.

**Location:** `src/vs/sessions/contrib/aiCustomizationTreeView/browser/`

## Architecture

### Component Hierarchy

```
View Container (Sidebar)
└── AICustomizationViewPane
    └── WorkbenchAsyncDataTree
        ├── UnifiedAICustomizationDataSource
        ├── AICustomizationTreeDelegate
        └── Renderers (category, group, file)
```

### Tree Structure

```
ROOT
├── Custom Agents
│   ├── Workspace (N)
│   ├── User (N)
│   └── Extensions (N)
├── Skills
│   ├── Workspace (N)
│   ├── User (N)
│   └── Extensions (N)
├── Instructions
└── Prompts
```

### File Structure

```
aiCustomizationTreeView/browser/
├── aiCustomizationTreeView.ts
├── aiCustomizationTreeView.contribution.ts
├── aiCustomizationTreeViewViews.ts
├── aiCustomizationTreeViewIcons.ts
└── media/
    └── aiCustomizationTreeView.css
```

## Key Components

### AICustomizationViewPane

**Responsibilities:**
- Creates the tree and renderers.
- Auto-expands categories on load/refresh.
- Refreshes on prompt service changes, workspace changes, and active session changes.
- Updates `aiCustomization.isEmpty` based on total item count.
- Worktree scoping comes from the agentic prompt service override.

### UnifiedAICustomizationDataSource

**Responsibilities:**
- Caches per-type data for efficient expansion.
- Builds storage groups only when items exist.
- Labels groups with counts (e.g., "Workspace (3)").
- Uses `findAgentSkills()` to derive skill names.
 - Logs errors via `ILogService` when fetching children fails.

## Actions

### View Title

- **Refresh** reloads data and re-expands categories.
- **Collapse All** collapses the tree.

### Context Menu (file items)

- Open
- Run Prompt (prompts only)

## Context Keys

- `aiCustomization.isEmpty` is set based on total items for welcome content.
- `aiCustomizationItemType` controls prompt-specific context menu actions.

## Accessibility

- Category/group/file items provide aria labels.
- File item aria labels include description when present.

## Integration Points

- `IPromptsService` for agents/skills/instructions/prompts.
- `IActiveSessionService` for worktree filtering.
- `IWorkspaceContextService` to refresh on workspace changes.
- `ILogService` for error reporting during data fetch.

## Service Alignment (Required)

AI customizations must lean on existing VS Code services with well-defined interfaces. The tree view should rely on the prompt discovery service rather than scanning the file system directly.

Required services to prefer:
- Prompt discovery and metadata: [src/vs/workbench/contrib/chat/common/promptSyntax/service/promptsService.ts](../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.ts)
- Active session scoping for worktrees: [src/vs/workbench/contrib/chat/browser/agentSessions/agentSessionsService.ts](../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsService.ts)

## Notes

- Storage groups are labeled with counts; icons are not shown for group rows.
- Skills display the frontmatter name when available, falling back to the folder name.
- Creation actions are intentionally centralized in the Management Editor.
- Refresh clears cached data before rebuilding the tree.

---

*This specification documents the AI Customization Tree View in `src/vs/sessions/contrib/aiCustomizationTreeView/browser/`.*
