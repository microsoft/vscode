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
├── aiCustomizationItemsModel.ts                # IAICustomizationItemsModel: aggregated item model + section counts
├── aiCustomizationItemSource.ts                # Item pipeline: ICustomizationItem → IAICustomizationListItem view model
├── aiCustomizationWelcomePage.ts               # Welcome page host (AICustomizationWelcomePage + implementation interface)
├── aiCustomizationWelcomePagePromptLaunchers.ts # Welcome page implementation: prompt launchers
├── embeddedMcpServerDetail.ts                  # Inline MCP server detail panel
├── embeddedAgentPluginDetail.ts                # Inline agent plugin detail panel
├── promptsServiceCustomizationItemProvider.ts  # Adapts IPromptsService → ICustomizationItemProvider
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
    └── aiCustomizationManagement.css             # Management editor styling, including Sessions empty-state layout

src/vs/workbench/contrib/chat/common/
├── aiCustomizationWorkspaceService.ts          # IAICustomizationWorkspaceService + IStorageSourceFilter + BUILTIN_STORAGE
└── customizationHarnessService.ts              # ICustomizationHarnessService + ICustomizationItem + ICustomizationItemProvider + helpers
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
├── customizationHarnessService.ts              # Sessions harness service (accepts any content-provider-backed session type)
└── promptsService.ts                           # AgenticPromptsService (CLI user roots)
src/vs/sessions/contrib/sessions/browser/
├── aiCustomizationShortcutsWidget.ts           # Resizable sidebar shortcuts widget with overview + section links
└── customizationsToolbar.contribution.ts       # Sidebar customization links
```

### Management Editor Shell

The management editor opens as a compact modal editor. The modal title and welcome page heading use `Agent Customizations for {harness label}` so the active harness is visible throughout the overview experience. If no harness descriptor is available yet, the UI falls back to `Local`.

The first sidebar entry is a static `Overview` navigation item. It is styled like the other sidebar labels and does not mirror the active harness label; harness identity is represented by the modal title and welcome heading instead.

The Tools section can browse the Marketplace in the core workbench, where extension gallery browsing and installation are available. The Sessions window hides Tools Marketplace browsing and only shows the tool enablement list.

When the active harness is an agent host (`agent-host-*` / `remote-*`), the overview can render a **Migrate** card. The card appears only when the core `IPromptsService` still discovers local/user `*.prompt.md` files, because those files are ignored by agent-host harnesses, and only when the experimental `chat.customizations.promptMigration.enabled` setting is enabled. The left sidebar also renders a bottom **Migrate Prompt Files** shortcut in that state so the flow is discoverable even when the overview is not visible. Choosing either entry opens a dedicated migration page where users can review all migratable prompt files, select the ones to migrate, and open individual files before running migration. The migrate action converts selected prompt files into skills under the harness-appropriate skill roots (for example `.github/skills` / `~/.copilot/skills` for Copilot, `.claude/skills` / `~/.claude/skills` for Claude), preserves manual invocation by setting `disable-model-invocation: true`, and removes the original prompt files. If multiple workspace skill roots are available, migration prompts once to choose the workspace target and reuses that target for all migrated workspace prompts.

Automation run history stores the created session as a serialized URI. Its Open Session action uses the shared resource-first session opener, allowing the Agents window to route the URI through `ISessionsService` before the core workbench falls back to resolving an `IAgentSession`.

Manual automation runs announce that they started once session dispatch commits, while lifecycle tracking continues until completion, failure, cancellation, or timeout.

### IAICustomizationWorkspaceService

The `IAICustomizationWorkspaceService` interface controls per-window behavior:

| Property / Method | Core VS Code | Agent Sessions Window |
|----------|-------------|----------|
| `managementSections` | All sections except Models | All sections except Models |
| `isSessionsWindow` | `false` | `true` |
| `activeProjectRoot` | First workspace folder | Active session worktree |
| `welcomePageFeatures` | Shows getting-started banner + per-card AI actions | Shows getting-started banner, hides per-card AI actions |

### ICustomizationHarnessService

A harness represents the AI execution environment that consumes customizations.
Storage answers "where did this come from?"; harness answers "who consumes it?".

The service is defined in `common/customizationHarnessService.ts` which also provides:
- **`CustomizationHarnessServiceBase`** — reusable base class handling active-harness state, the observable list
- **`ISectionOverride`** — per-section UI customization: `commandId` (command invocation), `rootFile` + `label` (root-file creation), `typeLabel` (custom type name), `fileExtension` (override default), `rootFileShortcuts` (dropdown shortcuts).
- **Factory functions** — `createVSCodeHarnessDescriptor`, `createCliHarnessDescriptor`, `createClaudeHarnessDescriptor`. The VS Code harness receives `[AICustomizationSources.extension, AICustomizationSources.builtin]` as extras; CLI and Claude in core receive `[]` (no extension source). Sessions CLI receives `[AICustomizationSources.builtin]`.
- **Well-known root helpers** — `getCliUserRoots(userHome)` and `getClaudeUserRoots(userHome)` centralize the `~/.copilot`, `~/.claude`, `~/.agents` path knowledge.
- **Filter helpers** — `matchesWorkspaceSubpath()` for segment-safe subpath matching; `matchesInstructionFileFilter()` for filename/path-prefix pattern matching.

Available harnesses:

| Harness | Label | Description |
|---------|-------|-------------|
| `vscode` | Local | Shows all storage sources (default in core) |
| `cli` | Copilot CLI | Restricts user roots to `~/.copilot`, `~/.claude`, `~/.agents` |
| `claude` | Claude | Restricts user roots to `~/.claude`; hides Prompts + Plugins sections |

In core VS Code, all three harnesses are registered but CLI and Claude only appear when their respective agents are registered (`requiredAgentId` checked via `IChatAgentService`). VS Code is the default.
In sessions, harnesses are accepted for any session type that has a registered content provider (checked via `IChatSessionsService.getContentProviderSchemes()`). AHP remote servers register directly via `registerExternalHarness`.

Remote agent hosts can also register **external harnesses** dynamically. Each remote agent harness may contribute:
- an `itemProvider` that surfaces plugins already configured on the remote host (or synced into the active remote session),
- a `disableProvider` that lets users opt out individual files/plugins from auto-sync, and
- `pluginActions` that add environment-specific commands such as "Add Remote Plugin" to the Plugins section add menu alongside the default install-from-source action. The create action remains a separate toolbar button.

The Plugins section renders remote harness `itemProvider` entries with `type: 'plugin'` directly. This is separate from the prompt-file pipeline used for Agents, Skills, Instructions, Prompts, and Hooks.

Local plugin discovery is aggregated by `IAgentPluginService` from priority-ordered discovery providers: configured paths, VS Code marketplace installs, extension-contributed plugins, and Copilot CLI installs. Each provider reports `undefined` until its initial scan completes; the service waits for every provider to complete before exposing plugins. Once ready, plugins are canonicalized into collision groups so the same plugin discovered from multiple install roots (for example a VS Code marketplace install and a Copilot CLI direct install) remains visible but only the highest-priority copy is enabled by default. Enabling one copy disables the other copies in the same collision group.

### IHarnessDescriptor

Key properties on the harness descriptor:

| Property | Purpose |
|----------|--------|
| `itemProvider` | `ICustomizationItemProvider` supplying items; when absent, falls back to `PromptsServiceCustomizationItemProvider` |
| `disableProvider` | `ICustomizationDisableProvider` enabling opt-out of individual items from auto-sync |
| `hiddenSections` | Sidebar sections to hide (e.g. Claude: `[Prompts, Plugins]`) |
| `workspaceSubpaths` | Restrict file creation/display to directories (e.g. Claude: `['.claude']`) |
| `hideGenerateButton` | Replace "Generate X" sparkle button with "New X" |
| `sectionOverrides` | Per-section `ISectionOverride` map for button behavior |
| `requiredAgentId` | Agent ID that must be registered for harness to appear |
| `instructionFileFilter` | Filename/path patterns to filter instruction items |

### IStorageSourceFilter

A per-type filter controlling which storage sources are visible.

```typescript
interface IStorageSourceFilter {
  sources: readonly PromptsStorage[];  // Which storage groups to display
}
```

The shared `applyStorageSourceFilter()` helper applies this filter to any `{uri, storage}` array.

**Sessions filter behavior (CLI harness):**

| Type | sources |
|------|---------|
| Hooks | `[local, plugin]` |
| Prompts | `[local, user, plugin, builtin]` |
| Agents, Skills, Instructions | `[local, user, plugin, builtin]` |

**Core VS Code filter behavior:**

Local harness: all types use `[local, user, extension, plugin, builtin]`. Items from the default chat extension (`productService.defaultChatAgent.chatExtensionId`) are grouped under "Built-in" via `groupKey` override in the list widget.

CLI harness (core):

| Type | sources |
|------|---------|
| Hooks | `[local, plugin]` |
| Prompts | `[local, user, plugin]` |
| Agents, Skills, Instructions | `[local, user, plugin]` |

Claude harness (core):

| Type | sources |
|------|---------|
| Hooks | `[local, plugin]` |
| Prompts | `[local, user, plugin]` |
| Agents, Skills, Instructions | `[local, user, plugin]` |

Claude additionally applies:
- `hiddenSections: [Prompts, Plugins]`
- `instructionFileFilter: ['CLAUDE.md', 'CLAUDE.local.md', '.claude/rules/', 'copilot-instructions.md']`
- `workspaceSubpaths: ['.claude']` (instruction files matching `instructionFileFilter` are exempt)
- `sectionOverrides`: Hooks → `copilot.claude.hooks` command; Instructions → "Add CLAUDE.md" primary, "Rule" type label, `.md` file extension

### Built-in Extension Grouping (Core VS Code)

In core VS Code, customization items contributed by the default chat extension (`productService.defaultChatAgent.chatExtensionId`, typically `GitHub.copilot-chat`) are grouped under the "Built-in" header in the management editor list widget, separate from third-party "Extensions".

`PromptsServiceCustomizationItemProvider` handles this via `applyBuiltinGroupKeys()`: it builds a URI→extension-ID lookup from prompt file metadata, then sets `groupKey: BUILTIN_STORAGE` on items whose extension matches the chat extension ID (checked via the shared `isChatExtensionItem()` utility). The underlying `storage` remains `PromptsStorage.extension` — the grouping is a `groupKey` override that keeps `applyStorageSourceFilter` working while visually distinguishing chat-extension items from third-party extension items.

`BUILTIN_STORAGE` is defined in `aiCustomizationWorkspaceService.ts` (common layer) and re-exported by both `aiCustomizationManagement.ts` (browser) and `builtinPromptsStorage.ts` (sessions) for backward compatibility.

### Management Editor Item Pipeline

All customization sources — `IPromptsService`, extension-contributed providers, and AHP remote servers — produce items conforming to the same `ICustomizationItem` contract (defined in `customizationHarnessService.ts`). This contract carries `uri`, `type`, `name`, `description`, optional `storage`, `groupKey`, `badge`, plugin provenance (`pluginUri`/`pluginLabel`), and status fields.

```
promptsService ──→ PromptsServiceCustomizationItemProvider ──→ ICustomizationItem[]
                                                                       │
Extension Provider ───────────────────────────────────────→ ICustomizationItem[]
                                                                       │
AHP Remote Server ────────────────────────────────────────→ ICustomizationItem[]
                                                                       │
                                                                       ▼
                                              CustomizationItemSource (aiCustomizationItemSource.ts)
                                              ├── normalizes → IAICustomizationListItem[]
                                              ├── expands hooks from file content
                                              └── normalizes items from provider
                                                                       │
                                                                       ▼
                                                              List Widget renders
```

**Key files:**

- **`aiCustomizationItemSource.ts`** — The browser-side pipeline: `IAICustomizationListItem` (view model), `IAICustomizationItemSource` (data contract for both customization rows and harness-provided source folders), `AICustomizationItemNormalizer` (maps `ICustomizationItem` → view model, inferring storage/grouping from URIs when the provider doesn't supply them), `ProviderCustomizationItemSource` (orchestrates provider + sync + normalizer), and shared utilities (`expandHookFileItems`, `getFriendlyName`, `isChatExtensionItem`).

- **`promptsServiceCustomizationItemProvider.ts`** — Adapts `IPromptsService` to `ICustomizationItemProvider`. Reads agents, skills, instructions, hooks, and prompts from the core service, expands instruction categories and hook entries, applies harness-specific filters (storage sources, workspace subpaths, instruction file patterns), and returns `ICustomizationItem[]` with `storage` set from the authoritative promptsService metadata. Used as the default item provider for harnesses that don't supply their own.

- **`customizationHarnessService.ts`** (common layer) — Defines `ICustomizationItem`, `ICustomizationItemProvider`, `ICustomizationDisableProvider`, and `IHarnessDescriptor`. A harness descriptor optionally carries an `itemProvider`; when absent, the widget falls back to `PromptsServiceCustomizationItemProvider`.

- **`promptMigration.ts`** — Shared prompt-file migration utilities used by the management editor: prompt-to-skill content conversion, source-folder selection, collision-safe skill naming, and the per-file migrate/write/delete workflow with partial-failure reporting.

### MCP server list active-session controls

The MCP Servers tab merges local/workspace MCP configuration with MCP servers reported by the active agent-host session. When a listed server also exists in the active session, row status follows the session-backed server and lifecycle controls (start/stop) target the agent host. Other VS Code-owned actions such as enable/disable, configuration, and install/uninstall stay on the local MCP row; model-access and sampling-log actions are hidden for session-backed rows because those are not inline session controls.

### Structured Detail Preview

For markdown-backed customizations (`.agent.md`, `SKILL.md`, `.instructions.md`, `.prompt.md`), the management editor opens a **structured preview** by default instead of showing the raw file immediately.

- The preview parses the file with `PromptFileParser`
- Header metadata is rendered as labeled rows
- Each row includes an inline help affordance whose hover text comes from `getAttributeDefinition(...)`
- The markdown body is rendered via `IMarkdownRendererService`
- A header button switches between the structured preview and the raw editor/viewer

Hooks and other non-markdown detail views continue to open directly in their existing raw/detail experiences.

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

Counts shown in the sidebar (per-link badges and the header total in `AICustomizationShortcutsWidget`) are driven by the same `IAICustomizationItemsModel` singleton (`workbench/contrib/chat/browser/aiCustomization/aiCustomizationItemsModel.ts`) that feeds the customizations editor's list widget. The model owns the per-active-harness `ProviderCustomizationItemSource` cache and exposes per-section `IObservable<readonly IAICustomizationListItem[]>`; sidebar consumers `read` `.length` from those observables. There is exactly one discovery path, so editor and sidebar counts cannot diverge. McpServers use `IMcpService.servers` directly. Plugins use `IAICustomizationItemsModel.getPluginCount()`, which combines locally installed plugins from `IAgentPluginService.plugins` with plugin rows supplied by the active remote customization provider.

Provider-supplied customization rows that include an explicit storage origin are treated as authoritative even when no local URI inference is available. In particular, `storage: PromptsStorage.plugin` keeps AHP remote host plugin customizations out of the User group when no local `pluginUri` exists, and `storage: BUILTIN_STORAGE` keeps provider-supplied built-ins in the Built-in group.

### MCP Active Session Status

The MCP Servers section combines locally known MCP servers with MCP servers reported by the active agent-host session (`IAgentHostCustomizationService.getMcpServers(activeSessionResource)`). Active-session servers are matched to known workspace, user, extension, plugin, or built-in rows by stable identifiers and display names so the row can show the active session's status, matching `MCP: List Servers`. Active-session servers that do not match any known local/runtime server are appended under an **Active Session** group and counted with the rest of the section.

### Sidebar Customizations Section

The Agents sidebar `AICustomizationShortcutsWidget` appears as a collapsible, vertically resizable section below the sessions list. Its resize sash is the horizontal separator above the section and uses the same `SplitView` styling as the Checks section in the changes view, with a 4px separator and sash inset on each side. The section's expanded minimum height is 129px, while its initial and maximum height are capped to the rendered content height so the pane does not open with empty space. When collapsed, the section shrinks to its header height and shows the total customization count to the left of the hover-revealed chevron. The collapsed/expanded state is persisted per profile (`StorageScope.PROFILE`) and restored on reload.

The first sidebar entry is `Overview`, which opens the AI Customization management editor welcome page. The remaining per-category rows deep-link directly to their corresponding management editor section. All entries keep the active customization harness in sync with the active session before opening the editor.

### Item Badges

`IAICustomizationListItem.badge` is an optional string that renders as a small inline tag next to the item name. For context instructions, this badge shows the raw `applyTo` pattern (e.g. a glob like `**/*.ts`), while the tooltip (`badgeTooltip`) explains the behavior. For skills with UI integrations, the badge reads "UI Integration" with a tooltip describing which UI surface invokes the skill. The badge text is also included in search filtering.

### Embedded Detail Editors

The management editor opens inline detail panes for prompt files, MCP servers, and plugins. Prompt-file details use the standard text editor pane. MCP and plugin details render dedicated compact widgets — `EmbeddedMcpServerDetail` and `EmbeddedAgentPluginDetail` — purpose-built for the narrow split-pane host. They show the icon, name, scope/source, and description. Do **not** embed the full extension-editor panes inside the split-pane host: they assume a wide page-level layout and don't shrink cleanly.

The MCP detail fixture in `src/vs/workbench/test/browser/componentFixtures/sessions/aiCustomizationManagementEditor.fixture.ts` must open a real server row (not a group header) and use a local server with concrete config so the compact widget's scope/description rendering is covered by screenshots.

### Debug Panel

Toggle via Command Palette: "Toggle Customizations Debug Panel". Shows a diagnostic view of the item pipeline:

1. **Provider data** — items returned by the active `ICustomizationItemProvider`
2. **After filtering** — what was removed by storage source and workspace subpath filters
3. **Widget state** — allItems vs displayEntries with group counts
4. **Source/resolved folders** — creation targets and discovery order

## Key Services

- **Prompt discovery**: `IPromptsService` — parsing, lifecycle, storage enumeration
- **MCP servers**: `IMcpService` — server list, tool access
- **Active worktree**: `IActiveSessionService` — source of truth for workspace scoping (sessions only)
- **File operations**: `IFileService`, `ITextModelService` — file and model plumbing

Browser compatibility is required — no Node.js APIs.

## Feature Gating

All commands and UI respect `ChatContextKeys.enabled`.

### Commands

| Command ID | Purpose |
|-----------|---------|
| `aiCustomization.openManagementEditor` | Opens the management editor, optionally accepting an `AICustomizationManagementSection` to deep-link |
| `aiCustomization.openMarketplace` | Opens the management editor with marketplace browse mode active. Accepts an optional section (`mcpServers` or `plugins`); defaults to `mcpServers` |

## Settings

User-facing settings use the `chat.customizations.` namespace. Currently, no settings are exposed for the management editor.
