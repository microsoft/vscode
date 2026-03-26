# Agent Plugins Architecture

Agent plugins are a modular extension system that allows external packages of prompts, hooks, skills, agents, and MCP server definitions to be discovered, installed, and contributed into the chat experience. This document describes the architecture of the `src/vs/workbench/contrib/chat/common/plugins/` layer and its browser-side implementations.

## Directory Structure

### Common layer (`common/plugins/`)
| File | Role |
|------|------|
| `agentPluginService.ts` | Core interfaces (`IAgentPlugin`, `IAgentPluginService`, `IAgentPluginDiscovery`) and the discovery registry singleton |
| `agentPluginServiceImpl.ts` | `AgentPluginService` implementation, `AbstractAgentPluginDiscovery` base class, format adapters (Copilot / Claude / Open Plugin) |
| `agentPluginRepositoryService.ts` | `IAgentPluginRepositoryService` — abstract repository clone/pull/cache operations |
| `pluginMarketplaceService.ts` | `IPluginMarketplaceService` — marketplace metadata, installed-plugin storage, trusted-marketplace tracking, periodic update checks |
| `pluginInstallService.ts` | `IPluginInstallService` — install/update orchestration interface |
| `pluginSource.ts` | `IPluginSource` — per-source-kind strategy interface (install path, ensure, update, cleanup) |

### Browser layer (`browser/`)
| File | Role |
|------|------|
| `agentPluginRepositoryService.ts` | Browser implementation of `IAgentPluginRepositoryService` (git clone/pull via Git service) |
| `pluginSources.ts` | Concrete `IPluginSource` implementations: `GitHubPluginSource`, `GitUrlPluginSource`, `NpmPluginSource`, `PipPluginSource`, `RelativePathPluginSource` |
| `pluginInstallService.ts` | Browser implementation of `IPluginInstallService` |
| `agentPluginsView.ts` | Installed-plugins tree view UI |
| `agentPluginActions.ts` | Context-menu actions for plugins |
| `agentPluginEditor/` | Rich editor for browsing a single plugin's contents |

## Core Interfaces

### IAgentPlugin

Represents a single discovered plugin:

```
uri              – Unique filesystem URI for the plugin root
label            – Human-readable display name
enablement       – Observable enable/disable state (ContributionEnablementState)
hooks            – Observable list of IAgentPluginHook
commands         – Observable list of IAgentPluginCommand  (*.md files in commands/)
skills           – Observable list of IAgentPluginSkill    (dirs with SKILL.md in skills/)
agents           – Observable list of IAgentPluginAgent    (*.md files in agents/)
mcpServerDefinitions – Observable list of IAgentPluginMcpServerDefinition
fromMarketplace  – Set when the plugin was installed from a marketplace
remove()         – Removes this plugin from its discovery source
```

### IAgentPluginService

Main entry point consumed by the rest of the workbench:

```
plugins          – IObservable<readonly IAgentPlugin[]>  (aggregate of all discoveries, deduped by URI)
enablementModel  – Shared IEnablementModel for plugin enable/disable state
```

Registered as `InstantiationType.Delayed` — only instantiated when first injected.

### IAgentPluginDiscovery

Strategy for finding plugins from a particular source:

```
plugins  – IObservable<readonly IAgentPlugin[]>
start(enablementModel) – Begin watching the source
```

Discoveries are registered into the global `agentPluginDiscoveryRegistry` singleton and instantiated by `AgentPluginService` on startup.

## Discovery & Plugin Reading

### AbstractAgentPluginDiscovery

Shared base class that handles:

1. **Format detection** — auto-detects whether a plugin uses the Copilot, Claude, or Open Plugin format based on path conventions and manifest existence.
2. **Content reading** — reads commands, skills, agents, hooks, and MCP server definitions from the filesystem.
3. **File watching** — watches plugin directories for changes and re-reads contents on a 200 ms debounced scheduler.
4. **Observable propagation** — sets the `plugins` observable on each refresh cycle.

Subclasses implement `_discoverPluginSources()` to determine *which* plugin URIs exist.

### Discovery Implementations

**ConfiguredAgentPluginDiscovery** — resolves `chat.pluginLocations` configuration entries (absolute, tilde-expanded, or workspace-relative paths) and watches for config changes.

**MarketplaceAgentPluginDiscovery** — discovers plugins from `IPluginMarketplaceService.installedPlugins` and delegates to the install/repository services for on-disk availability.

### Plugin Formats

Three format adapters implement `IAgentPluginFormatAdapter`:

| | Copilot | Claude | Open Plugin |
|-|---------|--------|-------------|
| Manifest | `plugin.json` | `.claude-plugin/plugin.json` | `.plugin/plugin.json` |
| Hooks config | `hooks.json` | `hooks/hooks.json` | `hooks/hooks.json` |
| Hook parser | `parseCopilotHooks()` | `parseClaudeHooks()` | `parseClaudeHooks()` |
| Special handling | — | `${CLAUDE_PLUGIN_ROOT}` token replacement, `CLAUDE_PLUGIN_ROOT` env var injection | `${PLUGIN_ROOT}` token replacement, `PLUGIN_ROOT` env var injection |

Auto-detection logic: if a `.plugin/plugin.json` manifest exists, the Open Plugin adapter is used; if the plugin URI path contains `.claude` or a `.claude-plugin/plugin.json` manifest exists, the Claude adapter is used; otherwise, the Copilot adapter is used.

### Plugin Contents (Filesystem Layout)

```
<plugin-root>/
├── plugin.json                                    # Copilot manifest
├── .claude-plugin/plugin.json                     # Claude manifest
├── .plugin/plugin.json                            # Open Plugin manifest
├── hooks.json   OR  hooks/hooks.json              # hook definitions
├── .mcp.json                                      # MCP server definitions (optional)
├── commands/
│   ├── do-thing.md                                # → IAgentPluginCommand
│   └── other.md
├── skills/
│   └── my-skill/
│       └── SKILL.md                               # → IAgentPluginSkill
└── agents/
    └── helper.md                                  # → IAgentPluginAgent
```

## Marketplace & Installation

### IPluginMarketplaceService

Manages the catalog of available and installed plugins:

- **Fetch** — reads `chat.pluginMarketplaces` config (GitHub shorthand, Git URLs, or file URIs), fetches `marketplace.json` from each, and returns parsed `IMarketplacePlugin` entries.
- **Installed storage** — persists installed plugins in application-scoped storage (`chat.plugins.installed.v1`). Each entry tracks `{ pluginUri, plugin, enabled }`.
- **Trust** — marketplace canonical IDs must be explicitly trusted before install proceeds (`chat.plugins.trustedMarketplaces.v1`).
- **Auto-update** — checks for upstream changes approximately every 24 hours when `extensions.autoUpdate` is enabled; sets `hasUpdatesAvailable` observable.
- **GitHub caching** — caches raw GitHub API responses with an 8-hour TTL to avoid repeated fetches.

### Marketplace Definition Files

Checked in order per repository:
1. `marketplace.json` → `MarketplaceType.OpenPlugin`
2. `.plugin/marketplace.json` → `MarketplaceType.OpenPlugin`
3. `.github/plugin/marketplace.json` → `MarketplaceType.Copilot`
4. `.claude-plugin/marketplace.json` → `MarketplaceType.Claude`

### IPluginInstallService

Orchestrates install and update workflows:

- `installPlugin()` — checks marketplace trust, delegates to the appropriate source strategy to ensure files are locally available, and registers the plugin in installed storage.
- `updatePlugin()` / `updateAllPlugins()` — pulls latest changes for cloned repositories and re-runs package-manager installs where applicable.

### Plugin Source Strategies (IPluginSource)

Each `PluginSourceKind` has a strategy that knows how to compute cache paths, provision files, update, and clean up:

| Kind | Provisioning | Cache path |
|------|-------------|------------|
| `RelativePath` | No-op (lives inside marketplace repo) | `<cacheRoot>/github.com/<owner>/<repo>/<path>` |
| `GitHub` | `git clone` / `git pull` | `<cacheRoot>/github.com/<owner>/<repo>[/ref_<ref>]` |
| `GitUrl` | `git clone` / `git pull` | `<cacheRoot>/<host>/<path>[/ref_<ref>]` |
| `Npm` | `npm install` in terminal | `<cacheRoot>/npm/<sanitized-package>/` |
| `Pip` | `pip install` in terminal | `<cacheRoot>/pip/<package>/` |

## Configuration & Storage Keys

### Configuration
| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `chat.pluginsEnabled` | boolean | `true` | Master switch for the plugin system |
| `chat.pluginLocations` | `Record<string, boolean>` | `{}` | Local plugin directories to discover |
| `chat.pluginMarketplaces` | `string[]` | `[]` | Marketplace references to fetch from |

### Storage (ApplicationScope, MachineTarget)
| Key | Description |
|-----|-------------|
| `chat.plugins.installed.v1` | Installed marketplace plugins |
| `chat.plugins.trustedMarketplaces.v1` | User-trusted marketplace canonical IDs |
| `chat.plugins.lastFetchedPlugins.v2` | Last marketplace fetch results (persisted until next fetch) |
| `chat.plugins.marketplaces.githubCache.v1` | GitHub API response cache (8 hour TTL) |
| `chat.plugins.lastUpdateCheck.v1` | Timestamp of last periodic update check |

### Enablement Storage
| Key | Description |
|-----|-------------|
| `agentPlugins.enablement` | Per-plugin enable/disable state (shared `EnablementModel`) |

## Reactivity Model

The entire system is built on `IObservable`:

1. **Configuration observables** (`observableConfigValue`) — push changes when settings are modified.
2. **Discovery observables** — each `IAgentPluginDiscovery` exposes an `IObservable<readonly IAgentPlugin[]>` updated on filesystem changes.
3. **Service-level derived** — `AgentPluginService.plugins` is a `derived()` that aggregates all discovery observables, dedupes by URI, and sorts.
4. **Per-plugin observables** — each `IAgentPlugin` has observable properties for hooks, commands, skills, agents, and MCP definitions that update independently on file changes.
5. **UI bindings** — views and editors use `autorun()` / `derived()` to reactively render plugin state.

## Integration Points

- **Chat prompts** — plugin hooks are contributed to the prompt system via the hook infrastructure.
- **MCP servers** — plugins can define MCP server configurations (stdio or SSE) that are registered with the MCP platform.
- **AI Customization UI** — the AI customization views aggregate plugin stats alongside MCP servers, prompts, and other customization surfaces.
- **Extension API** — the plugin system is internal; there is no public `vscode` API surface for third-party access.

## Key Design Patterns

- **Strategy pattern** — format adapters (`IAgentPluginFormatAdapter`) and source strategies (`IPluginSource`) allow the system to support multiple plugin formats and installation mechanisms without coupling.
- **Discovery registry** — `agentPluginDiscoveryRegistry` decouples discovery implementations from the core service via `SyncDescriptor0<IAgentPluginDiscovery>` registration.
- **Disposable management** — plugin entries are tracked in a `Map` keyed by URI string, each with its own `DisposableStore` for file watchers. Removal or format changes dispose the store.
- **Debounced refresh** — filesystem changes trigger a 200 ms `RunOnceScheduler` to batch rapid edits into a single re-read.
- **Deduplication** — multiple discoveries may produce the same plugin URI; the service dedupes via `ResourceSet` and sorts by URI for stable ordering.
- **Lazy instantiation** — the service is registered as `InstantiationType.Delayed` and only created on first injection.
