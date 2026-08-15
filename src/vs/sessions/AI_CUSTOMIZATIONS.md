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

The Plugins section keeps plugin maintenance close to plugin creation: its compact toolbar includes an accessible Update Plugins button beside Create Plugin. This invokes the shared `workbench.agentPlugins.checkForUpdates` command, matching the Update Plugins action in the installed Agent Plugins view title; holding Alt/Shift on that view-title action invokes the existing force-update command. Update actions are disabled while the shared operation is running. Progress is shown while checking, followed by a notification listing updated or failed plugins, or confirming that plugins are already up to date.

Agent Host MCP **Show Output** actions prepare and register their target channel, close the modal management editor, then reveal the prepared channel. Closing before preparation can tear down the active harness context, while showing before close lets modal teardown reset the Output presentation.

When the active harness is an agent host (`agent-host-*` / `remote-*`), the editor can offer **two separate, focused migrations**. Each is its own category with its own experimental setting, overview card, sidebar shortcut, page, copy, and confirmation, because they are different operations: one *converts* file types, the other only *relocates* files. Categories are non-overlapping, so no file is ever offered twice.

- **Migrate Prompt Files** (`chat.customizations.promptMigration.enabled`) — appears when the core `IPromptsService` discovers workspace or user `*.prompt.md` files, which agent-host harnesses ignore. It converts selected prompt files into skills under the harness-appropriate skill roots (for example `.github/skills` / `~/.copilot/skills` for Copilot, `.claude/skills` / `~/.claude/skills` for Claude) and preserves manual invocation by setting `disable-model-invocation: true`. Its page groups by **Workspace** and **User**.
- **Migrate User Data Customizations** (`chat.customizations.userDataMigration.enabled`) — appears when agents or instructions are found in the profile's User Data `promptsHome` (`PromptFileSource.UserData`), which only VS Code reads. These files keep their type and content and move to the active harness's global agents or instructions root. Its page groups by **Agents** and **Instructions**. User Data prompt files are deliberately left to the prompt migration so every prompt file is converted in one place.

This page leads with a banner rather than a one-line description, because the migration has a consequence worth stating before the user commits: `promptsHome` is synced by `promptsSync`, so `.agent.md` and `.instructions.md` files there roam between devices with Settings Sync. Once migrated they live on one machine only. The banner names the trade so the choice is made knowingly, and is supplied by the category via the optional `getBanner` descriptor hook — a category that returns one has its page description suppressed to avoid repeating itself.

The documentation link follows the migration note so the page reads in decision order: what this migration is, the consequence, then where to learn more.

The two settings are independent: enabling one does not surface the other, and candidates are only scanned for enabled categories, so a disabled migration costs no prompt-file discovery. Each category declares its own `enablementSetting` on its descriptor, so adding a future migration means adding a descriptor rather than touching the editor.

Both pages share the same machinery: search, per-item and per-group selection, independently collapsible groups, opening a file before migrating, deleting an obsolete file, an opt-out for deleting originals, collision-safe target names, and partial-failure reporting. Selection identity includes both URI and storage because one physical file can be configured as both workspace and user storage; the two rows remain independently selectable. Opening a candidate uses the shared `Button` widget around its name and path, leaving the checkbox and delete action as separate keyboard targets. Its accessible name includes both visible labels so same-named files remain distinguishable to screen-reader users.

Migration is transactional per source URI. All selected storage identities for one source are copied before the original is deleted once. Targets are created with overwrite disabled and become rollback-owned only after creation succeeds, so a conflicting pre-existing target is preserved. If any target creation or the source deletion fails, every target created by this migration for that source is rolled back, so retrying does not create suffixed duplicates. When a destination type exposes multiple matching roots, migration prompts once for that target and reuses it for every selected file of that type and storage.

Migration overview cards use their native action button as the only interactive target; the surrounding card is presentational rather than a focusable button containing another button. The full User Data migration page fixture is `blocksCi` because its warning and migration controls form a distinct full-page state.

Automation run history stores the created session as a serialized URI. Its Open Session action uses the shared resource-first session opener, allowing the Agents window to route the URI through `ISessionsService` before the core workbench falls back to resolving an `IAgentSession`.

Manual automation runs announce that they started once session dispatch commits, while lifecycle tracking continues until completion, failure, cancellation, or timeout.

Automations use a discriminated target that is either workspace-backed or a workspace-less quick chat. The workspace dropdown owns both choices: selecting **No workspace** switches to the existing quick-chat provider/session-type catalog, while selecting a folder restores repository configuration. Workspace-less targets display and announce as `without a workspace` in the list and cannot carry folder, isolation, or branch configuration; workspace-backed targets require a folder, with Worktree isolation requiring its base branch. The automation dialog suppresses its root outline for pointer focus while preserving keyboard-visible focus indication. Ledger schema v3 persists this target union and migrates schema-v1/v2 flat records while preserving valid workspace-backed targets. A successful authoritative CAS updates in-memory state even when restored storage resets the revision counter, while lower-revision change notifications cannot roll observables backward.

The Agents window contributes a built-in **Automations** client-tool set with `listAutomations`, `configureAutomation`, `runAutomation`, and `deleteAutomation`. Listing is read-only and returns stable IDs plus editable fields. Configuration uses the invoking session as the default target for new entries and follows the normal tool-approval policy: calls that require interaction show standard tool confirmation, while auto-approved calls proceed directly. Both paths validate and commit through `IAutomationService`, and successful creates and updates return a clickable chat result that opens the affected automation. `runAutomation` uses the same approval policy, starts a manual run through `IAutomationRunner` even when scheduled runs are disabled, and returns after dispatch with the run and session identifiers while lifecycle tracking continues in the background; an already-active run or unavailable target is reported without claiming a new run started. A run slot is claimed atomically: `recordRunStart` re-checks for an active run inside the same CAS that appends the pending run, so concurrent manual triggers from agents, the **Run now** button, or separate windows cannot both start the same automation, and only the caller that wins the swap dispatches a session. Manual workspace choices in the automation dialog never update the new-session recent-workspace list. Deletion uses **Delete**/**Cancel** confirmation when required, removes the automation and retained run history, and lets already-dispatched sessions continue. Denial, invalid IDs, stale confirmed updates, and cancellation or disablement observed by the mutation guard leave the ledger unchanged. The guard runs immediately before every CAS attempt; once an atomic CAS starts, concurrent cancellation or disablement cannot revoke a committed write, and the tool reports that commit as successful.

For Agent Host client tools, a call made while the SDK is in **Allow all** mode carries `autoApproveBySetting` on its ready action. A plain `not-needed` confirmation reason is insufficient because client tools that did not consult the setting can use the same reason.

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
In sessions, the Local harness is not registered. Harnesses are accepted for any session type that has a registered content provider (checked via `IChatSessionsService.getContentProviderSchemes()`). The first provider harness becomes active until a session selects its own harness, and the editor uses no Local fallback label while none is available. AHP remote servers register directly via `registerExternalHarness`.

Remote agent hosts can also register **external harnesses** dynamically. Each remote agent harness may contribute:
- an `itemProvider` that surfaces plugins already configured on the remote host (or synced into the active remote session),
- a `disableProvider` that lets users opt out individual files/plugins from auto-sync, and
- `pluginActions` that add environment-specific commands such as "Add Remote Plugin" to the Plugins section add menu alongside the default install-from-source action. The create action remains a separate toolbar button.

Remote Agent Host registrations auto-sync enabled `PromptsStorage.user` agents, skills, instructions, and prompts from the client in addition to the extension, plugin, and built-in sources shared with local Agent Hosts. Local Agent Hosts exclude user storage from this client bundle because native discovery already reads the same machine's user home. Remote user files are flattened into the existing synthetic Open Plugin, retain their original URI for per-file opt-out, and remain grouped as client-originated after provenance recovery. Host-native user customizations remain separate entries; no client/host precedence or cross-tier deduplication is introduced. Hooks and singleton agent-instruction files such as `~/.claude/CLAUDE.md` and `~/.copilot/copilot-instructions.md` are outside this sync path.

The Plugins section renders remote harness `itemProvider` entries with `type: 'plugin'` directly. This is separate from the prompt-file pipeline used for Agents, Skills, Instructions, Prompts, and Hooks.

Local plugin discovery is aggregated by `IAgentPluginService` from priority-ordered discovery providers: configured paths, VS Code marketplace installs, extension-contributed plugins, and Copilot CLI installs. Each provider reports `undefined` until its initial scan completes; the service waits for every provider to complete before exposing plugins. Once ready, plugins are canonicalized into collision groups so the same plugin discovered from multiple install roots (for example a VS Code marketplace install and a Copilot CLI direct install) remains visible but only the highest-priority copy is enabled by default. Enabling one copy disables the other copies in the same collision group. Uninstalling a plugin discovered through `chat.pluginLocations` removes its configuration entry without deleting the plugin folder; users can open the folder separately when they want to remove its files.

Agent Plugins use the portable Agent Plugin layout alongside the existing Copilot, Claude, and Open Plugin adapters. A package is recognized when root `plugin.json` declares an `agent-plugins.org` plugin schema. Compatible schema revisions are accepted, malformed optional metadata is ignored, and a recognized manifest takes precedence over `.plugin/plugin.json`. Agent Plugins contribute only immediate-child `skills/*/SKILL.md` skills and root `mcp.json` servers. They ignore legacy custom paths, inline components, `.mcp.json`, root `SKILL.md`, commands, agents, rules, hooks, LSP servers, and output styles.

The shared plugin discovery pipeline selects format-specific component paths while using the same permissive component readers. For Agent Plugins, compatible schema revisions are recognized, known valid manifest fields are retained, fixed `skills/` and `mcp.json` paths are used, and remote servers are normalized for existing MCP transport auto-detection. Discovery preserves unresolved harness-owned values such as `${PLUGIN_DATA}` rather than allocating or interpreting a plugin data directory. Legacy Open Plugin discovery, marketplace/cache/scope behavior, command namespacing, and the synthetic `.plugin/plugin.json` plus `.mcp.json` bundles used for synchronized customizations remain unchanged and do not claim Agent Plugins v1 conformance. Direct root-manifest installation is supported, but Agent Plugins v1 does not define a marketplace protocol.

Runtime projection is provider-specific. Copilot receives strict skills and MCP explicitly rather than through legacy SDK plugin-directory discovery. Codex receives strict skill roots plus MCP, with remote transport selected by its existing auto-detection. Claude excludes strict packages from legacy plugin discovery and can project remote MCP through its existing auto-detection, but its current SDK cannot register external skill directories or provide the per-server working directory required by strict stdio MCP, so those components are reported and skipped.

Claude Agent Host multi-root customization discovery is gated by the hidden, default-off `chat.agentHost.claudeAgent.multiRootEnabled` setting. When enabled, the primary working directory and each SDK `additionalDirectories` root contribute standalone `.claude/agents`, `.claude/skills`, and native plugin enablement to the Customizations editor. Roots are processed in session order, followed by user scope; same-named standalone agents or skills use the first visible definition as the display source. This display policy is centralized because the SDK reports standalone entries by name rather than source URI. Native plugin loaded state remains authoritative from the SDK snapshot. Rules, hooks, MCP configuration, commands, and CLAUDE.md remain primary-root/user scoped because Claude additional directories do not load those configuration types. Each contributing root has its own writable directory container, and secondary-root watchers observe only agents, skills, and plugin settings.

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

Local harness: all types use `[local, user, extension, plugin, builtin]`. Items from the default chat extension (`productService.defaultChatAgent.chatExtensionId`) are grouped under "Built-in" via `groupKey` override in the list widget. Synthetic per-extension tool sets group contributed tools in Chat Customizations and are hidden from the chat tool picker, where the tools are grouped directly by extension.

Voice customizations follow the same workspace/user split as Copilot instructions but are consumed directly by voice features rather than listed as standard prompt-file sections in the management editor. Voice Mode combines `~/.copilot/voice.md` with each trusted workspace's `.github/voice.md` and sends the result to the backend as `voice_instructions` on both session start and resume. Dictation separately combines `~/.copilot/dictation.md` with each trusted workspace's `.github/dictation.md` and appends the result to its language-model post-processing prompt for terminology and formatting guidance. Separate configure commands create or open either scope and are linked from their respective settings, microphone menus, and the management editor overview.

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
- `sectionOverrides`: Instructions → "Add CLAUDE.md" primary, "Rule" type label, `.md` file extension

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

- **`customizationMigration.ts`** — Shared, category-agnostic migration mechanics: prompt-to-skill content conversion, same-type relocation for other customizations, collision-safe target naming, and the per-file migrate/write/delete workflow with partial-failure reporting.
- **`customizationMigrationCategories.ts`** — The focused migration categories (Prompt Files, User Data). Each descriptor owns its candidate predicate, grouping, enablement setting, and complete localized copy, so the editor renders both flows from one generic page without harness- or category-specific conditionals.

### MCP server list active-session controls

The MCP Servers tab merges local/workspace MCP configuration with MCP servers reported by the active agent-host session. When a listed server also exists in the active session, row status follows the session-backed server and lifecycle controls (start/stop) target the agent host. Model-access and sampling-log actions are hidden for session-backed rows because those are not inline session controls. Runtime states render as semantic colored icons rather than text badges: running uses a green check, while stopped has no visual icon. Authentication-required rows expose an inline **Sign In** button, and an actionable error icon opens that server's local or agent-host output.

For agent-host sessions, the client publishes every known plugin and VS Code-owned MCP server with an explicit global decision derived only from the VS Code profile. The host owns durable workspace and session decisions and resolves their effective enablement. Bundled MCP servers carry their decision by child name because the host discovers them from the synthetic plugin's `.mcp.json`. A session action dispatches only a session decision; the temporary non-session action dispatches a global decision until the full scoped action matrix is available.

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

#### Enabling and Disabling Built-in Skills

The **Enable** / **Disable** actions on a built-in skill persist to `IPromptsService.setDisabledPromptFiles(PromptsType.skill, …)` (profile-scoped storage). This is a distinct store from the per-harness auto-sync opt-out owned by `ICustomizationSyncProvider`, which the Plugins section writes.

The two stores are consulted at different points, and deliberately not identically:

- **The wire** honors *both*. `enumerateLocalCustomizationsForHarness` marks a file disabled when either store opts it out, so a disabled skill is excluded from the synthetic Open Plugin bundle and never reaches the agent host.
- **The list** derives `enabled` from the prompts-service store *only*. `mergeBuiltinSkills` ignores the sync-provider store because that store holds **plugin** URIs — its sole writer is the Plugins section checkbox, and `isDisabled` matches URIs exactly rather than by containment — so it can never opt out an individual built-in skill. If a per-file sync opt-out is ever added, this derivation must account for it; otherwise a skill dropped from the wire would be re-listed as enabled, and the **Enable** action (which writes only the prompts store) could not correct it.

Two places must consult the prompts-service store for the toggle to take effect on an agent-host harness:

- **The wire.** As above — the skill is excluded from the bundle.
- **The list.** Because a disabled skill is no longer in the bundle, the agent-host item provider stops reporting it. `PureItemProviderItemSource` therefore merges built-in skills in from `IPromptsService.listPromptFilesForStorage(skill, builtIn)` (via the shared `mergeBuiltinSkills` helper, deduped by URI against provider rows) and derives their `enabled` state from `getDisabledPromptFiles`. This keeps a disabled built-in listed — greyed out, with an **Enable** action — instead of vanishing with no way to restore it. Its `onDidAICustomizationItemsChange` includes `onDidChangeSkills` so the row updates immediately.

`ItemProviderItemSource` (non-agent-host harnesses) uses the same helper, so both paths group, dedupe, and gate built-ins identically.

##### Scope: only built-in skills may be hidden by the user-disabled store

The wire consults `getDisabledPromptFiles` **only** for the `(type, storage)` combination the Customizations UI can re-enable, expressed by `isUserToggleableCustomization` in `chat/common/promptSyntax/service/promptsService.ts`. Both the management editor and the sessions tree view register their Enable/Disable actions solely for built-in skills, so that is the only toggleable combination today.

This gate is load-bearing rather than cosmetic. `getDisabledPromptFiles` is a shared store that the chat view agent picker also writes for `PromptsType.agent` ("hidden from agent picker"). Because callers drop opted-out files from the bundle entirely and the Agents-window lists are derived from that bundle, honoring the store for a customization the Customizations UI cannot re-enable would strand it: the row disappears, and the **Enable** action that would bring it back is only rendered for rows that are still listed. The agent picker is unaffected — it owns its own unhide affordance and does not read from the bundle.

Consequently, the wire gate and `mergeBuiltinSkills` must be kept in sync: anything the wire is allowed to hide must have a corresponding restore path in the list.

### UI Integration Badges

Skills that are directly invoked by UI elements (toolbar buttons, menu items) are annotated with a "UI Integration" badge in the management editor. The mapping is provided by `IAICustomizationWorkspaceService.getSkillUIIntegrations()`, which the Sessions implementation populates with the relevant skill names and tooltip descriptions. The badge appears on both the built-in skill and any user/workspace override, ensuring users understand that overriding the skill affects a UI surface.

### Count Consistency

Counts shown in the sidebar (per-link badges and the header total in `AICustomizationShortcutsWidget`) are driven by the same `IAICustomizationItemsModel` singleton (`workbench/contrib/chat/browser/aiCustomization/aiCustomizationItemsModel.ts`) that feeds the customizations editor's list widget. The model owns the per-active-harness `ProviderCustomizationItemSource` cache and exposes per-section `IObservable<readonly IAICustomizationListItem[]>`; sidebar consumers `read` `.length` from those observables. There is exactly one discovery path, so editor and sidebar counts cannot diverge. McpServers use `IMcpService.servers` directly. Plugins use `IAICustomizationItemsModel.getPluginCount()`, which combines locally installed plugins from `IAgentPluginService.plugins` with plugin rows supplied by the active remote customization provider.

Provider-supplied customization rows that include an explicit storage origin are treated as authoritative even when no local URI inference is available. In particular, `storage: PromptsStorage.plugin` keeps AHP remote host plugin customizations out of the User group when no local `pluginUri` exists, and `storage: BUILTIN_STORAGE` keeps provider-supplied built-ins in the Built-in group.

### MCP Active Session Status

The MCP Servers section combines locally known MCP servers with MCP servers reported by the active agent-host session (`IAgentHostCustomizationService.getMcpServers(activeSessionResource)`). Active-session servers are matched to known workspace, user, extension, plugin, or built-in rows by stable identifiers and display names so the row can show the active session's status, matching `MCP: List Servers`. Active-session servers that do not match any known local/runtime server are appended to the **Workspace** group and counted with the rest of the section.

The MCP list uses `WorkbenchList` as its sole scroll owner. Layout uses the widget's rendered content-box dimensions rather than the padded panel's outer dimensions, and the virtual delegate height matches each rendered row variant, including the taller two-line description row. These invariants keep the final row fully reachable at the bottom of the list.

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
