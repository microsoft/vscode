/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { Event } from '../../../../../base/common/event.js';
import { Iterable } from '../../../../../base/common/iterator.js';
import { ParseError, parse as parseJSONC } from '../../../../../base/common/json.js';
import { untildify } from '../../../../../base/common/labels.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { equals } from '../../../../../base/common/objects.js';
import { autorun, derived, derivedOpts, IObservable, IReader, ISettableObservable, ITransaction, observableFromEvent, ObservablePromise, observableSignal, observableValue, transaction } from '../../../../../base/common/observable.js';
import {
	basename, dirname, extUriBiasedIgnorePathCase, isEqual, isEqualOrParent, joinPath
} from '../../../../../base/common/resources.js';
import { hasKey } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ConfigurationTarget, getConfigValueInTarget, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { FileChangesEvent, FileChangeType, IFileService } from '../../../../../platform/files/common/files.js';
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
	resolvePluginComponentDirs,
	getPluginManifestComponent,
	readPluginSkills,
	readMarkdownComponents,
	readPluginManifest,
	readPluginMcpServers,
	parseMcpServerDefinitionMap,
	detectPluginFormat,
	type PluginComponent,
	type IPluginFormatConfig,
	type IParsedHookGroup,
} from '../../../../../platform/agentPlugins/common/pluginParsers.js';
import { Extensions, IExtensionFeaturesRegistry, IExtensionFeatureTableRenderer, IRenderedData, IRowData, ITableData } from '../../../../services/extensionManagement/common/extensionFeatures.js';
import * as extensionsRegistry from '../../../../services/extensions/common/extensionsRegistry.js';
import { IPathService } from '../../../../services/path/common/pathService.js';
import { ChatConfiguration } from '../constants.js';
import { EnablementModel, IEnablementModel } from '../enablement.js';
import { AUTOMATION_BLUEPRINT_FILE_SUFFIX, parseAutomationBlueprint } from '../automations/automationBlueprint.js';
import { HookType } from '../promptSyntax/hookTypes.js';
import { AgentPluginCollisionEnablementModel, getAgentPluginPolicyEnablement, getAgentPluginPolicyId, getCanonicalAgentPluginCollisionGroups, getSortedAgentPlugins, IDiscoveredAgentPlugins, isAgentPluginBlockedByPolicy, isAgentPluginForceEnabledByPolicy } from './agentPluginEnablement.js';
import { IAgentPluginRepositoryService } from './agentPluginRepositoryService.js';
import { AgentPluginDiscoveryPriority, agentPluginDiscoveryRegistry, IAgentPlugin, IAgentPluginAutomation, IAgentPluginDiscovery, IAgentPluginHook, IAgentPluginInstruction, IAgentPluginService } from './agentPluginService.js';
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
		@ILogService logService: ILogService,
	) {
		super();

		const baseEnablementModel = this._register(new EnablementModel('agentPlugins.enablement', storageService));

		const pluginsEnabled = observableConfigValue(ChatConfiguration.PluginsEnabled, true, configurationService);

		const discoveries: IAgentPluginDiscoveryWithPriority[] = [];
		for (const registration of agentPluginDiscoveryRegistry.getAll()) {
			const discovery = instantiationService.createInstance(registration.descriptor);
			this._register(discovery);
			discoveries.push({ discovery, priority: registration.priority, order: registration.order });
		}

		// Policy-driven enforcement, applied after discovery so that enterprise
		// policy is honored regardless of which discovery source surfaces a
		// plugin (local paths, marketplace, CLI install dir).
		const enabledPluginsPolicy = observableFromEvent(this,
			Event.filter(configurationService.onDidChangeConfiguration, e => e.affectsConfiguration(ChatConfiguration.EnabledPlugins)),
			() => configurationService.inspect<Record<string, boolean>>(ChatConfiguration.EnabledPlugins).policyValue,
		);

		const policyEnablement = derived(reader => {
			const discoveredPlugins = readDiscoveredAgentPlugins(discoveries, reader);
			const policy = enabledPluginsPolicy.read(reader);
			const result = new Map<string, boolean>();
			if (discoveredPlugins && policy) {
				for (const { plugins } of discoveredPlugins) {
					for (const plugin of plugins) {
						const policyValue = getAgentPluginPolicyEnablement(plugin, policy);
						if (policyValue !== undefined) {
							result.set(plugin.uri.toString(), policyValue);
						}
					}
				}
			}
			return result;
		});

		const collisionGroups = derived(reader => {
			if (!pluginsEnabled.read(reader)) {
				return new Map<string, readonly string[]>();
			}
			const discoveredPlugins = readDiscoveredAgentPlugins(discoveries, reader);
			if (!discoveredPlugins) {
				return new Map<string, readonly string[]>();
			}
			const policy = enabledPluginsPolicy.read(reader);
			return getCanonicalAgentPluginCollisionGroups(
				discoveredPlugins,
				plugin => isAgentPluginBlockedByPolicy(plugin, policy),
				plugin => isAgentPluginForceEnabledByPolicy(plugin, policy),
			);
		});

		this.enablementModel = new AgentPluginCollisionEnablementModel(baseEnablementModel, collisionGroups, policyEnablement);

		for (const { discovery } of discoveries) {
			discovery.start(this.enablementModel);
		}

		this.plugins = derived(read => {
			if (!pluginsEnabled.read(read)) {
				return [];
			}
			const discoveredPlugins = readDiscoveredAgentPlugins(discoveries, read);
			if (!discoveredPlugins) {
				return [];
			}
			return getSortedAgentPlugins(discoveredPlugins);
		});

		this._register(autorun(reader => {
			const plugins = this.plugins.read(reader);
			const policy = enabledPluginsPolicy.read(reader);
			transaction(tx => {
				for (const plugin of plugins) {
					const policyValue = getAgentPluginPolicyEnablement(plugin, policy);
					if (setPolicyEnablement(plugin, policyValue, tx) && policyValue !== undefined) {
						logService.debug(`[AgentPluginService] Plugin '${getAgentPluginPolicyId(plugin) ?? plugin.uri.toString()}' ${policyValue ? 'enabled' : 'disabled'} by ChatEnabledPlugins policy`);
					}
				}
			});
		}));
	}
}

interface IAgentPluginDiscoveryWithPriority {
	readonly discovery: IAgentPluginDiscovery;
	readonly priority: AgentPluginDiscoveryPriority;
	readonly order: number;
}

function readDiscoveredAgentPlugins(discoveries: readonly IAgentPluginDiscoveryWithPriority[], reader: IReader): readonly IDiscoveredAgentPlugins[] | undefined {
	const result: IDiscoveredAgentPlugins[] = [];
	for (const { discovery, priority, order } of discoveries) {
		const plugins = discovery.plugins.read(reader);
		if (!plugins) {
			return undefined;
		}
		result.push({ plugins, priority, order });
	}
	return result;
}

/** A discovered plugin with the settable managed enablement observable owned by this service. */
interface PluginEntry extends IAgentPlugin {
	readonly policyEnablement: ISettableObservable<boolean | undefined>;
}

/**
 * Sets a plugin's managed enablement decision. Safe to call
 * for any {@link IAgentPlugin}; entries without a settable observable (e.g. test
 * doubles) are ignored.
 */
function setPolicyEnablement(plugin: IAgentPlugin, policyValue: boolean | undefined, tx: ITransaction): boolean {
	const obs = plugin.policyEnablement as ISettableObservable<boolean | undefined> | undefined;
	if (obs && typeof obs.set === 'function') {
		if (obs.get() === policyValue) {
			return false;
		}
		obs.set(policyValue, tx);
		return true;
	}
	return false;
}

/**
 * Minimal shape of a parsed plugin manifest. Known fields are typed; unknown
 * keys (e.g. `commands`, `skills`, `hooks`, `mcpServers`) remain `unknown` and
 * are parsed by the component readers.
 *
 * NOTE: `name` is typed as `string | undefined` to express intent, but
 * consumers must still runtime-validate it (manifests are untrusted JSON).
 */
interface IPluginManifest {
	readonly name?: string;
	readonly [key: string]: unknown;
}

/**
 * Describes a single discovered plugin source, before the shared
 * infrastructure builds the full {@link IAgentPlugin} from it.
 */
interface IPluginSource {
	readonly uri: URI;
	readonly fromMarketplace: IMarketplacePlugin | undefined;
	/** Repository root that serves as the boundary for component path resolution. */
	readonly repositoryUri?: URI;
	/** Whether to keep file watchers inside this plugin and reuse its entry between discovery refreshes. */
	readonly watchPluginContents?: boolean;
	/** Called when remove is invoked on the plugin; absent for policy-managed plugins */
	remove?(): Promise<boolean>;
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

	private readonly _plugins = observableValue<readonly IAgentPlugin[] | undefined>('discoveredAgentPlugins', undefined);
	public readonly plugins: IObservable<readonly IAgentPlugin[] | undefined> = this._plugins;

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
		const plugins = await this._discoverAndBuildPlugins(version);
		if (!this._isCurrentRefresh(version)) {
			return;
		}

		this._plugins.set(plugins, undefined);
	}

	/** Subclasses return plugin sources to discover. */
	protected abstract _discoverPluginSources(): Promise<readonly IPluginSource[]>;

	private async _discoverAndBuildPlugins(version: number): Promise<readonly IAgentPlugin[]> {
		const sources = await this._discoverPluginSources();
		if (!this._isCurrentRefresh(version)) {
			return [];
		}

		const plugins: IAgentPlugin[] = [];
		const seenPluginUris = new Set<string>();
		const attemptedPluginUris = new Set<string>();

		for (const source of sources) {
			const key = source.uri.toString();
			if (!attemptedPluginUris.has(key)) {
				attemptedPluginUris.add(key);
				try {
					const format = await detectPluginFormat(source.uri, this._fileService);
					if (!this._isCurrentRefresh(version)) {
						return [];
					}
					const plugin = await this._toPlugin(source.uri, format, source.fromMarketplace, source.repositoryUri, source.watchPluginContents !== false, source.remove, version);
					seenPluginUris.add(key);
					plugins.push(plugin);
				} catch (error) {
					this._logService.warn(`[AgentPluginDiscovery] Rejected plugin '${source.uri.toString()}': ${error instanceof Error ? error.message : String(error)}`);
				}
			}
		}

		if (this._isCurrentRefresh(version)) {
			this._disposePluginEntriesExcept(seenPluginUris);
		}

		plugins.sort((a, b) => a.uri.toString().localeCompare(b.uri.toString()));
		return plugins;
	}

	private _isCurrentRefresh(version: number): boolean {
		return version === this._discoverVersion && !this._store.isDisposed;
	}

	private async _toPlugin(uri: URI, format: IPluginFormatConfig, fromMarketplace: IMarketplacePlugin | undefined, repositoryUri: URI | undefined, watchPluginContents: boolean, removeCallback: (() => Promise<boolean>) | undefined, version: number): Promise<IAgentPlugin> {
		const key = uri.toString();
		const existing = this._pluginEntries.get(key);
		if (existing) {
			if (!this._isCurrentRefresh(version)) {
				return existing.plugin;
			}
			if (!watchPluginContents || existing.format.format !== format.format) {
				existing.store.dispose();
				this._pluginEntries.delete(key);
			} else {
				existing.plugin.remove = removeCallback;
				return existing.plugin;
			}
		}

		const store = new DisposableStore();
		const policyEnablement = observableValue<boolean | undefined>('policyEnablement', undefined);
		const policyBlocked = derived(reader => policyEnablement.read(reader) === false);
		const enablement = derived(r => this._enablementModel.readEnabled(key, r));

		// Read the manifest up front so its `name` field can be used in the
		// plugin label (for direct installs that have no marketplace metadata).
		// Component directories are tracked via observers downstream and
		// re-read whenever the manifest changes on disk.
		const initialManifest = await readPluginManifest(uri, format, this._fileService);
		const manifest = observableValue<IPluginManifest | undefined>('agentPluginManifest', initialManifest);
		const pluginVersion = derived(reader => {
			const manifestVersion = manifest.read(reader)?.version;
			if (typeof manifestVersion === 'string' && manifestVersion.trim()) {
				return manifestVersion.trim();
			}
			return fromMarketplace?.version || undefined;
		}).recomputeInitiallyAndOnChange(store);

		const observeComponent = <T>(
			prop: PluginComponent,
			doRead: (uris: readonly URI[]) => Promise<readonly T[]>,
			tryReadEmbedded?: (section: unknown) => Promise<T[] | undefined>,
			defaultPath: string = prop,
		): IObservable<readonly T[]> => {
			const secondObs = derivedOpts({ equalsFn: equals }, reader => getPluginManifestComponent(format, prop, manifest.read(reader)));

			const wrapped = derived(reader => {
				if (format.requiresManifest && !manifest.read(reader)) {
					return { kind: 'dirs', dirs: [] } as const;
				}
				const section = secondObs.read(reader);
				if (tryReadEmbedded) {
					if (section && typeof section === 'object' && !Array.isArray(section) && !(hasKey(section, { paths: true }))) {
						return { kind: 'const', data: new ObservablePromise(tryReadEmbedded(section)) } as const;
					}
				}

				const dirs = resolvePluginComponentDirs(uri, format, prop, defaultPath, section, repositoryUri);
				if (watchPluginContents) {
					for (const d of dirs) {
						const watcher = this._fileService.createWatcher(d, { recursive: false, excludes: [] });
						reader.store.add(watcher);
						reader.store.add(watcher.onDidChange(() => changeTrigger.trigger(undefined)));
					}
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
		const skills = observeComponent('skills', d => readPluginSkills(uri, d, format, this._fileService));
		const agents = observeComponent('agents', d => readMarkdownComponents(d, this._fileService));
		const instructions = observeComponent('rules', d => this._readRules(d));
		const automations = observeComponent('automations', d => this._readAutomations(d));
		const hooks = observeComponent(
			'hooks',
			paths => this._readHooksFromPaths(uri, paths, format),
			async section => {
				const userHome = await this._pathService.userHome();
				const workspaceRoot = resolveWorkspaceRoot(uri, this._workspaceContextService);
				return toAgentPluginHooks(format.parseHooks(manifestUri, section, uri, workspaceRoot, userHome));
			},
			format.hookConfigPath,
		);

		const mcpServerDefinitions = observeComponent(
			'mcpServers',
			paths => readPluginMcpServers(uri, paths, format, this._fileService),
			async section => parseMcpServerDefinitionMap(manifestUri, { mcpServers: section }, uri, format),
			'.mcp.json',
		);

		// Re-read the manifest whenever it changes on disk. The initial value
		// was already populated above before constructing the observable.
		const readManifest = async () => {
			try {
				const latestFormat = await detectPluginFormat(uri, this._fileService);
				if (latestFormat.format !== format.format) {
					await this._refreshPlugins();
					return;
				}
				manifest.set(await readPluginManifest(uri, format, this._fileService), undefined);
			} catch (error) {
				manifest.set(undefined, undefined);
				this._logService.warn(`[AgentPluginDiscovery] Rejected updated plugin '${uri.toString()}': ${error instanceof Error ? error.message : String(error)}`);
			}
		};

		const agentManifestUri = joinPath(uri, 'plugin.json');
		if (watchPluginContents) {
			const rootWatcher = this._fileService.createWatcher(uri, { recursive: false, excludes: [] });
			store.add(rootWatcher);
			store.add(rootWatcher.onDidChange(change => {
				if (change.affects(agentManifestUri)) {
					void readManifest();
				}
			}));
		}
		store.add(this._fileService.onDidRunOperation(event => {
			if (isEqual(event.resource, agentManifestUri)) {
				void readManifest();
			}
		}));
		if (watchPluginContents && !isEqual(manifestUri, agentManifestUri)) {
			const manifestWatcher = this._fileService.createWatcher(manifestUri, { recursive: false, excludes: [] });
			store.add(manifestWatcher);
			store.add(manifestWatcher.onDidChange(() => readManifest()));
		}

		const manifestName = typeof initialManifest?.name === 'string' && initialManifest.name.trim()
			? initialManifest.name.trim()
			: undefined;

		const plugin: PluginEntry = {
			uri,
			format: format.format,
			label: fromMarketplace?.name ?? manifestName ?? basename(uri),
			version: pluginVersion,
			enablement,
			policyEnablement,
			policyBlocked,
			remove: removeCallback,
			hooks,
			commands,
			skills,
			agents,
			instructions,
			mcpServerDefinitions,
			automations,
			fromMarketplace,
		};

		if (this._isCurrentRefresh(version)) {
			this._pluginEntries.set(key, { store, plugin, format });
		} else {
			store.dispose();
		}

		return plugin;
	}

	private async _readAutomations(dirs: readonly URI[]): Promise<readonly IAgentPluginAutomation[]> {
		const resources = await readMarkdownComponents(dirs, this._fileService);
		const automations: IAgentPluginAutomation[] = [];
		const ids = new Set<string>();
		for (const resource of resources) {
			if (!resource.uri.path.toLowerCase().endsWith(AUTOMATION_BLUEPRINT_FILE_SUFFIX)) {
				continue;
			}
			try {
				const content = await this._fileService.readFile(resource.uri);
				const blueprint = parseAutomationBlueprint(content.value.toString());
				if (ids.has(blueprint.id)) {
					this._logService.warn(`[AgentPluginDiscovery] Ignored duplicate Automation blueprint id '${blueprint.id}' in '${resource.uri.toString()}'.`);
					continue;
				}
				ids.add(blueprint.id);
				automations.push({ uri: resource.uri, blueprint });
			} catch (error) {
				this._logService.warn(`[AgentPluginDiscovery] Failed to read Automation blueprint '${resource.uri.toString()}': ${error instanceof Error ? error.message : String(error)}`);
			}
		}
		automations.sort((a, b) => a.blueprint.name.localeCompare(b.blueprint.name));
		return automations;
	}

	/**
	 * Reads hook definitions from a list of resolved paths (JSON files).
	 * Each path is tried in order; the first one that contains valid hook
	 * JSON is used.
	 */
	private async _readHooksFromPaths(pluginUri: URI, paths: readonly URI[], format: IPluginFormatConfig): Promise<readonly IAgentPluginHook[]> {
		const userHome = await this._pathService.userHome();
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
		const userHome = await this._pathService.userHome();
		const copilotCliRoot = joinPath(userHome, COPILOT_CLI_INSTALLED_PLUGINS_DIR);

		// User-configured filesystem paths in `chat.pluginLocations` — removable
		// by re-writing the user setting. Filesystem-only; an entry that happens
		// to look like `name@marketplace` is treated as a relative path, not an ID.
		for (const [key, enabled] of Object.entries(this._pluginLocationsConfig.get())) {
			const trimmed = key.trim();
			if (!trimmed || enabled === false) {
				continue;
			}
			for (const resource of await this._resolvePluginPath(trimmed, userHome)) {
				if (isEqualOrParent(resource, copilotCliRoot)) {
					this._logService.debug(`[ConfiguredAgentPluginDiscovery] Skipping redundant Copilot CLI cache path: ${resource.toString()}`);
					continue;
				}
				await this._addPluginSource(sources, resource, 'plugin path', () => this._removePluginPath(key));
			}
		}

		return sources;
	}

	private async _addPluginSource(sources: IPluginSource[], resource: URI, label: string, remove?: () => Promise<boolean>): Promise<void> {
		let stat;
		try {
			stat = await this._fileService.resolve(resource);
		} catch {
			this._logService.debug(`[ConfiguredAgentPluginDiscovery] Could not resolve ${label}: ${resource.toString()}`);
			return;
		}

		if (!stat.isDirectory) {
			this._logService.debug(`[ConfiguredAgentPluginDiscovery] ${label} is not a directory: ${resource.toString()}`);
			return;
		}

		sources.push({
			uri: stat.resource,
			fromMarketplace: this._pluginMarketplaceService.getMarketplacePluginMetadata(stat.resource),
			remove,
		});
	}

	/**
	 * Resolves a user-configured plugin path to one or more resource URIs.
	 * Supports absolute paths, tilde paths (expanded to user home), and
	 * workspace-relative paths.
	 */
	private async _resolvePluginPath(path: string, userHome: URI): Promise<URI[]> {
		const targetPath = await this._pathService.path;

		if (/^~($|\/|\\)/.test(path)) {
			const uri = await this._pathService.fileURI(untildify(path, userHome.path));
			return [this._toTargetResource(uri, userHome)];
		}

		if (targetPath.isAbsolute(path)) {
			const uri = await this._pathService.fileURI(path);
			return [this._toTargetResource(uri, userHome)];
		}

		const relativePath = targetPath.sep === '\\' ? path.replace(/\\/g, '/') : path;
		return this._workspaceContextService.getWorkspace().folders.map(
			folder => joinPath(folder.uri, relativePath)
		);
	}

	private _toTargetResource(uri: URI, userHome: URI): URI {
		return toTargetResource(uri, userHome);
	}

	/**
	 * Removes a plugin path from `chat.pluginLocations` in the most specific
	 * config target where the key is defined.
	 */
	private async _removePluginPath(configKey: string): Promise<boolean> {
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
				await this._configurationService.updateValue(
					ChatConfiguration.PluginLocations,
					updated,
					target,
				);
				return true;
			}
		}
		return false;
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
				remove: async () => {
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
					return true;
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
const COPILOT_CLI_CONFIG_FILE = '.copilot/config.json';

interface ICopilotCliInstalledPlugin {
	readonly uri: URI;
	readonly name: string;
	readonly marketplace: string;
	readonly revision: string;
}

class CopilotCliInstalledPluginsStore extends Disposable {
	private readonly _watcher = this._register(new MutableDisposable<DisposableStore>());
	private readonly _setupWatcherScheduler: RunOnceScheduler;
	private readonly _refreshScheduler: RunOnceScheduler;
	private _setupVersion = 0;
	private _installedPlugins: readonly ICopilotCliInstalledPlugin[] | undefined;

	constructor(
		private readonly _fileService: IFileService,
		private readonly _pathService: IPathService,
		private readonly _logService: ILogService,
		private readonly _onDidChange: () => void,
	) {
		super();
		this._setupWatcherScheduler = this._register(new RunOnceScheduler(() => {
			this._setupWatcher().catch(error => this._logService.warn('[CopilotCliInstalledPluginsStore] Failed to watch installed plugin state', error));
		}, 0));
		this._refreshScheduler = this._register(new RunOnceScheduler(() => {
			this._refresh().catch(error => this._logService.warn('[CopilotCliInstalledPluginsStore] Failed to refresh installed plugin state', error));
		}, 200));
		this._setupWatcherScheduler.schedule();
	}

	async getInstalledPlugins(): Promise<readonly ICopilotCliInstalledPlugin[]> {
		if (!this._installedPlugins) {
			this._installedPlugins = await this._readInstalledPlugins() ?? [];
		}
		return this._installedPlugins;
	}

	private async _setupWatcher(): Promise<void> {
		const version = ++this._setupVersion;
		const configFile = await getCopilotCliConfigFile(this._pathService);
		const configDirectory = dirname(configFile);
		let watchRoot = configDirectory;
		let pathToWatch = configFile;
		while (!(await this._pathExists(watchRoot))) {
			pathToWatch = watchRoot;
			const parent = dirname(watchRoot);
			if (isEqual(parent, watchRoot)) {
				return;
			}
			watchRoot = parent;
		}
		if (version !== this._setupVersion || this._store.isDisposed) {
			return;
		}

		const store = new DisposableStore();
		const onDidChange = (event: FileChangesEvent) => {
			const watchedPathChanged = event.affects(pathToWatch) || event.contains(watchRoot, FileChangeType.DELETED);
			if (!watchedPathChanged) {
				return;
			}
			this._refreshScheduler.schedule();
			if (!isEqual(watchRoot, configDirectory) || event.contains(watchRoot, FileChangeType.DELETED)) {
				this._setupWatcherScheduler.schedule();
			}
		};
		const watcher = store.add(this._fileService.createWatcher(watchRoot, { recursive: false, excludes: [] }));
		store.add(watcher.onDidChange(onDidChange));
		this._watcher.value = store;
		this._refreshScheduler.schedule(0);
	}

	private async _refresh(): Promise<void> {
		const installedPlugins = await this._readInstalledPlugins();
		if (!installedPlugins || equalsCopilotCliInstalledPlugins(this._installedPlugins, installedPlugins)) {
			return;
		}
		this._installedPlugins = installedPlugins;
		this._onDidChange();
	}

	private async _readInstalledPlugins(): Promise<readonly ICopilotCliInstalledPlugin[] | undefined> {
		const configFile = await getCopilotCliConfigFile(this._pathService);
		if (!(await this._fileService.exists(configFile))) {
			return [];
		}

		let content: string;
		try {
			content = (await this._fileService.readFile(configFile)).value.toString();
		} catch (error) {
			this._logService.warn(`[CopilotCliInstalledPluginsStore] Failed to read '${configFile.toString()}': ${error instanceof Error ? error.message : String(error)}`);
			return undefined;
		}

		const errors: ParseError[] = [];
		const parsed: unknown = parseJSONC(content, errors);
		if (errors.length || !parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
			this._logService.warn(`[CopilotCliInstalledPluginsStore] Ignoring invalid '${configFile.toString()}'`);
			return undefined;
		}

		const installedPlugins = Reflect.get(parsed, 'installedPlugins') ?? Reflect.get(parsed, 'installed_plugins');
		if (installedPlugins === undefined) {
			return [];
		}
		if (!Array.isArray(installedPlugins)) {
			this._logService.warn(`[CopilotCliInstalledPluginsStore] Ignoring invalid installedPlugins state in '${configFile.toString()}'`);
			return undefined;
		}

		const userHome = await this._pathService.userHome();
		const installedPluginsRoot = joinPath(userHome, COPILOT_CLI_INSTALLED_PLUGINS_DIR);
		const result: ICopilotCliInstalledPlugin[] = [];
		const seen = new Set<string>();
		for (const entry of installedPlugins) {
			if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
				this._logService.warn('[CopilotCliInstalledPluginsStore] Skipping malformed installed plugin record');
				continue;
			}
			const name = Reflect.get(entry, 'name');
			const marketplace = Reflect.get(entry, 'marketplace');
			if (typeof name !== 'string' || !name.trim() || typeof marketplace !== 'string') {
				this._logService.warn('[CopilotCliInstalledPluginsStore] Skipping installed plugin record without a valid name and marketplace');
				continue;
			}

			const cachePath = Reflect.get(entry, 'cache_path');
			let uri: URI;
			if (typeof cachePath === 'string' && cachePath.trim()) {
				uri = toTargetResource(await this._pathService.fileURI(cachePath), userHome);
			} else if (marketplace) {
				const canonicalLegacyUri = joinPath(installedPluginsRoot, `${name}@${marketplace}`);
				const marketplaceLegacyUri = joinPath(installedPluginsRoot, marketplace, name);
				uri = await this._fileService.exists(canonicalLegacyUri) || !(await this._fileService.exists(marketplaceLegacyUri))
					? canonicalLegacyUri
					: marketplaceLegacyUri;
			} else {
				this._logService.warn(`[CopilotCliInstalledPluginsStore] Skipping legacy direct plugin '${name}' without a cache path`);
				continue;
			}
			if (!extUriBiasedIgnorePathCase.isEqualOrParent(uri, installedPluginsRoot)) {
				this._logService.warn(`[CopilotCliInstalledPluginsStore] Skipping plugin cache path outside the installed root: ${uri.toString()}`);
				continue;
			}

			const key = extUriBiasedIgnorePathCase.getComparisonKey(uri);
			if (seen.has(key)) {
				continue;
			}
			seen.add(key);
			result.push({
				uri,
				name,
				marketplace,
				revision: JSON.stringify({
					version: Reflect.get(entry, 'version'),
					installedAt: Reflect.get(entry, 'installed_at'),
					sourceSha: Reflect.get(entry, 'source_sha'),
				}),
			});
		}
		result.sort((a, b) => a.uri.toString().localeCompare(b.uri.toString()));
		return result;
	}

	private async _pathExists(resource: URI): Promise<boolean> {
		try {
			await this._fileService.resolve(resource);
			return true;
		} catch {
			return false;
		}
	}
}

async function getCopilotCliConfigFile(pathService: IPathService): Promise<URI> {
	const userHome = await pathService.userHome();
	return joinPath(userHome, COPILOT_CLI_CONFIG_FILE);
}

function toTargetResource(uri: URI, userHome: URI): URI {
	if (userHome.scheme === Schemas.file) {
		return uri;
	}
	const path = uri.authority ? `//${uri.authority}${uri.path}` : uri.path;
	return userHome.with({ path: path.startsWith('/') ? path : `/${path}` });
}

function equalsCopilotCliInstalledPlugins(first: readonly ICopilotCliInstalledPlugin[] | undefined, second: readonly ICopilotCliInstalledPlugin[]): boolean {
	return !!first
		&& first.length === second.length
		&& first.every((plugin, index) =>
			plugin.uri.toString() === second[index].uri.toString()
			&& plugin.name === second[index].name
			&& plugin.marketplace === second[index].marketplace
			&& plugin.revision === second[index].revision
		);
}

/**
 * Discovers the plugins committed to the Copilot CLI's installedPlugins state.
 */
export class CopilotCliAgentPluginDiscovery extends AbstractAgentPluginDiscovery {
	private readonly _installedPlugins: CopilotCliInstalledPluginsStore;
	private _refreshScheduler: RunOnceScheduler | undefined;

	constructor(
		@IFileService fileService: IFileService,
		@IPathService pathService: IPathService,
		@ILogService logService: ILogService,
		@IWorkspaceContextService workspaceContextService: IWorkspaceContextService,
	) {
		super(fileService, pathService, logService, workspaceContextService);
		this._installedPlugins = this._register(new CopilotCliInstalledPluginsStore(
			this._fileService,
			this._pathService,
			this._logService,
			() => this._refreshScheduler?.schedule(),
		));
	}

	public override start(enablementModel: IEnablementModel): void {
		this._enablementModel = enablementModel;
		const scheduler = this._register(new RunOnceScheduler(() => this._refreshPlugins(), 200));
		this._refreshScheduler = scheduler;
		scheduler.schedule(0);
	}

	protected override async _discoverPluginSources(): Promise<readonly IPluginSource[]> {
		const sources: IPluginSource[] = [];
		for (const installedPlugin of await this._installedPlugins.getInstalledPlugins()) {
			try {
				const stat = await this._fileService.resolve(installedPlugin.uri);
				if (!stat.isDirectory) {
					continue;
				}
				sources.push({
					uri: stat.resource,
					fromMarketplace: undefined,
					watchPluginContents: false,
				});
			} catch {
				continue;
			}
		}
		return sources;
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

		scheduler.schedule();
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

	private async _promptUninstallExtension(extensionId: string): Promise<boolean> {
		const { confirmed } = await this._dialogService.confirm({
			message: localize('uninstallExtensionForPlugin', "This plugin is provided by the extension '{0}'. Do you want to uninstall the extension?", extensionId),
		});
		if (confirmed) {
			await this._commandService.executeCommand('workbench.extensions.uninstallExtension', extensionId);
			return true;
		}
		return false;
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
