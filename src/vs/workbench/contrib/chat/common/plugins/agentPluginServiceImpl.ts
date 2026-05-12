/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { Iterable } from '../../../../../base/common/iterator.js';
import { parse as parseJSONC } from '../../../../../base/common/json.js';
import { untildify } from '../../../../../base/common/labels.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ResourceSet } from '../../../../../base/common/map.js';
import { equals } from '../../../../../base/common/objects.js';
import { autorun, derived, derivedOpts, IObservable, ObservablePromise, observableSignal, observableValue } from '../../../../../base/common/observable.js';
import {
	posix,
	win32
} from '../../../../../base/common/path.js';
import {
	basename, isEqualOrParent, joinPath
} from '../../../../../base/common/resources.js';
import { hasKey } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ConfigurationTarget, getConfigValueInTarget, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ContextKeyExpr, ContextKeyExpression, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { observableConfigValue } from '../../../../../platform/observable/common/platformObservableUtils.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { localize } from '../../../../../nls.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { ExtensionIdentifier, IExtensionManifest } from '../../../../../platform/extensions/common/extensions.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import {
	parseComponentPathConfig,
	resolveComponentDirs,
	readSkills,
	readMarkdownComponents,
	parseMcpServerDefinitionMap,
	detectPluginFormat,
	type IPluginFormatConfig,
	type IParsedHookGroup,
} from '../../../../../platform/agentPlugins/common/pluginParsers.js';
import { Extensions, IExtensionFeaturesRegistry, IExtensionFeatureTableRenderer, IRenderedData, IRowData, ITableData } from '../../../../services/extensionManagement/common/extensionFeatures.js';
import * as extensionsRegistry from '../../../../services/extensions/common/extensionsRegistry.js';
import { IPathService } from '../../../../services/path/common/pathService.js';
import { ChatConfiguration } from '../constants.js';
import { EnablementModel, IEnablementModel } from '../enablement.js';
import { HookType } from '../promptSyntax/hookTypes.js';
import { IAgentPluginRepositoryService } from './agentPluginRepositoryService.js';
import { agentPluginDiscoveryRegistry, IAgentPlugin, IAgentPluginDiscovery, IAgentPluginHook, IAgentPluginInstruction, IAgentPluginMcpServerDefinition, IAgentPluginService } from './agentPluginService.js';
import { IMarketplacePlugin, IPluginMarketplaceService } from './pluginMarketplaceService.js';

// Re-export shared helpers so existing consumers (including tests) continue to work.
export { shellQuotePluginRootInCommand, resolveMcpServersMap, convertBareEnvVarsToVsCodeSyntax } from '../../../../../platform/agentPlugins/common/pluginParsers.js';

/**
 * Converts platform-layer parsed hook groups to the workbench's {@link IAgentPluginHook} type.
 * The canonical type strings from the platform layer map directly to {@link HookType} enum values.
 */
function toAgentPluginHooks(groups: readonly IParsedHookGroup[]): IAgentPluginHook[] {
	return groups
		.filter(g => Object.values(HookType).includes(g.type as HookType))
		.map(g => ({
			type: g.type as HookType,
			hooks: g.commands,
			uri: g.uri,
			originalId: g.originalId,
		}));
}

/** File suffixes accepted for rule/instruction files (longest first for correct name stripping). */
const RULE_FILE_SUFFIXES = ['.instructions.md', '.mdc', '.md'];

/**
 * Resolves the workspace folder that contains the plugin URI for cwd resolution,
 * falling back to the first workspace folder for plugins outside the workspace.
 */
function resolveWorkspaceRoot(pluginUri: URI, workspaceContextService: IWorkspaceContextService): URI | undefined {
	const defaultFolder = workspaceContextService.getWorkspace().folders[0];
	const folder = workspaceContextService.getWorkspaceFolder(pluginUri) ?? defaultFolder;
	return folder?.uri;
}

export class AgentPluginService extends Disposable implements IAgentPluginService {

	declare readonly _serviceBrand: undefined;

	public readonly plugins: IObservable<readonly IAgentPlugin[]>;
	public readonly enablementModel: IEnablementModel;

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService,
		@IStorageService storageService: IStorageService,
	) {
		super();

		this.enablementModel = this._register(new EnablementModel('agentPlugins.enablement', storageService));

		const pluginsEnabled = observableConfigValue(ChatConfiguration.PluginsEnabled, true, configurationService);

		const discoveries: IAgentPluginDiscovery[] = [];
		for (const descriptor of agentPluginDiscoveryRegistry.getAll()) {
			const discovery = instantiationService.createInstance(descriptor);
			this._register(discovery);
			discoveries.push(discovery);
			discovery.start(this.enablementModel);
		}


		this.plugins = derived(read => {
			if (!pluginsEnabled.read(read)) {
				return [];
			}
			return this._dedupeAndSort(discoveries.flatMap(d => d.plugins.read(read)));
		});
	}

	private _dedupeAndSort(plugins: readonly IAgentPlugin[]): readonly IAgentPlugin[] {
		const unique: IAgentPlugin[] = [];
		const seen = new ResourceSet();

		for (const plugin of plugins) {
			if (seen.has(plugin.uri)) {
				continue;
			}

			seen.add(plugin.uri);
			unique.push(plugin);
		}

		unique.sort((a, b) => a.uri.toString().localeCompare(b.uri.toString()));
		return unique;
	}
}

type PluginEntry = IAgentPlugin;

/**
 * Describes a single discovered plugin source, before the shared
 * infrastructure builds the full {@link IAgentPlugin} from it.
 */
interface IPluginSource {
	readonly uri: URI;
	readonly fromMarketplace: IMarketplacePlugin | undefined;
	/** Repository root that serves as the boundary for component path resolution. */
	readonly repositoryUri?: URI;
	/** Called when remove is invoked on the plugin */
	remove(): void;
}

/**
 * Shared base class for plugin discovery implementations. Contains the common
 * logic for reading plugin contents (commands, skills, agents, hooks, MCP server
 * definitions) from the filesystem and watching for live updates.
 *
 * Subclasses implement {@link _discoverPluginSources} to determine *which*
 * plugins exist, while this class handles the rest.
 */
export abstract class AbstractAgentPluginDiscovery extends Disposable implements IAgentPluginDiscovery {

	private readonly _pluginEntries = new Map<string, { plugin: PluginEntry; store: DisposableStore; format: IPluginFormatConfig }>();

	private readonly _plugins = observableValue<readonly IAgentPlugin[]>('discoveredAgentPlugins', []);
	public readonly plugins: IObservable<readonly IAgentPlugin[]> = this._plugins;

	private _discoverVersion = 0;
	protected _enablementModel!: IEnablementModel;

	constructor(
		protected readonly _fileService: IFileService,
		protected readonly _pathService: IPathService,
		protected readonly _logService: ILogService,
		protected readonly _workspaceContextService: IWorkspaceContextService,
	) {
		super();
	}

	public abstract start(enablementModel: IEnablementModel): void;

	protected async _refreshPlugins(): Promise<void> {
		const version = ++this._discoverVersion;
		const plugins = await this._discoverAndBuildPlugins();
		if (version !== this._discoverVersion || this._store.isDisposed) {
			return;
		}

		this._plugins.set(plugins, undefined);
	}

	/** Subclasses return plugin sources to discover. */
	protected abstract _discoverPluginSources(): Promise<readonly IPluginSource[]>;

	private async _discoverAndBuildPlugins(): Promise<readonly IAgentPlugin[]> {
		const sources = await this._discoverPluginSources();
		const plugins: IAgentPlugin[] = [];
		const seenPluginUris = new Set<string>();

		for (const source of sources) {
			const key = source.uri.toString();
			if (!seenPluginUris.has(key)) {
				seenPluginUris.add(key);
				const format = await detectPluginFormat(source.uri, this._fileService);
				plugins.push(this._toPlugin(source.uri, format, source.fromMarketplace, source.repositoryUri, () => source.remove()));
			}
		}

		this._disposePluginEntriesExcept(seenPluginUris);

		plugins.sort((a, b) => a.uri.toString().localeCompare(b.uri.toString()));
		return plugins;
	}

	protected async _pathExists(resource: URI): Promise<boolean> {
		try {
			await this._fileService.resolve(resource);
			return true;
		} catch {
			return false;
		}
	}

	private _toPlugin(uri: URI, format: IPluginFormatConfig, fromMarketplace: IMarketplacePlugin | undefined, repositoryUri: URI | undefined, removeCallback: () => void): IAgentPlugin {
		const key = uri.toString();
		const existing = this._pluginEntries.get(key);
		if (existing) {
			if (existing.format.format !== format.format) {
				existing.store.dispose();
				this._pluginEntries.delete(key);
			} else {
				return existing.plugin;
			}
		}

		const store = new DisposableStore();
		const enablement = derived(r => this._enablementModel.readEnabled(key, r));

		// Track current component directories for the file watcher. These are
		// updated whenever the manifest is read (inside each component reader).
		const manifest = observableValue<Record<string, unknown> | undefined>('agentPluginManifest', undefined);

		const observeComponent = <T>(
			prop: string,
			doRead: (uris: readonly URI[]) => Promise<readonly T[]>,
			tryReadEmbedded?: (section: unknown) => Promise<T[] | undefined>,
			defaultPath = prop,
		): IObservable<readonly T[]> => {
			const secondObs = derivedOpts({ equalsFn: equals }, reader => manifest.read(reader)?.[prop]);

			const wrapped = derived(reader => {
				const section = secondObs.read(reader);
				if (tryReadEmbedded) {
					if (section && typeof section === 'object' && !Array.isArray(section) && !(hasKey(section, { paths: true }))) {
						return { kind: 'const', data: new ObservablePromise(tryReadEmbedded(section)) } as const;
					}
				}

				const paths = parseComponentPathConfig(section);
				const dirs = resolveComponentDirs(uri, defaultPath, paths, repositoryUri);
				for (const d of dirs) {
					const watcher = this._fileService.createWatcher(d, { recursive: false, excludes: [] });
					reader.store.add(watcher);
					reader.store.add(watcher.onDidChange(() => changeTrigger.trigger(undefined)));
				}

				return { kind: 'dirs', dirs: dirs } as const;
			});

			const changeTrigger = observableSignal('fileChange');

			const promised = derived(reader => {
				const w = wrapped.read(reader);
				if (w.kind === 'const') {
					return w.data.promiseResult;
				} else {
					changeTrigger.read(reader); // re-run when a relevant file change occurs
					const promise = new ObservablePromise(doRead(w.dirs));
					return promise.promiseResult;
				}
			});

			const result = promised.map((w, r) => w.read(r)?.data ?? Iterable.empty());

			return result.recomputeInitiallyAndOnChange(store);
		};

		const manifestUri = joinPath(uri, format.manifestPath);
		const commands = observeComponent('commands', d => readMarkdownComponents(d, this._fileService));
		const skills = observeComponent('skills', d => readSkills(uri, d, this._fileService));
		const agents = observeComponent('agents', d => readMarkdownComponents(d, this._fileService));
		const instructions = observeComponent('rules', d => this._readRules(d));
		const hooks = observeComponent(
			'hooks',
			paths => this._readHooksFromPaths(uri, paths, format),
			async section => {
				const userHome = (await this._pathService.userHome()).fsPath;
				const workspaceRoot = resolveWorkspaceRoot(uri, this._workspaceContextService);
				return toAgentPluginHooks(format.parseHooks(manifestUri, section, uri, workspaceRoot, userHome));
			},
			format.hookConfigPath,
		);

		const mcpServerDefinitions = observeComponent(
			'mcpServers',
			paths => this._readMcpDefinitionsFromPaths(paths, uri.fsPath, format),
			async section => parseMcpServerDefinitionMap(manifestUri, { mcpServers: section }, uri.fsPath, format),
			'.mcp.json',
		);

		// Read the manifest initially and re-read whenever manifest files change.
		const readManifest = async () => {
			manifest.set(await this._readManifest(uri, format), undefined);
		};

		const manifestWatcher = this._fileService.createWatcher(
			manifestUri,
			{ recursive: false, excludes: [] },
		);
		store.add(manifestWatcher);
		store.add(manifestWatcher.onDidChange(() => readManifest()));

		readManifest();

		const plugin: PluginEntry = {
			uri,
			label: fromMarketplace?.name ?? basename(uri),
			enablement,
			remove: removeCallback,
			hooks,
			commands,
			skills,
			agents,
			instructions,
			mcpServerDefinitions,
			fromMarketplace,
		};

		this._pluginEntries.set(key, { store, plugin, format });

		return plugin;
	}

	private async _readManifest(pluginUri: URI, format: IPluginFormatConfig): Promise<Record<string, unknown> | undefined> {
		const json = await this._readJsonFile(joinPath(pluginUri, format.manifestPath));
		if (json && typeof json === 'object') {
			return json as Record<string, unknown>;
		}
		return undefined;
	}

	/**
	 * Reads hook definitions from a list of resolved paths (JSON files).
	 * Each path is tried in order; the first one that contains valid hook
	 * JSON is used.
	 */
	private async _readHooksFromPaths(pluginUri: URI, paths: readonly URI[], format: IPluginFormatConfig): Promise<readonly IAgentPluginHook[]> {
		const userHome = (await this._pathService.userHome()).fsPath;
		const workspaceRoot = resolveWorkspaceRoot(pluginUri, this._workspaceContextService);
		for (const hookPath of paths) {
			const json = await this._readJsonFile(hookPath);
			if (json) {
				try {
					return toAgentPluginHooks(format.parseHooks(hookPath, json, pluginUri, workspaceRoot, userHome));
				} catch (e) {
					this._logService.info(`[AgentPluginDiscovery] Failed to parse hooks from ${hookPath.toString()}:`, e);
				}
			}
		}
		return [];
	}

	/**
	 * Reads MCP server definitions from a list of resolved paths (JSON files).
	 * Definitions from all files are merged; the first definition for a given
	 * server name wins.
	 */
	private async _readMcpDefinitionsFromPaths(paths: readonly URI[], pluginFsPath: string, format: IPluginFormatConfig): Promise<readonly IAgentPluginMcpServerDefinition[]> {
		const merged = new Map<string, IAgentPluginMcpServerDefinition>();
		for (const mcpPath of paths) {
			const json = await this._readJsonFile(mcpPath);
			for (const def of parseMcpServerDefinitionMap(mcpPath, json, pluginFsPath, format)) {
				if (!merged.has(def.name)) {
					merged.set(def.name, def);
				}
			}
		}
		return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name));
	}

	private async _readJsonFile(uri: URI): Promise<unknown | undefined> {
		try {
			const fileContents = await this._fileService.readFile(uri);
			return parseJSONC(fileContents.value.toString());
		} catch {
			return undefined;
		}
	}

	/**
	 * Scans directories for rule/instruction files (`.mdc`, `.md`,
	 * `.instructions.md`), returning `{ uri, name }` entries where name is
	 * derived from the filename minus the matched suffix.
	 */
	private async _readRules(dirs: readonly URI[]): Promise<readonly IAgentPluginInstruction[]> {
		const seen = new Set<string>();
		const items: IAgentPluginInstruction[] = [];

		const matchSuffix = (filename: string): string | undefined => {
			const lower = filename.toLowerCase();
			return RULE_FILE_SUFFIXES.find(s => lower.endsWith(s));
		};

		const addItem = (name: string, uri: URI) => {
			if (!seen.has(name)) {
				seen.add(name);
				items.push({ uri, name });
			}
		};

		for (const dir of dirs) {
			let stat;
			try {
				stat = await this._fileService.resolve(dir);
			} catch {
				continue;
			}

			if (stat.isFile) {
				const suffix = matchSuffix(basename(dir));
				if (suffix) {
					addItem(basename(dir).slice(0, -suffix.length), dir);
				}
				continue;
			}

			if (!stat.isDirectory || !stat.children) {
				continue;
			}

			for (const child of stat.children) {
				if (!child.isFile) {
					continue;
				}
				const suffix = matchSuffix(child.name);
				if (suffix) {
					addItem(child.name.slice(0, -suffix.length), child.resource);
				}
			}
		}

		items.sort((a, b) => a.name.localeCompare(b.name));
		return items;
	}

	private _disposePluginEntriesExcept(keep: Set<string>): void {
		for (const [key, entry] of this._pluginEntries) {
			if (!keep.has(key)) {
				entry.store.dispose();
				this._pluginEntries.delete(key);
			}
		}
	}

	public override dispose(): void {
		this._disposePluginEntriesExcept(new Set<string>());
		super.dispose();
	}
}

export class ConfiguredAgentPluginDiscovery extends AbstractAgentPluginDiscovery {

	private readonly _pluginLocationsConfig: IObservable<Record<string, boolean>>;

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IFileService fileService: IFileService,
		@IPluginMarketplaceService private readonly _pluginMarketplaceService: IPluginMarketplaceService,
		@IWorkspaceContextService workspaceContextService: IWorkspaceContextService,
		@IPathService pathService: IPathService,
		@ILogService logService: ILogService,
	) {
		super(fileService, pathService, logService, workspaceContextService);
		this._pluginLocationsConfig = observableConfigValue<Record<string, boolean>>(ChatConfiguration.PluginLocations, {}, _configurationService);
	}

	public override start(enablementModel: IEnablementModel): void {
		this._enablementModel = enablementModel;
		const scheduler = this._register(new RunOnceScheduler(() => this._refreshPlugins(), 0));
		this._register(autorun(reader => {
			this._pluginLocationsConfig.read(reader);
			scheduler.schedule();
		}));
		scheduler.schedule();
	}

	protected override async _discoverPluginSources(): Promise<readonly IPluginSource[]> {
		const sources: IPluginSource[] = [];
		const config = this._pluginLocationsConfig.get();
		const userHome = await this._getUserHome();

		for (const [path, enabled] of Object.entries(config)) {
			if (!path.trim() || enabled === false) {
				continue;
			}

			const resources = this._resolvePluginPath(path.trim(), userHome);
			for (const resource of resources) {
				let stat;
				try {
					stat = await this._fileService.resolve(resource);
				} catch {
					this._logService.debug(`[ConfiguredAgentPluginDiscovery] Could not resolve plugin path: ${resource.toString()}`);
					continue;
				}

				if (!stat.isDirectory) {
					this._logService.debug(`[ConfiguredAgentPluginDiscovery] Plugin path is not a directory: ${resource.toString()}`);
					continue;
				}

				const fromMarketplace = this._pluginMarketplaceService.getMarketplacePluginMetadata(stat.resource);
				const configKey = path;
				sources.push({
					uri: stat.resource,
					fromMarketplace,
					remove: () => this._removePluginPath(configKey),
				});
			}
		}

		return sources;
	}

	private async _getUserHome(): Promise<string> {
		const userHome = await this._pathService.userHome();
		return userHome.scheme === 'file' ? userHome.fsPath : userHome.path;
	}

	/**
	 * Resolves a plugin path to one or more resource URIs. Supports:
	 * - Absolute paths (used directly)
	 * - Tilde paths (expanded to user home directory)
	 * - Relative paths (resolved against each workspace folder)
	 */
	private _resolvePluginPath(path: string, userHome: string): URI[] {
		if (path.startsWith('~')) {
			path = untildify(path, userHome);
		}

		// Handle absolute paths
		if (win32.isAbsolute(path) || posix.isAbsolute(path)) {
			return [URI.file(path)];
		}

		return this._workspaceContextService.getWorkspace().folders.map(
			folder => joinPath(folder.uri, path)
		);
	}

	/**
	 * Removes a plugin path from `chat.pluginLocations` in the most specific
	 * config target where the key is defined.
	 */
	private _removePluginPath(configKey: string): void {
		const inspected = this._configurationService.inspect<Record<string, boolean>>(ChatConfiguration.PluginLocations);

		const targets = [
			ConfigurationTarget.WORKSPACE_FOLDER,
			ConfigurationTarget.WORKSPACE,
			ConfigurationTarget.USER_LOCAL,
			ConfigurationTarget.USER_REMOTE,
			ConfigurationTarget.USER,
			ConfigurationTarget.APPLICATION,
		];

		for (const target of targets) {
			const mapping = getConfigValueInTarget(inspected, target);
			if (mapping && Object.prototype.hasOwnProperty.call(mapping, configKey)) {
				const updated = { ...mapping };
				delete updated[configKey];
				this._configurationService.updateValue(
					ChatConfiguration.PluginLocations,
					updated,
					target,
				);
				return;
			}
		}
	}
}

export class MarketplaceAgentPluginDiscovery extends AbstractAgentPluginDiscovery {

	constructor(
		@IPluginMarketplaceService private readonly _pluginMarketplaceService: IPluginMarketplaceService,
		@IAgentPluginRepositoryService private readonly _pluginRepositoryService: IAgentPluginRepositoryService,
		@IFileService fileService: IFileService,
		@IPathService pathService: IPathService,
		@ILogService logService: ILogService,
		@IWorkspaceContextService workspaceContextService: IWorkspaceContextService,
	) {
		super(fileService, pathService, logService, workspaceContextService);
	}

	public override start(enablementModel: IEnablementModel): void {
		this._enablementModel = enablementModel;
		const scheduler = this._register(new RunOnceScheduler(() => this._refreshPlugins(), 0));
		this._register(autorun(reader => {
			this._pluginMarketplaceService.installedPlugins.read(reader);
			scheduler.schedule();
		}));
		scheduler.schedule();
	}

	protected override async _discoverPluginSources(): Promise<readonly IPluginSource[]> {
		const installed = this._pluginMarketplaceService.installedPlugins.get();
		const sources: IPluginSource[] = [];

		for (const entry of installed) {
			let stat;
			try {
				stat = await this._fileService.resolve(entry.pluginUri);
			} catch {
				this._logService.debug(`[MarketplaceAgentPluginDiscovery] Could not resolve installed plugin: ${entry.pluginUri.toString()}`);
				continue;
			}

			if (!stat.isDirectory) {
				this._logService.debug(`[MarketplaceAgentPluginDiscovery] Installed plugin path is not a directory: ${entry.pluginUri.toString()}`);
				continue;
			}

			const repositoryUri = this._pluginRepositoryService.getRepositoryUri(entry.plugin.marketplaceReference, entry.plugin.marketplaceType);

			sources.push({
				uri: stat.resource,
				fromMarketplace: entry.plugin,
				repositoryUri,
				remove: () => {
					this._enablementModel.remove(stat.resource.toString());
					this._pluginMarketplaceService.removeInstalledPlugin(entry.pluginUri);

					// Pass remaining installed descriptors so the repository service
					// can skip deletion when other plugins share the same cache dir.
					const remaining = this._pluginMarketplaceService.installedPlugins.get();
					this._pluginRepositoryService.cleanupPluginSource(
						entry.plugin,
						remaining.map(e => e.plugin.sourceDescriptor),
					).catch(error => {
						this._logService.error('[MarketplaceAgentPluginDiscovery] Failed to clean up plugin source', error);
					});
				},
			});
		}

		return sources;
	}
}

// ---------------------------------------------------------------------------
// Copilot CLI plugin discovery
// ---------------------------------------------------------------------------

/**
 * Directory under the Copilot CLI home where installed plugins are cached.
 * Layout is two levels deep: `<marketplace>/<plugin>/`. Direct (non-marketplace)
 * installs use the reserved marketplace segment `_direct`.
 *
 * See `src/plugins/manager.ts` in the copilot-agent-runtime repo.
 */
const COPILOT_CLI_INSTALLED_PLUGINS_DIR = '.copilot/installed-plugins';

/**
 * Discovers plugins installed by the Copilot CLI under
 * `~/.copilot/installed-plugins/<marketplace>/<plugin>/`. Each leaf directory
 * is treated as a plugin root, allowing CLI-installed plugins (both
 * marketplace and direct) to surface in VS Code without a separate install.
 */
export class CopilotCliAgentPluginDiscovery extends AbstractAgentPluginDiscovery {

	constructor(
		@IFileService fileService: IFileService,
		@IPathService pathService: IPathService,
		@ILogService logService: ILogService,
		@IWorkspaceContextService workspaceContextService: IWorkspaceContextService,
		@IDialogService private readonly _dialogService: IDialogService,
	) {
		super(fileService, pathService, logService, workspaceContextService);
	}

	public override start(enablementModel: IEnablementModel): void {
		this._enablementModel = enablementModel;
		const scheduler = this._register(new RunOnceScheduler(() => this._refreshPlugins(), 0));

		const watcherStore = this._register(new DisposableStore());
		const setupWatchers = async () => {
			watcherStore.clear();
			if (this._store.isDisposed) {
				return;
			}

			const root = await this._getInstalledPluginsDir();

			// Walk up to the deepest existing ancestor and watch each directory
			// from there down. Non-recursive watchers fail if the target doesn't
			// exist, so we need to watch an existing parent (e.g. ~/.copilot or
			// userHome) to detect the first-ever plugin install.
			const dirsToWatch: URI[] = [];
			let candidate: URI | undefined = root;
			while (candidate) {
				dirsToWatch.unshift(candidate);
				const parent = joinPath(candidate, '..');
				if (parent.toString() === candidate.toString()) {
					break;
				}
				if (await this._pathExists(parent)) {
					dirsToWatch.unshift(parent);
					break;
				}
				candidate = parent;
			}

			for (const dir of dirsToWatch) {
				if (!(await this._pathExists(dir))) {
					continue;
				}
				const watcher = this._fileService.createWatcher(dir, { recursive: false, excludes: [] });
				watcherStore.add(watcher);
				watcherStore.add(watcher.onDidChange(() => {
					scheduler.schedule();
					// Re-attach watchers in case directories appeared/disappeared.
					setupWatchers().catch(() => { /* watchers are best-effort */ });
				}));
			}

			// Watch each marketplace bucket non-recursively for plugin
			// install/uninstall events.
			let rootStat;
			try {
				rootStat = await this._fileService.resolve(root);
			} catch {
				return;
			}
			if (!rootStat.children) {
				return;
			}
			for (const marketplaceDir of rootStat.children) {
				if (!marketplaceDir.isDirectory) {
					continue;
				}
				const watcher = this._fileService.createWatcher(marketplaceDir.resource, { recursive: false, excludes: [] });
				watcherStore.add(watcher);
				watcherStore.add(watcher.onDidChange(() => scheduler.schedule()));
			}
		};

		setupWatchers().catch(() => { /* watchers are best-effort */ });
		scheduler.schedule();
	}

	private async _getInstalledPluginsDir(): Promise<URI> {
		const userHome = await this._pathService.userHome();
		return joinPath(userHome, COPILOT_CLI_INSTALLED_PLUGINS_DIR);
	}

	protected override async _discoverPluginSources(): Promise<readonly IPluginSource[]> {
		const root = await this._getInstalledPluginsDir();

		let rootStat;
		try {
			rootStat = await this._fileService.resolve(root);
		} catch {
			// Directory doesn't exist — Copilot CLI hasn't installed any plugins.
			return [];
		}

		if (!rootStat.isDirectory || !rootStat.children) {
			return [];
		}

		const sources: IPluginSource[] = [];
		// Each immediate child is a marketplace bucket (e.g. `_direct`,
		// `<marketplace-name>`); each grandchild is a plugin root.
		for (const marketplaceDir of rootStat.children) {
			if (!marketplaceDir.isDirectory) {
				continue;
			}

			let marketplaceStat;
			try {
				marketplaceStat = await this._fileService.resolve(marketplaceDir.resource);
			} catch {
				continue;
			}

			if (!marketplaceStat.children) {
				continue;
			}

			for (const pluginDir of marketplaceStat.children) {
				if (!pluginDir.isDirectory) {
					continue;
				}
				sources.push({
					uri: pluginDir.resource,
					fromMarketplace: undefined,
					remove: () => this._promptRemove(pluginDir.resource),
				});
			}
		}

		return sources;
	}

	private async _promptRemove(resource: URI): Promise<void> {
		const { confirmed } = await this._dialogService.confirm({
			message: localize('copilotCliPlugin.remove.confirm', "This plugin was installed by the Copilot CLI. Remove it from disk?"),
			detail: localize('copilotCliPlugin.remove.detail', "The plugin directory '{0}' will be moved to the trash. You can reinstall it later via the Copilot CLI.", resource.fsPath),
			primaryButton: localize('copilotCliPlugin.remove.primary', "Remove"),
		});
		if (!confirmed) {
			return;
		}

		try {
			await this._fileService.del(resource, { recursive: true, useTrash: true });
			this._enablementModel.remove(resource.toString());
		} catch (error) {
			this._logService.error('[CopilotCliAgentPluginDiscovery] Failed to remove plugin', error);
		}
	}
}

// ---------------------------------------------------------------------------
// Extension-contributed plugin discovery
// ---------------------------------------------------------------------------

interface IRawChatPluginContribution {
	readonly path: string;
	readonly when?: string;
}

const epPlugins = extensionsRegistry.ExtensionsRegistry.registerExtensionPoint<IRawChatPluginContribution[]>({
	extensionPoint: 'chatPlugins',
	jsonSchema: {
		description: localize('chatPlugins.schema.description', 'Contributes agent plugins for chat.'),
		type: 'array',
		items: {
			additionalProperties: false,
			type: 'object',
			defaultSnippets: [{
				body: {
					path: './relative/path/to/plugin/',
				}
			}],
			required: ['path'],
			properties: {
				path: {
					description: localize('chatPlugins.property.path', 'Path to the agent plugin root directory relative to the extension root.'),
					type: 'string'
				},
				when: {
					description: localize('chatPlugins.property.when', '(Optional) A condition which must be true to enable this plugin.'),
					type: 'string'
				}
			}
		}
	}
});

export class ExtensionAgentPluginDiscovery extends AbstractAgentPluginDiscovery {

	private readonly _extensionPlugins = new Map<string, { uri: URI; when: ContextKeyExpression | undefined; extensionId: string }>();
	private readonly _whenKeys = new Set<string>();

	constructor(
		@ICommandService private readonly _commandService: ICommandService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IDialogService private readonly _dialogService: IDialogService,
		@IFileService fileService: IFileService,
		@IPathService pathService: IPathService,
		@ILogService logService: ILogService,
		@IWorkspaceContextService workspaceContextService: IWorkspaceContextService,
	) {
		super(fileService, pathService, logService, workspaceContextService);
	}

	public override start(enablementModel: IEnablementModel): void {
		this._enablementModel = enablementModel;
		const scheduler = this._register(new RunOnceScheduler(() => this._refreshPlugins(), 0));
		this._register(this._contextKeyService.onDidChangeContext(e => {
			if (e.affectsSome(this._whenKeys)) {
				scheduler.schedule();
			}
		}));
		epPlugins.setHandler((_extensions, delta) => {
			for (const ext of delta.added) {
				for (const raw of ext.value) {
					if (!raw.path) {
						ext.collector.error(localize('extension.plugin.missing.path', "Extension '{0}' cannot register a chatPlugins entry without a path.", ext.description.identifier.value));
						continue;
					}
					const pluginUri = joinPath(ext.description.extensionLocation, raw.path);
					if (!isEqualOrParent(pluginUri, ext.description.extensionLocation)) {
						ext.collector.error(localize('extension.plugin.invalid.path', "Extension '{0}' chatPlugins entry '{1}' resolves outside the extension.", ext.description.identifier.value, raw.path));
						continue;
					}
					let whenExpr: ContextKeyExpression | undefined;
					if (raw.when) {
						whenExpr = ContextKeyExpr.deserialize(raw.when);
						if (!whenExpr) {
							ext.collector.error(localize('extension.plugin.invalid.when', "Extension '{0}' chatPlugins entry '{1}' has an invalid when clause: '{2}'.", ext.description.identifier.value, raw.path, raw.when));
							continue;
						}
					}
					this._extensionPlugins.set(extensionPluginKey(ext.description.identifier, raw.path), { uri: pluginUri, when: whenExpr, extensionId: ext.description.identifier.value });
				}
			}
			for (const ext of delta.removed) {
				for (const raw of ext.value) {
					this._extensionPlugins.delete(extensionPluginKey(ext.description.identifier, raw.path));
				}
			}
			this._rebuildWhenKeys();
			scheduler.schedule();
		});
	}

	private _rebuildWhenKeys(): void {
		this._whenKeys.clear();
		for (const { when } of this._extensionPlugins.values()) {
			if (when) {
				for (const key of when.keys()) {
					this._whenKeys.add(key);
				}
			}
		}
	}

	protected override async _discoverPluginSources(): Promise<readonly IPluginSource[]> {
		const sources: IPluginSource[] = [];
		for (const [, entry] of this._extensionPlugins) {
			if (entry.when && !this._contextKeyService.contextMatchesRules(entry.when)) {
				continue;
			}
			let stat;
			try {
				stat = await this._fileService.resolve(entry.uri);
			} catch {
				this._logService.debug(`[ExtensionAgentPluginDiscovery] Could not resolve extension plugin path: ${entry.uri.toString()}`);
				continue;
			}
			if (!stat.isDirectory) {
				this._logService.debug(`[ExtensionAgentPluginDiscovery] Extension plugin path is not a directory: ${entry.uri.toString()}`);
				continue;
			}
			sources.push({
				uri: stat.resource,
				fromMarketplace: undefined,
				remove: () => this._promptUninstallExtension(entry.extensionId),
			});
		}
		return sources;
	}

	private async _promptUninstallExtension(extensionId: string): Promise<void> {
		const { confirmed } = await this._dialogService.confirm({
			message: localize('uninstallExtensionForPlugin', "This plugin is provided by the extension '{0}'. Do you want to uninstall the extension?", extensionId),
		});
		if (confirmed) {
			await this._commandService.executeCommand('workbench.extensions.uninstallExtension', extensionId);
		}
	}
}

function extensionPluginKey(extensionId: ExtensionIdentifier, path: string): string {
	return `${extensionId.value}/${path}`;
}

class ChatPluginsDataRenderer extends Disposable implements IExtensionFeatureTableRenderer {
	readonly type = 'table' as const;

	shouldRender(manifest: IExtensionManifest): boolean {
		return !!manifest.contributes?.chatPlugins?.length;
	}

	render(manifest: IExtensionManifest): IRenderedData<ITableData> {
		const contributions = manifest.contributes?.chatPlugins ?? [];
		if (!contributions.length) {
			return { data: { headers: [], rows: [] }, dispose: () => { } };
		}

		const headers = [
			localize('chatPluginsPath', "Path"),
			localize('chatPluginsWhen', "When"),
		];

		const rows: IRowData[][] = contributions.map(d => [
			d.path,
			d.when ?? '-',
		]);

		return {
			data: { headers, rows },
			dispose: () => { }
		};
	}
}

Registry.as<IExtensionFeaturesRegistry>(Extensions.ExtensionFeaturesRegistry).registerExtensionFeature({
	id: 'chatPlugins',
	label: localize('chatPlugins', "Chat Plugins"),
	access: {
		canToggle: false
	},
	renderer: new SyncDescriptor(ChatPluginsDataRenderer),
});
