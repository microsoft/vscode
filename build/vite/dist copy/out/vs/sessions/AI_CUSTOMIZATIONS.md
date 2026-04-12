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
├── aiCustomizationWorkspaceService.ts          # IAICustomizationWorkspaceService + IStorageSourceFilter + BUILTIN_STORAGE
└── customizationHarnessService.ts              # ICustomizationHarnessService + ISectionOverride + helpers
```

The tree view and overview live in `vs/sessions` (agent sessions window only):

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

| Property / Method | Core VS Code | Agent Sessions Window |
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
- **Factory functions** — `createVSCodeHarnessDescriptor`, `createCliHarnessDescriptor`, `createClaudeHarnessDescriptor`. The VS Code harness receives `[PromptsStorage.extension, BUILTIN_STORAGE]` as extras; CLI and Claude in core receive `[]` (no extension source). Sessions CLI receives `[BUILTIN_STORAGE]`.
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

Local harness: all types use `[local, user, extension, plugin, builtin]` with no user root filter. Items from the default chat extension (`productService.defaultChatAgent.chatExtensionId`) are grouped under "Built-in" via `groupKey` override in the list widget.

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

### Built-in Extension Grouping (Core VS Code)

In core VS Code, customization items contributed by the default chat extension (`productService.defaultChatAgent.chatExtensionId`, typically `GitHub.copilot-chat`) are grouped under the "Built-in" header in the management editor list widget, separate from third-party "Extensions".

This follows the same pattern as the MCP list widget, which determines grouping at the UI layer by inspecting collection sources. The list widget uses `IProductService` to identify the chat extension and sets `groupKey: BUILTIN_STORAGE` on matching items:

- **Agents**: checks `agent.source.extensionId` against the chat extension ID
- **Skills**: builds a URI→ExtensionIdentifier lookup from `listPromptFiles(PromptsType.skill)`, then checks each skill's URI
- **Prompts**: checks `command.promptPath.extension?.identifier`
- **Instructions/Hooks**: checks `item.extension?.identifier` via `IPromptPath`

The underlying `storage` remains `PromptsStorage.extension` — the grouping is a UI-level override via `groupKey` that keeps `applyStorageSourceFilter` working with existing storage types while visually distinguishing chat-extension items from third-party extension items.

`BUILTIN_STORAGE` is defined in `aiCustomizationWorkspaceService.ts` (common layer) and re-exported by both `aiCustomizationManagement.ts` (browser) and `builtinPromptsStorage.ts` (sessions) for backward compatibility.

### AgenticPromptsService (Sessions)

Sessions overrides `PromptsService` via `AgenticPromptsService` (in `promptsService.ts`):

- **Discovery**: `AgenticPromptFilesLocator` scopes workspace folders to the active session's worktree
- **Built-in skills**: Discovers bundled `SKILL.md` files from `vs/sessions/skills/{name}/` and surfaces them with `PromptsStorage.builtin` storage type
- **User override**: Built-in skills are omitted when a user or workspace skill with the same name exists
- **Creation targets**: `getSourceFolders()` override replaces VS Code profile user roots with `~/.copilot/{subfolder}` for CLI compatibility
- **Hook folders**: Falls back to `.github/hooks` in the active worktree

### Built-in Skills

All built-in customizations bundled with the Sessions app are skills, living in `src/vs/sessions/skills/{name}/SKILL.md`. They are:

- Discovered at runtime via `FileAccess.asFileUri('vs/sessions/skills')`
- Tagged with `PromptsStorage.builtin` storage type
- Shown in a "Built-in" group in the AI Customization tree view and management editor
- Filtered out when a user/workspace skill shares the same name (override behavior)
- Skills with UI integrations (e.g. `act-on-feedback`, `generate-run-commands`) display a "UI Integration" badge in the management editor

### UI Integration Badges

Skills that are directly invoked by UI elements (toolbar buttons, menu items) are annotated with a "UI Integration" badge in the management editor. The mapping is provided by `IAICustomizationWorkspaceService.getSkillUIIntegrations()`, which the Sessions implementation populates with the relevant skill names and tooltip descriptions. The badge appears on both the built-in skill and any user/workspace override, ensuring users understand that overriding the skill affects a UI surface.

### Count Consistency

`customizationCounts.ts` uses the **same data sources** as the list widget's `loadItems()`:

| Type | Data Source | Notes |
|------|-------------|-------|
| Agents | `getCustomAgents()` | Parsed agents, not raw files |
| Skills | `findAgentSkills()` | Parsed skills with frontmatter |
| Prompts | `getPromptSlashCommands()` | Filters out skill-type commands |
| Instructions | `listPromptFiles()` + `listAgentInstructions()` | Includes AGENTS.md, CLAUDE.md etc. |
| Hooks | `listPromptFiles()` | Individual hooks parsed via `parseHooksFromFile()` |

### Item Badges

`IAICustomizationListItem.badge` is an optional string that renders as a small inline tag next to the item name (same visual style as the MCP "Bridged" badge). For context instructions, this badge shows the raw `applyTo` pattern (e.g. a glob like `**/*.ts`), while the tooltip (`badgeTooltip`) explains the behavior. For skills with UI integrations, the badge reads "UI Integration" with a tooltip describing which UI surface invokes the skill. The badge text is also included in search filtering.

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
