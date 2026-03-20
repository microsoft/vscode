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
├── aiCustomizationListWidget.ts                # Search + grouped list + harness toggle
├── aiCustomizationListWidgetUtils.ts           # List item helpers (truncation, etc.)
├── aiCustomizationDebugPanel.ts                # Debug diagnostics panel
├── aiCustomizationWorkspaceService.ts          # Core VS Code workspace service impl
├── customizationHarnessService.ts              # Core harness service impl (agent-gated)
├── customizationCreatorService.ts              # AI-guided creation flow
├── customizationGroupHeaderRenderer.ts         # Collapsible group header renderer
├── mcpListWidget.ts                            # MCP servers section (Extensions + Built-in groups)
├── pluginListWidget.ts                         # Agent plugins section
├── aiCustomizationIcons.ts                     # Icons
└── media/
    └── aiCustomizationManagement.css

src/vs/workbench/contrib/chat/common/
├── aiCustomizationWorkspaceService.ts          # IAICustomizationWorkspaceService + IStorageSourceFilter
└── customizationHarnessService.ts              # ICustomizationHarnessService + ISectionOverride + helpers
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
├── customizationHarnessService.ts              # Sessions harness service (CLI harness only)
└── promptsService.ts                           # AgenticPromptsService (CLI user roots)
src/vs/sessions/contrib/sessions/browser/
├── aiCustomizationShortcutsWidget.ts           # Shortcuts widget
├── customizationCounts.ts                      # Source count utilities (type-aware)
└── customizationsToolbar.contribution.ts       # Sidebar customization links
```

### IAICustomizationWorkspaceService

The `IAICustomizationWorkspaceService` interface controls per-window behavior:

| Property / Method | Core VS Code | Sessions Window |
|----------|-------------|----------|
| `managementSections` | All sections except Models | All sections except Models |
| `getStorageSourceFilter(type)` | Delegates to `ICustomizationHarnessService` | Delegates to `ICustomizationHarnessService` |
| `isSessionsWindow` | `false` | `true` |
| `activeProjectRoot` | First workspace folder | Active session worktree |

### ICustomizationHarnessService

A harness represents the AI execution environment that consumes customizations.
Storage answers "where did this come from?"; harness answers "who consumes it?".

The service is defined in `common/customizationHarnessService.ts` which also provides:
- **`CustomizationHarnessServiceBase`** — reusable base class handling active-harness state, the observable list, and `getStorageSourceFilter` dispatch.
- **`ISectionOverride`** — per-section UI customization: `commandId` (command invocation), `rootFile` + `label` (root-file creation), `typeLabel` (custom type name), `fileExtension` (override default), `rootFileShortcuts` (dropdown shortcuts).
- **Factory functions** — `createVSCodeHarnessDescriptor`, `createCliHarnessDescriptor`, `createClaudeHarnessDescriptor`. The VS Code harness receives `[PromptsStorage.extension]` as extras; CLI and Claude in core receive `[]` (no extension source). Sessions CLI receives `[BUILTIN_STORAGE]`.
- **Well-known root helpers** — `getCliUserRoots(userHome)` and `getClaudeUserRoots(userHome)` centralize the `~/.copilot`, `~/.claude`, `~/.agents` path knowledge.
- **Filter helpers** — `matchesWorkspaceSubpath()` for segment-safe subpath matching; `matchesInstructionFileFilter()` for filename/path-prefix pattern matching.

Available harnesses:

| Harness | Label | Description |
|---------|-------|-------------|
| `vscode` | Local | Shows all storage sources (default in core) |
| `cli` | Copilot CLI | Restricts user roots to `~/.copilot`, `~/.claude`, `~/.agents` |
| `claude` | Claude | Restricts user roots to `~/.claude`; hides Prompts + Plugins sections |

In core VS Code, all three harnesses are registered but CLI and Claude only appear when their respective agents are registered (`requiredAgentId` checked via `IChatAgentService`). VS Code is the default.
In sessions, only CLI is registered (single harness, toggle bar hidden).

### IHarnessDescriptor

Key properties on the harness descriptor:

| Property | Purpose |
|----------|--------|
| `hiddenSections` | Sidebar sections to hide (e.g. Claude: `[Prompts, Plugins]`) |
| `workspaceSubpaths` | Restrict file creation/display to directories (e.g. Claude: `['.claude']`) |
| `hideGenerateButton` | Replace "Generate X" sparkle button with "New X" |
| `sectionOverrides` | Per-section `ISectionOverride` map for button behavior |
| `requiredAgentId` | Agent ID that must be registered for harness to appear |
| `instructionFileFilter` | Filename/path patterns to filter instruction items |

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

**Sessions filter behavior (CLI harness):**

| Type | sources | includedUserFileRoots |
|------|---------|----------------------|
| Hooks | `[local, plugin]` | N/A |
| Prompts | `[local, user, plugin, builtin]` | `undefined` (all roots) |
| Agents, Skills, Instructions | `[local, user, plugin, builtin]` | `[~/.copilot, ~/.claude, ~/.agents]` |

**Core VS Code filter behavior:**

Local harness: all types use `[local, user, extension, plugin]` with no user root filter.

CLI harness (core):

| Type | sources | includedUserFileRoots |
|------|---------|----------------------|
| Hooks | `[local, plugin]` | N/A |
| Prompts | `[local, user, plugin]` | `undefined` (all roots) |
| Agents, Skills, Instructions | `[local, user, plugin]` | `[~/.copilot, ~/.claude, ~/.agents]` |

Claude harness (core):

| Type | sources | includedUserFileRoots |
|------|---------|----------------------|
| Hooks | `[local, plugin]` | N/A |
| Prompts | `[local, user, plugin]` | `undefined` (all roots) |
| Agents, Skills, Instructions | `[local, user, plugin]` | `[~/.claude]` |

Claude additionally applies:
- `hiddenSections: [Prompts, Plugins]`
- `instructionFileFilter: ['CLAUDE.md', 'CLAUDE.local.md', '.claude/rules/', 'copilot-instructions.md']`
- `workspaceSubpaths: ['.claude']` (instruction files matching `instructionFileFilter` are exempt)
- `sectionOverrides`: Hooks → `copilot.claude.hooks` command; Instructions → "Add CLAUDE.md" primary, "Rule" type label, `.md` file extension

### AgenticPromptsService (Sessions)

Sessions overrides `PromptsService` via `AgenticPromptsService` (in `promptsService.ts`):

- **Discovery**: `AgenticPromptFilesLocator` scopes workspace folders to the active session's worktree
- **Built-in prompts**: Discovers bundled `.prompt.md` files from `vs/sessions/prompts/` and surfaces them with `PromptsStorage.builtin` storage type
- **User override**: Built-in prompts are omitted when a user or workspace prompt with the same name exists
- **Creation targets**: `getSourceFolders()` override replaces VS Code profile user roots with `~/.copilot/{subfolder}` for CLI compatibility
- **Hook folders**: Falls back to `.github/hooks` in the active worktree

### Built-in Prompts

Prompt files bundled with the Sessions app live in `src/vs/sessions/prompts/`. They are:

- Discovered at runtime via `FileAccess.asFileUri('vs/sessions/prompts')`
- Tagged with `PromptsStorage.builtin` storage type
- Shown in a "Built-in" group in the AI Customization tree view and management editor
- Filtered out when a user/workspace prompt shares the same clean name (override behavior)
- Included in storage filters for prompts and CLI-user types

### Count Consistency

`customizationCounts.ts` uses the **same data sources** as the list widget's `loadItems()`:

| Type | Data Source | Notes |
|------|-------------|-------|
| Agents | `getCustomAgents()` | Parsed agents, not raw files |
| Skills | `findAgentSkills()` | Parsed skills with frontmatter |
| Prompts | `getPromptSlashCommands()` | Filters out skill-type commands |
| Instructions | `listPromptFiles()` + `listAgentInstructions()` | Includes AGENTS.md, CLAUDE.md etc. |
| Hooks | `listPromptFiles()` | Individual hooks parsed via `parseHooksFromFile()` |

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

Settings use the `chat.customizationsMenu.` and `chat.customizations.` namespaces:

| Setting | Default | Description |
|---------|---------|-------------|
| `chat.customizationsMenu.enabled` | `true` | Show the Chat Customizations editor in the Command Palette |
| `chat.customizations.harnessSelector.enabled` | `true` | Show the harness selector dropdown in the sidebar |
