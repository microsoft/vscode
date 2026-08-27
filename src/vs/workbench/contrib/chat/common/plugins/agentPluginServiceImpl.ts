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
import { equals } from '../../../../../base/common/objects.js';
import { autorun, derived, derivedOpts, IObservable, IReader, ISettableObservable, ITransaction, observableFromEvent, ObservablePromise, observableSignal, observableValue, transaction } from '../../../../../base/common/observable.js';
import {
	posix,
	win32
} from '../../../../../base/common/path.js';
import {
	basename, isEqual, isEqualOrParent, joinPath
} from '../../../../../base/common/resources.js';
import { hasKey } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ConfigurationTarget, getConfigValueInTarget, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { FileOperationResult, IFileService, toFileOperationResult } from '../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ContextKeyExpr, ContextKeyExpression, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { observableConfigValue } from '../../../../../platform/observable/common/platformObservableUtils.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
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
import { ContributionEnablementState, EnablementModel, IEnablementModel } from '../enablement.js';
import { HookType } from '../promptSyntax/hookTypes.js';
import { AgentPluginCollisionEnablementModel, getAgentPluginPolicyId, getCanonicalAgentPluginCollisionGroups, getSortedAgentPlugins, IDiscoveredAgentPlugins, isAgentPluginBlockedByPolicy } from './agentPluginEnablement.js';
import { IAgentPluginRepositoryService } from './agentPluginRepositoryService.js';
import { AgentPluginDiscoveryOrigin, AgentPluginDiscoveryOutcome, AgentPluginDiscoveryPriority, agentPluginDiscoveryRegistry, IAgentPlugin, IAgentPluginComponentSnapshot, IAgentPluginDiscovery, IAgentPluginDiscoveryCandidate, IAgentPluginDiscoverySnapshot, IAgentPluginHook, IAgentPluginInstruction, IAgentPluginService } from './agentPluginService.js';
import { AgentPluginTelemetry } from './agentPluginTelemetry.js';
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
	public readonly discoveredPlugins: IObservable<readonly IAgentPlugin[]>;
	public readonly discoveryComplete: IObservable<boolean>;
	public readonly enablementModel: IEnablementModel;

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService,
		@IStorageService storageService: IStorageService,
		@ILogService logService: ILogService,
		@ITelemetryService telemetryService: ITelemetryService,
	) {
		super();

		const baseEnablementModel = this._register(new EnablementModel('agentPlugins.enablement', storageService));
		const telemetry = new AgentPluginTelemetry(telemetryService);

		const pluginsEnabled = observableConfigValue(ChatConfiguration.PluginsEnabled, true, configurationService);

		const discoveries: IAgentPluginDiscoveryWithPriority[] = [];
		for (const registration of agentPluginDiscoveryRegistry.getAll()) {
			const discovery = instantiationService.createInstance(registration.descriptor);
			this._register(discovery);
			discoveries.push({ discovery, priority: registration.priority, order: registration.order });
		}
		this.discoveryComplete = derived(reader => readDiscoveredAgentPlugins(discoveries, reader) !== undefined);

		// Policy-driven enforcement, applied after discovery so that enterprise
		// policy is honored regardless of which discovery source surfaces a
		// plugin (local paths, marketplace, CLI install dir).
		const enabledPluginsPolicy = observableFromEvent(this,
			Event.filter(configurationService.onDidChangeConfiguration, e => e.affectsConfiguration(ChatConfiguration.EnabledPlugins)),
			() => configurationService.inspect<Record<string, boolean>>(ChatConfiguration.EnabledPlugins).policyValue,
		);

		const collisionGroups = derived(reader => {
			if (!pluginsEnabled.read(reader)) {
				return new Map<string, readonly string[]>();
			}
			const discoveredPlugins = readDiscoveredAgentPlugins(discoveries, reader);
			if (!discoveredPlugins) {
				return new Map<string, readonly string[]>();
			}
			const policy = enabledPluginsPolicy.read(reader);
			return getCanonicalAgentPluginCollisionGroups(discoveredPlugins, plugin => isAgentPluginBlockedByPolicy(plugin, policy));
		});

		this.enablementModel = new AgentPluginCollisionEnablementModel(baseEnablementModel, collisionGroups);

		for (const { discovery } of discoveries) {
			discovery.start(this.enablementModel);
		}

		this.discoveredPlugins = derived(read => {
			const discoveredPlugins = readDiscoveredAgentPlugins(discoveries, read);
			if (!discoveredPlugins) {
				return [];
			}
			return getSortedAgentPlugins(discoveredPlugins);
		});
		this.plugins = derived(read => pluginsEnabled.read(read) ? this.discoveredPlugins.read(read) : []);

		// Mark policy-blocked plugins rather than hiding them: a blocked plugin
		// stays visible (shown as disabled) but its `enablement` is forced to
		// disabled (see `_toPlugin`), so it is inactive and cannot be re-enabled.
		this._register(autorun(reader => {
			const plugins = this.plugins.read(reader);
			const policy = enabledPluginsPolicy.read(reader);
			transaction(tx => {
				for (const plugin of plugins) {
					const blocked = isAgentPluginBlockedByPolicy(plugin, policy);
					if (setPolicyBlocked(plugin, blocked, tx) && blocked) {
						logService.debug(`[AgentPluginService] Plugin '${getAgentPluginPolicyId(plugin) ?? plugin.uri.toString()}' blocked — disabled by ChatEnabledPlugins policy`);
					}
				}
			});
		}));

		this._register(autorun(reader => {
			const snapshots = readAgentPluginDiscoverySnapshots(discoveries, reader);
			if (!snapshots) {
				return;
			}
			telemetry.logDiscovery(snapshots, this.plugins.read(reader), collisionGroups.read(reader), pluginsEnabled.read(reader), reader);
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

function readAgentPluginDiscoverySnapshots(discoveries: readonly IAgentPluginDiscoveryWithPriority[], reader: IReader): readonly IAgentPluginDiscoverySnapshot[] | undefined {
	const result: IAgentPluginDiscoverySnapshot[] = [];
	for (const { discovery } of discoveries) {
		const snapshot = discovery.discoverySnapshot.read(reader);
		if (!snapshot) {
			return undefined;
		}
		result.push(snapshot);
	}
	return result;
}

/**
 * A discovered plugin. Extends the public {@link IAgentPlugin} with a settable
 * `policyBlocked` observable that the service writes to when enterprise policy
 * blocks the plugin.
 */
interface PluginEntry extends IAgentPlugin {
	discoveryOrigin: AgentPluginDiscoveryOrigin;
	readonly policyBlocked: ISettableObservable<boolean>;
	readonly componentSnapshot: IObservable<IAgentPluginComponentSnapshot | undefined>;
}

/**
 * Marks a plugin as blocked (or unblocked) by enterprise policy. Safe to call
 * for any {@link IAgentPlugin}; entries without a settable observable (e.g. test
 * doubles) are ignored.
 */
function setPolicyBlocked(plugin: IAgentPlugin, blocked: boolean, tx: ITransaction): boolean {
	const obs = plugin.policyBlocked as ISettableObservable<boolean> | undefined;
	if (obs && typeof obs.set === 'function') {
		if (obs.get() === blocked) {
			return false;
		}
		obs.set(blocked, tx);
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

async function readPluginManifestWithOutcome(uri: URI, format: IPluginFormatConfig, fileService: IFileService): Promise<{ manifest: IPluginManifest | undefined; parseError: boolean; unreadable: boolean }> {
	try {
		const contents = await fileService.readFile(joinPath(uri, format.manifestPath));
		const errors: ParseError[] = [];
		const parsed = parseJSONC(contents.value.toString(), errors);
		if (errors.length > 0 || !parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
			return { manifest: undefined, parseError: true, unreadable: false };
		}
		return { manifest: parsed as IPluginManifest, parseError: false, unreadable: false };
	} catch (error) {
		return {
			manifest: undefined,
			parseError: false,
			unreadable: toFileOperationResult(error) !== FileOperationResult.FILE_NOT_FOUND,
		};
	}
}

/**
 * Describes a single discovered plugin source, before the shared
 * infrastructure builds the full {@link IAgentPlugin} from it.
 */
interface IPluginSource {
	readonly uri: URI;
	readonly origin?: AgentPluginDiscoveryOrigin;
	readonly enabled?: boolean;
	readonly fromMarketplace: IMarketplacePlugin | undefined;
	/** Repository root that serves as the boundary for component path resolution. */
	readonly repositoryUri?: URI;
	/** Called when remove is invoked on the plugin; absent for policy-managed plugins */
	remove?(): void;
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
	private readonly _discoverySnapshot = observableValue<IAgentPluginDiscoverySnapshot | undefined>(this, undefined);
	public readonly discoverySnapshot: IObservable<IAgentPluginDiscoverySnapshot | undefined> = this._discoverySnapshot;
	private readonly _snapshotReconciler = this._register(new MutableDisposable());

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
		this._discoverySnapshot.set(undefined, undefined);
		const { plugins, candidates } = await this._discoverAndBuildPlugins(version);
		if (!this._isCurrentRefresh(version)) {
			return;
		}

		this._plugins.set(plugins, undefined);
		this._snapshotReconciler.value = autorun(reader => {
			const settledCandidates: IAgentPluginDiscoveryCandidate[] = [];
			for (const candidate of candidates) {
				if (!candidate.plugin) {
					settledCandidates.push(candidate);
					continue;
				}
				const entry = this._pluginEntries.get(candidate.plugin.uri.toString())?.plugin;
				const components = entry?.componentSnapshot.read(reader);
				if (!components) {
					return;
				}
				settledCandidates.push({ ...candidate, components });
			}
			if (!this._isCurrentRefresh(version)) {
				return;
			}
			this._discoverySnapshot.set({ candidates: settledCandidates }, undefined);
		});
	}

	/** Subclasses return plugin sources to discover. */
	protected abstract _discoverPluginSources(): Promise<readonly IPluginSource[]>;

	private async _discoverAndBuildPlugins(version: number): Promise<{ readonly plugins: readonly IAgentPlugin[]; readonly candidates: readonly IAgentPluginDiscoveryCandidate[] }> {
		const sources = await this._discoverPluginSources();
		if (!this._isCurrentRefresh(version)) {
			return { plugins: [], candidates: [] };
		}

		const plugins: IAgentPlugin[] = [];
		const candidates: IAgentPluginDiscoveryCandidate[] = [];
		const seenPluginUris = new Set<string>();
		const attemptedPluginUris = new Set<string>();

		for (const source of sources) {
			const key = source.uri.toString();
			const origin = source.origin ?? AgentPluginDiscoveryOrigin.ConfiguredPath;
			if (attemptedPluginUris.has(key)) {
				candidates.push({ origin, format: undefined, outcome: AgentPluginDiscoveryOutcome.Collision });
				continue;
			}
			attemptedPluginUris.add(key);
			if (source.enabled === false) {
				candidates.push({ origin, format: undefined, outcome: AgentPluginDiscoveryOutcome.Disabled });
				continue;
			}
			let resolvedUri: URI;
			try {
				const stat = await this._fileService.resolve(source.uri);
				if (!stat.isDirectory) {
					candidates.push({ origin, format: undefined, outcome: AgentPluginDiscoveryOutcome.Unreadable });
					continue;
				}
				resolvedUri = stat.resource;
			} catch {
				candidates.push({ origin, format: undefined, outcome: AgentPluginDiscoveryOutcome.Unreadable });
				continue;
			}
			try {
				const format = await detectPluginFormat(resolvedUri, this._fileService);
				if (!this._isCurrentRefresh(version)) {
					return { plugins: [], candidates: [] };
				}
				const plugin = await this._toPlugin(resolvedUri, origin, format, source.fromMarketplace, source.repositoryUri, source.remove, version);
				seenPluginUris.add(resolvedUri.toString());
				plugins.push(plugin);
				candidates.push({ origin, format: format.format, outcome: AgentPluginDiscoveryOutcome.Loaded, plugin });
			} catch (error) {
				candidates.push({ origin, format: undefined, outcome: AgentPluginDiscoveryOutcome.ParseError });
				this._logService.warn(`[AgentPluginDiscovery] Rejected plugin '${source.uri.toString()}': ${error instanceof Error ? error.message : String(error)}`);
			}
		}

		if (this._isCurrentRefresh(version)) {
			this._disposePluginEntriesExcept(seenPluginUris);
		}

		plugins.sort((a, b) => a.uri.toString().localeCompare(b.uri.toString()));
		return { plugins, candidates };
	}

	private _isCurrentRefresh(version: number): boolean {
		return version === this._discoverVersion && !this._store.isDisposed;
	}

	protected async _pathExists(resource: URI): Promise<boolean> {
		try {
			await this._fileService.resolve(resource);
			return true;
		} catch {
			return false;
		}
	}

	private async _toPlugin(uri: URI, discoveryOrigin: AgentPluginDiscoveryOrigin, format: IPluginFormatConfig, fromMarketplace: IMarketplacePlugin | undefined, repositoryUri: URI | undefined, removeCallback: (() => void) | undefined, version: number): Promise<IAgentPlugin> {
		const key = uri.toString();
		const existing = this._pluginEntries.get(key);
		if (existing) {
			if (!this._isCurrentRefresh(version)) {
				return existing.plugin;
			}
			if (existing.format.format !== format.format) {
				existing.store.dispose();
				this._pluginEntries.delete(key);
			} else {
				existing.plugin.remove = removeCallback;
				existing.plugin.discoveryOrigin = discoveryOrigin;
				return existing.plugin;
			}
		}

		const store = new DisposableStore();
		// Set by the service when enterprise policy blocks this plugin; when set,
		// the plugin is forced disabled regardless of the user's enablement choice.
		const policyBlocked = observableValue<boolean>('policyBlocked', false);
		const enablement = derived(r => policyBlocked.read(r)
			? ContributionEnablementState.DisabledProfile
			: this._enablementModel.readEnabled(key, r));

		// Read the manifest up front so its `name` field can be used in the
		// plugin label (for direct installs that have no marketplace metadata).
		// Component directories are tracked via observers downstream and
		// re-read whenever the manifest changes on disk.
		const initialManifestResult = await readPluginManifestWithOutcome(uri, format, this._fileService);
		const manifest = observableValue<IPluginManifest | undefined>('agentPluginManifest', initialManifestResult.manifest);
		const manifestParseError = observableValue(this, initialManifestResult.parseError);
		const manifestUnreadable = observableValue(this, initialManifestResult.unreadable);

		type ComponentRead<T> = { readonly value: T; readonly settled: boolean };
		type ObservedComponent<T> = { readonly value: IObservable<T>; readonly read: IObservable<ComponentRead<T>> };
		const observeComponentData = <T>(
			prop: PluginComponent,
			doRead: (uris: readonly URI[]) => Promise<T>,
			tryReadEmbedded: ((section: unknown) => Promise<T | undefined>) | undefined,
			emptyValue: T,
			defaultPath: string = prop,
		): ObservedComponent<T> => {
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

			const result = promised.map((w, reader) => {
				const promiseResult = w.read(reader);
				return { value: promiseResult?.data ?? emptyValue, settled: promiseResult !== undefined };
			}).recomputeInitiallyAndOnChange(store);
			return { value: result.map(value => value.value), read: result };
		};
		const observeComponent = <T>(
			prop: PluginComponent,
			doRead: (uris: readonly URI[]) => Promise<readonly T[]>,
			tryReadEmbedded?: (section: unknown) => Promise<T[] | undefined>,
			defaultPath: string = prop,
		): ObservedComponent<readonly T[]> => observeComponentData(prop, doRead, tryReadEmbedded, Iterable.empty(), defaultPath);

		const manifestUri = joinPath(uri, format.manifestPath);
		const commandsComponent = observeComponent('commands', d => readMarkdownComponents(d, this._fileService));
		const skillsComponent = observeComponent('skills', d => readPluginSkills(uri, d, format, this._fileService));
		const agentsComponent = observeComponent('agents', d => readMarkdownComponents(d, this._fileService));
		const instructionsComponent = observeComponent('rules', d => this._readRules(d));
		const hooksComponent = observeComponent(
			'hooks',
			paths => this._readHooksFromPaths(uri, paths, format),
			async section => {
				const userHome = await this._pathService.userHome();
				const workspaceRoot = resolveWorkspaceRoot(uri, this._workspaceContextService);
				return toAgentPluginHooks(format.parseHooks(manifestUri, section, uri, workspaceRoot, userHome));
			},
			format.hookConfigPath,
		);

		const mcpComponent = observeComponent(
			'mcpServers',
			paths => readPluginMcpServers(uri, paths, format, this._fileService),
			async section => parseMcpServerDefinitionMap(manifestUri, { mcpServers: section }, uri, format),
			'.mcp.json',
		);
		const commands = commandsComponent.value;
		const skills = skillsComponent.value;
		const agents = agentsComponent.value;
		const instructions = instructionsComponent.value;
		const hooks = hooksComponent.value;
		const mcpServerDefinitions = mcpComponent.value;
		const componentSnapshot = derived(reader => {
			const commandsResult = commandsComponent.read.read(reader);
			const skillsResult = skillsComponent.read.read(reader);
			const agentsResult = agentsComponent.read.read(reader);
			const instructionsResult = instructionsComponent.read.read(reader);
			const hooksResult = hooksComponent.read.read(reader);
			const mcpResult = mcpComponent.read.read(reader);
			if (!commandsResult.settled || !skillsResult.settled || !agentsResult.settled || !instructionsResult.settled || !hooksResult.settled || !mcpResult.settled) {
				return undefined;
			}
			return {
				commandCount: commandsResult.value.length,
				skillCount: skillsResult.value.length,
				agentCount: agentsResult.value.length,
				instructionCount: instructionsResult.value.length,
				hookCount: hooksResult.value.length,
				mcpServerCount: mcpResult.value.length,
				manifestParseError: manifestParseError.read(reader),
				manifestUnreadable: manifestUnreadable.read(reader),
			};
		}).recomputeInitiallyAndOnChange(store);

		// Re-read the manifest whenever it changes on disk. The initial value
		// was already populated above before constructing the observable.
		const readManifest = async () => {
			try {
				const latestFormat = await detectPluginFormat(uri, this._fileService);
				if (latestFormat.format !== format.format) {
					await this._refreshPlugins();
					return;
				}
				const result = await readPluginManifestWithOutcome(uri, format, this._fileService);
				transaction(tx => {
					manifest.set(result.manifest, tx);
					manifestParseError.set(result.parseError, tx);
					manifestUnreadable.set(result.unreadable, tx);
				});
			} catch (error) {
				manifest.set(undefined, undefined);
				this._logService.warn(`[AgentPluginDiscovery] Rejected updated plugin '${uri.toString()}': ${error instanceof Error ? error.message : String(error)}`);
			}
		};

		const agentManifestUri = joinPath(uri, 'plugin.json');
		const rootWatcher = this._fileService.createWatcher(uri, { recursive: false, excludes: [] });
		store.add(rootWatcher);
		store.add(rootWatcher.onDidChange(change => {
			if (change.affects(agentManifestUri)) {
				void readManifest();
			}
		}));
		store.add(this._fileService.onDidRunOperation(event => {
			if (isEqual(event.resource, agentManifestUri)) {
				void readManifest();
			}
		}));
		if (!isEqual(manifestUri, agentManifestUri)) {
			const manifestWatcher = this._fileService.createWatcher(manifestUri, { recursive: false, excludes: [] });
			store.add(manifestWatcher);
			store.add(manifestWatcher.onDidChange(() => readManifest()));
		}

		const manifestName = typeof initialManifestResult.manifest?.name === 'string' && initialManifestResult.manifest.name.trim()
			? initialManifestResult.manifest.name.trim()
			: undefined;

		const plugin: PluginEntry = {
			uri,
			format: format.format,
			discoveryOrigin,
			label: fromMarketplace?.name ?? manifestName ?? basename(uri),
			enablement,
			policyBlocked,
			manifestParseError,
			manifestUnreadable,
			remove: removeCallback,
			hooks,
			commands,
			skills,
			agents,
			instructions,
			mcpServerDefinitions,
			componentSnapshot,
			fromMarketplace,
		};

		if (this._isCurrentRefresh(version)) {
			this._pluginEntries.set(key, { store, plugin, format });
		} else {
			store.dispose();
		}

		return plugin;
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
	private readonly _enterpriseEnabledPluginsConfig: IObservable<Record<string, boolean>>;

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
		// Enterprise-managed plugin-ID entries (delivered via the `ChatEnabledPlugins` policy).
		// These are plugin IDs in `<plugin>@<marketplace>` form, distinct from filesystem paths.
		// Read via `inspect()` so user-set entries survive when the policy is also set —
		// `getValue()` alone would surface only the policy value.
		this._enterpriseEnabledPluginsConfig = observableFromEvent(this,
			Event.filter(this._configurationService.onDidChangeConfiguration, e => e.affectsConfiguration(ChatConfiguration.EnabledPlugins)),
			() => {
				const inspected = this._configurationService.inspect<Record<string, boolean>>(ChatConfiguration.EnabledPlugins);
				return { ...inspected.defaultValue, ...inspected.userValue, ...inspected.policyValue };
			},
		);
	}

	public override start(enablementModel: IEnablementModel): void {
		this._enablementModel = enablementModel;
		const scheduler = this._register(new RunOnceScheduler(() => this._refreshPlugins(), 0));
		this._register(autorun(reader => {
			this._pluginLocationsConfig.read(reader);
			this._enterpriseEnabledPluginsConfig.read(reader);
			scheduler.schedule();
		}));
		scheduler.schedule();
	}

	protected override async _discoverPluginSources(): Promise<readonly IPluginSource[]> {
		const sources: IPluginSource[] = [];
		const userHome = await this._getUserHome();

		// User-configured filesystem paths in `chat.pluginLocations` — removable
		// by re-writing the user setting. Filesystem-only; an entry that happens
		// to look like `name@marketplace` is treated as a relative path, not an ID.
		for (const [key, enabled] of Object.entries(this._pluginLocationsConfig.get())) {
			const trimmed = key.trim();
			if (!trimmed) {
				continue;
			}
			for (const resource of this._resolvePluginPath(trimmed, userHome)) {
				sources.push({
					uri: resource,
					origin: AgentPluginDiscoveryOrigin.ConfiguredPath,
					enabled: enabled !== false,
					fromMarketplace: this._pluginMarketplaceService.getMarketplacePluginMetadata(resource),
					remove: () => this._removePluginPath(key),
				});
			}
		}

		// Enterprise-managed plugin IDs in `chat.plugins.enabledPlugins` (delivered
		// via the `ChatEnabledPlugins` policy) — IDs of the form
		// `<plugin>@<marketplace>`, resolved to the Copilot CLI install convention.
		// Non-removable from the UI (enterprise-managed).
		for (const [key, enabled] of Object.entries(this._enterpriseEnabledPluginsConfig.get())) {
			const trimmed = key.trim();
			if (!trimmed) {
				continue;
			}
			const resource = this._resolveEnterprisePluginId(trimmed, userHome);
			if (!resource) {
				this._logService.debug(`[ConfiguredAgentPluginDiscovery] Skipping enterprise plugin entry that is not in <plugin>@<marketplace> form: ${trimmed}`);
				continue;
			}
			sources.push({
				uri: resource,
				origin: AgentPluginDiscoveryOrigin.ConfiguredPluginId,
				enabled: enabled !== false,
				fromMarketplace: this._pluginMarketplaceService.getMarketplacePluginMetadata(resource),
			});
		}

		return sources;
	}

	private async _getUserHome(): Promise<string> {
		const userHome = await this._pathService.userHome();
		return userHome.scheme === 'file' ? userHome.fsPath : userHome.path;
	}

	/**
	 * Resolves a user-configured plugin path to one or more resource URIs.
	 * Supports absolute paths, tilde paths (expanded to user home), and
	 * workspace-relative paths.
	 */
	private _resolvePluginPath(path: string, userHome: string): URI[] {
		if (path.startsWith('~')) {
			path = untildify(path, userHome);
		}

		if (win32.isAbsolute(path) || posix.isAbsolute(path)) {
			return [URI.file(path)];
		}

		return this._workspaceContextService.getWorkspace().folders.map(
			folder => joinPath(folder.uri, path)
		);
	}

	/**
	 * Resolves an enterprise plugin ID of the form `<plugin>@<marketplace>` to
	 * the Copilot CLI install convention `~/.copilot/installed-plugins/<marketplace>/<plugin>/`.
	 * Returns `undefined` for anything that doesn't match the ID shape.
	 */
	private _resolveEnterprisePluginId(id: string, userHome: string): URI | undefined {
		const idMatch = id.match(/^([^@/\\~]+)@([^@/\\~]+)$/);
		if (!idMatch) {
			return undefined;
		}
		const [, plugin, marketplace] = idMatch;
		return URI.file(`${userHome}/.copilot/installed-plugins/${marketplace}/${plugin}`);
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
			const repositoryUri = this._pluginRepositoryService.getRepositoryUri(entry.plugin.marketplaceReference, entry.plugin.marketplaceType);

			sources.push({
				uri: entry.pluginUri,
				origin: AgentPluginDiscoveryOrigin.VSCodeInstalled,
				enabled: true,
				fromMarketplace: entry.plugin,
				repositoryUri,
				remove: () => {
					this._enablementModel.remove(entry.pluginUri.toString());
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
					origin: marketplaceDir.name === '_direct' ? AgentPluginDiscoveryOrigin.CopilotCliDirect : AgentPluginDiscoveryOrigin.CopilotCliMarketplace,
					enabled: true,
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
			sources.push({
				uri: entry.uri,
				origin: AgentPluginDiscoveryOrigin.ExtensionContribution,
				enabled: !entry.when || this._contextKeyService.contextMatchesRules(entry.when),
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
