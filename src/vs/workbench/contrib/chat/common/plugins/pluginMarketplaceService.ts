/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { runWhenGlobalIdle } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Event } from '../../../../../base/common/event.js';
import { parse as parseJSONC } from '../../../../../base/common/json.js';
import { Lazy } from '../../../../../base/common/lazy.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { revive } from '../../../../../base/common/marshalling.js';
import { IObservable, observableValue } from '../../../../../base/common/observable.js';
import { isEqual, isEqualOrParent, joinPath, normalizePath, relativePath } from '../../../../../base/common/resources.js';
import { URI, UriComponents } from '../../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { ObservableMemento, observableMemento } from '../../../../../platform/observable/common/observableMemento.js';
import { asJson, IRequestService } from '../../../../../platform/request/common/request.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import type { Dto } from '../../../../services/extensions/common/proxyIdentifier.js';
import { AutoUpdateConfigurationKey, AutoUpdateConfigurationValue } from '../../../extensions/common/extensions.js';
import { ChatConfiguration } from '../constants.js';
import { IAgentPluginRepositoryService } from './agentPluginRepositoryService.js';

export const enum MarketplaceType {
	Copilot = 'copilot',
	Claude = 'claude',
}

export const enum MarketplaceReferenceKind {
	GitHubShorthand = 'githubShorthand',
	GitUri = 'gitUri',
	LocalFileUri = 'localFileUri',
}

export interface IMarketplaceReference {
	readonly rawValue: string;
	readonly displayLabel: string;
	readonly cloneUrl: string;
	readonly canonicalId: string;
	readonly cacheSegments: readonly string[];
	readonly kind: MarketplaceReferenceKind;
	readonly githubRepo?: string;
	readonly localRepositoryUri?: URI;
}

export const enum PluginSourceKind {
	RelativePath = 'relativePath',
	GitHub = 'github',
	GitUrl = 'url',
	Npm = 'npm',
	Pip = 'pip',
}

export interface IRelativePathPluginSource {
	readonly kind: PluginSourceKind.RelativePath;
	/** Resolved relative path within the marketplace repository. */
	readonly path: string;
}

export interface IGitHubPluginSource {
	readonly kind: PluginSourceKind.GitHub;
	readonly repo: string;
	readonly ref?: string;
	readonly sha?: string;
}

export interface IGitUrlPluginSource {
	readonly kind: PluginSourceKind.GitUrl;
	/** Full git repository URL (must end with .git). */
	readonly url: string;
	readonly ref?: string;
	readonly sha?: string;
}

export interface INpmPluginSource {
	readonly kind: PluginSourceKind.Npm;
	readonly package: string;
	readonly version?: string;
	readonly registry?: string;
}

export interface IPipPluginSource {
	readonly kind: PluginSourceKind.Pip;
	readonly package: string;
	readonly version?: string;
	readonly registry?: string;
}

export type IPluginSourceDescriptor =
	| IRelativePathPluginSource
	| IGitHubPluginSource
	| IGitUrlPluginSource
	| INpmPluginSource
	| IPipPluginSource;

export interface IMarketplacePlugin {
	readonly name: string;
	readonly description: string;
	readonly version: string;
	/** Subdirectory within the repository where the plugin lives (for relative-path sources). */
	readonly source: string;
	/** Structured source descriptor indicating how the plugin should be fetched/installed. */
	readonly sourceDescriptor: IPluginSourceDescriptor;
	/** Marketplace label shown in UI and plugin provenance. */
	readonly marketplace: string;
	/** Canonical reference for clone/update/install location resolution. */
	readonly marketplaceReference: IMarketplaceReference;
	/** The type of marketplace this plugin comes from. */
	readonly marketplaceType: MarketplaceType;
	readonly readmeUri?: URI;
}

/** Raw JSON shape of a remote plugin source object in marketplace.json. */
interface IJsonPluginSource {
	readonly source: string;
	readonly repo?: string;
	readonly url?: string;
	readonly package?: string;
	readonly ref?: string;
	readonly sha?: string;
	readonly version?: string;
	readonly registry?: string;
}

interface IMarketplaceJson {
	readonly metadata?: {
		readonly pluginRoot?: string;
	};
	readonly plugins?: readonly {
		readonly name?: string;
		readonly description?: string;
		readonly version?: string;
		readonly source?: string | IJsonPluginSource;
	}[];
}

export interface IMarketplaceInstalledPlugin {
	readonly pluginUri: URI;
	readonly plugin: IMarketplacePlugin;
	readonly enabled: boolean;
}

export const IPluginMarketplaceService = createDecorator<IPluginMarketplaceService>('pluginMarketplaceService');

export interface IPluginMarketplaceService {
	readonly _serviceBrand: undefined;
	readonly onDidChangeMarketplaces: Event<void>;
	/** Installed marketplace plugins, backed by storage. */
	readonly installedPlugins: IObservable<readonly IMarketplaceInstalledPlugin[]>;
	/**
	 * Observable that is `true` when at least one cloned marketplace
	 * repository has upstream changes available. Checked periodically
	 * (approximately once per day) when `extensions.autoUpdate` is enabled.
	 */
	readonly hasUpdatesAvailable: IObservable<boolean>;
	/**
	 * Observable snapshot of the last {@link fetchMarketplacePlugins} result.
	 * Empty until the first fetch completes. Views should use this for
	 * synchronous outdated-detection instead of calling fetchMarketplacePlugins.
	 */
	readonly lastFetchedPlugins: IObservable<readonly IMarketplacePlugin[]>;
	/** Resets {@link hasUpdatesAvailable} to `false`. */
	clearUpdatesAvailable(): void;
	fetchMarketplacePlugins(token: CancellationToken): Promise<IMarketplacePlugin[]>;
	getMarketplacePluginMetadata(pluginUri: URI): IMarketplacePlugin | undefined;
	addInstalledPlugin(pluginUri: URI, plugin: IMarketplacePlugin): void;
	removeInstalledPlugin(pluginUri: URI): void;
	setInstalledPluginEnabled(pluginUri: URI, enabled: boolean): void;
	/** Returns whether the given marketplace has been explicitly trusted by the user. */
	isMarketplaceTrusted(ref: IMarketplaceReference): boolean;
	/** Records that the user trusts the given marketplace, persisted permanently. */
	trustMarketplace(ref: IMarketplaceReference): void;
}

/**
 * Marketplace definition files by type, checked in order per repository.
 * The first match determines the marketplace type.
 */
const MARKETPLACE_DEFINITIONS: { type: MarketplaceType; path: string }[] = [
	{ type: MarketplaceType.Copilot, path: '.github/plugin/marketplace.json' },
	{ type: MarketplaceType.Claude, path: '.claude-plugin/marketplace.json' },
];

const GITHUB_MARKETPLACE_CACHE_TTL_MS = 8 * 60 * 60 * 1000;
const GITHUB_MARKETPLACE_CACHE_STORAGE_KEY = 'chat.plugins.marketplaces.githubCache.v1';

/** Interval between periodic plugin update checks (24 hours). */
const PLUGIN_UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const PLUGIN_UPDATE_LAST_CHECK_STORAGE_KEY = 'chat.plugins.lastUpdateCheck.v1';

/** TTL for the lastFetchedPlugins cache (5 minutes). */
const LAST_FETCHED_PLUGINS_TTL_MS = 5 * 60 * 1000;

interface IGitHubMarketplaceCacheEntry {
	readonly plugins: readonly IMarketplacePlugin[];
	readonly expiresAt: number;
	readonly referenceRawValue: string;
}

type IStoredGitHubMarketplaceCache = Dto<Record<string, IGitHubMarketplaceCacheEntry>>;

interface IStoredInstalledPlugin {
	readonly pluginUri: UriComponents;
	readonly plugin: IMarketplacePlugin;
	readonly enabled: boolean;
}

/**
 * Ensures that an {@link IMarketplacePlugin} loaded from storage has a
 * {@link IMarketplacePlugin.sourceDescriptor sourceDescriptor}. Plugins
 * persisted before the sourceDescriptor field was introduced will only
 * have the legacy `source` string — this function synthesises a
 * {@link PluginSourceKind.RelativePath} descriptor from it.
 */
function ensureSourceDescriptor(plugin: IMarketplacePlugin): IMarketplacePlugin {
	if (plugin.sourceDescriptor) {
		return plugin;
	}
	return {
		...plugin,
		sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: plugin.source },
	};
}

const installedPluginsMemento = observableMemento<readonly IStoredInstalledPlugin[]>({
	defaultValue: [],
	key: 'chat.plugins.installed.v1',
	toStorage: value => JSON.stringify(value),
	fromStorage: value => {
		const parsed = JSON.parse(value);
		return Array.isArray(parsed) ? parsed : [];
	},
});

const trustedMarketplacesMemento = observableMemento<readonly string[]>({
	defaultValue: [],
	key: 'chat.plugins.trustedMarketplaces.v1',
	toStorage: value => JSON.stringify(value),
	fromStorage: value => {
		const parsed = JSON.parse(value);
		return Array.isArray(parsed) ? parsed : [];
	},
});

interface IStoredLastFetchedPlugins {
	readonly plugins: readonly IMarketplacePlugin[];
	readonly fetchedAt: number;
	readonly configFingerprint: string;
}

const lastFetchedPluginsMemento = observableMemento<IStoredLastFetchedPlugins>({
	defaultValue: { plugins: [], fetchedAt: 0, configFingerprint: '' },
	key: 'chat.plugins.lastFetchedPlugins.v2',
	toStorage: value => JSON.stringify(value),
	fromStorage: value => {
		const parsed = JSON.parse(value);
		if (parsed && Array.isArray(parsed.plugins)) {
			return parsed;
		}
		return { plugins: [], fetchedAt: 0, configFingerprint: '' };
	},
});

export class PluginMarketplaceService extends Disposable implements IPluginMarketplaceService {
	declare readonly _serviceBrand: undefined;
	private readonly _gitHubMarketplaceCache = new Lazy<Map<string, IGitHubMarketplaceCacheEntry>>(() => this._loadPersistedGitHubMarketplaceCache());
	private readonly _installedPluginsStore: ObservableMemento<readonly IStoredInstalledPlugin[]>;
	private readonly _trustedMarketplacesStore: ObservableMemento<readonly string[]>;
	private readonly _lastFetchedPluginsStore: ObservableMemento<IStoredLastFetchedPlugins>;
	private readonly _hasUpdatesAvailable = observableValue<boolean>('hasUpdatesAvailable', false);
	private _updateCheckTimer: ReturnType<typeof setTimeout> | undefined;

	readonly onDidChangeMarketplaces: Event<void>;

	readonly installedPlugins: IObservable<readonly IMarketplaceInstalledPlugin[]>;
	readonly hasUpdatesAvailable: IObservable<boolean> = this._hasUpdatesAvailable;
	readonly lastFetchedPlugins: IObservable<readonly IMarketplacePlugin[]>;

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IRequestService private readonly _requestService: IRequestService,
		@IFileService private readonly _fileService: IFileService,
		@IAgentPluginRepositoryService private readonly _pluginRepositoryService: IAgentPluginRepositoryService,
		@ILogService private readonly _logService: ILogService,
		@IStorageService private readonly _storageService: IStorageService,
	) {
		super();

		this._installedPluginsStore = this._register(
			installedPluginsMemento(StorageScope.APPLICATION, StorageTarget.MACHINE, _storageService)
		);

		this._trustedMarketplacesStore = this._register(
			trustedMarketplacesMemento(StorageScope.APPLICATION, StorageTarget.MACHINE, _storageService)
		);

		this._lastFetchedPluginsStore = this._register(
			lastFetchedPluginsMemento(StorageScope.APPLICATION, StorageTarget.MACHINE, _storageService)
		);

		this.lastFetchedPlugins = this._lastFetchedPluginsStore.map(s => {
			const revived = revive(s) as IStoredLastFetchedPlugins;
			return revived.plugins.map(ensureSourceDescriptor);
		});

		this.installedPlugins = this._installedPluginsStore.map(s =>
			(revive(s) as readonly IMarketplaceInstalledPlugin[]).map(e => ({
				...e,
				plugin: ensureSourceDescriptor(e.plugin),
			}))
		);

		this.onDidChangeMarketplaces = Event.filter(
			_configurationService.onDidChangeConfiguration,
			e => e.affectsConfiguration(ChatConfiguration.PluginsEnabled) || e.affectsConfiguration(ChatConfiguration.PluginMarketplaces),
		) as Event<unknown> as Event<void>;

		this._register(runWhenGlobalIdle(() => {
			// Schedule periodic update checks when auto-update is enabled.
			this._scheduleUpdateCheck();
			this._register(Event.filter(
				_configurationService.onDidChangeConfiguration,
				e => e.affectsConfiguration(AutoUpdateConfigurationKey),
			)(() => this._scheduleUpdateCheck()));
		}));
	}

	override dispose(): void {
		if (this._updateCheckTimer !== undefined) {
			clearTimeout(this._updateCheckTimer);
			this._updateCheckTimer = undefined;
		}
		super.dispose();
	}

	clearUpdatesAvailable(): void {
		this._hasUpdatesAvailable.set(false, undefined);
	}

	async fetchMarketplacePlugins(token: CancellationToken): Promise<IMarketplacePlugin[]> {
		if (!this._configurationService.getValue<boolean>(ChatConfiguration.PluginsEnabled)) {
			return [];
		}

		const configuredRefs = this._configurationService.getValue<unknown[]>(ChatConfiguration.PluginMarketplaces) ?? [];
		const refs = parseMarketplaceReferences(configuredRefs);

		// Return cached results if recent and the marketplace config is unchanged.
		const configFingerprint = refs.map(r => r.canonicalId).sort().join('\n');
		const stored = this._lastFetchedPluginsStore.get();
		if (stored.configFingerprint === configFingerprint && Date.now() - stored.fetchedAt < LAST_FETCHED_PLUGINS_TTL_MS) {
			const cached = this.lastFetchedPlugins.get();
			if (cached.length > 0) {
				return [...cached];
			}
		}

		for (const value of configuredRefs) {
			if (typeof value !== 'string' || !parseMarketplaceReference(value)) {
				this._logService.debug(`[PluginMarketplaceService] Ignoring invalid marketplace entry: ${String(value)}`);
			}
		}

		const results = await Promise.all(
			refs.map(ref => {
				if (ref.kind === MarketplaceReferenceKind.GitHubShorthand && ref.githubRepo) {
					return this._fetchFromGitHubRepo(ref, ref.githubRepo, token);
				}
				return this._fetchFromClonedRepo(ref, token);
			})
		);
		const plugins = results.flat();
		this._lastFetchedPluginsStore.set({ plugins, fetchedAt: Date.now(), configFingerprint }, undefined);
		return plugins;
	}

	private async _fetchFromGitHubRepo(reference: IMarketplaceReference, repo: string, token: CancellationToken): Promise<IMarketplacePlugin[]> {
		const cache = this._gitHubMarketplaceCache.value;

		const cached = this._getCachedGitHubMarketplacePlugins(cache, reference.canonicalId);
		if (cached) {
			return cached;
		}

		let repoMayBePrivate = true;

		for (const def of MARKETPLACE_DEFINITIONS) {
			if (token.isCancellationRequested) {
				return [];
			}
			const url = `https://raw.githubusercontent.com/${repo}/main/${def.path}`;
			try {
				const context = await this._requestService.request({ type: 'GET', url }, token);
				const statusCode = context.res.statusCode;
				if (statusCode !== 200) {
					repoMayBePrivate &&= statusCode !== undefined && statusCode >= 400 && statusCode < 500;
					this._logService.debug(`[PluginMarketplaceService] ${url} returned status ${statusCode}, skipping`);
					continue;
				}
				const json = await asJson<IMarketplaceJson>(context);
				if (!json?.plugins || !Array.isArray(json.plugins)) {
					this._logService.debug(`[PluginMarketplaceService] ${url} did not contain a valid plugins array, skipping`);
					continue;
				}
				const plugins = json.plugins
					.filter((p): p is { name: string; description?: string; version?: string; source?: string | IJsonPluginSource } =>
						typeof p.name === 'string' && !!p.name
					)
					.flatMap(p => {
						const sourceDescriptor = parsePluginSource(p.source, json.metadata?.pluginRoot, {
							pluginName: p.name,
							logService: this._logService,
							logPrefix: `[PluginMarketplaceService]`,
						});
						if (!sourceDescriptor) {
							return [];
						}

						const source = sourceDescriptor.kind === PluginSourceKind.RelativePath ? sourceDescriptor.path : '';

						return [{
							name: p.name,
							description: p.description ?? '',
							version: p.version ?? '',
							source,
							sourceDescriptor,
							marketplace: reference.displayLabel,
							marketplaceReference: reference,
							marketplaceType: def.type,
							readmeUri: getMarketplaceReadmeUri(repo, source),
						}];
					});

				cache.set(reference.canonicalId, {
					plugins,
					expiresAt: Date.now() + GITHUB_MARKETPLACE_CACHE_TTL_MS,
					referenceRawValue: reference.rawValue,
				});
				this._savePersistedGitHubMarketplaceCache(cache);

				return plugins;
			} catch (err) {
				this._logService.debug(`[PluginMarketplaceService] Failed to fetch marketplace.json from ${url}:`, err);
				continue;
			}
		}

		if (repoMayBePrivate) {
			this._logService.debug(`[PluginMarketplaceService] ${repo} may be private, attempting clone-based marketplace discovery`);
			return this._fetchFromClonedRepo(reference, token);
		}

		this._logService.debug(`[PluginMarketplaceService] No marketplace.json found in ${repo}`);
		return [];
	}

	private _getCachedGitHubMarketplacePlugins(cache: Map<string, IGitHubMarketplaceCacheEntry>, cacheKey: string): IMarketplacePlugin[] | undefined {
		const cached = cache.get(cacheKey);
		if (!cached) {
			return undefined;
		}

		if (cached.expiresAt <= Date.now()) {
			cache.delete(cacheKey);
			this._savePersistedGitHubMarketplaceCache(cache);
			return undefined;
		}

		return [...cached.plugins];
	}

	private _loadPersistedGitHubMarketplaceCache(): Map<string, IGitHubMarketplaceCacheEntry> {
		const cache = new Map<string, IGitHubMarketplaceCacheEntry>();
		const now = Date.now();
		const stored = this._storageService.getObject<IStoredGitHubMarketplaceCache>(GITHUB_MARKETPLACE_CACHE_STORAGE_KEY, StorageScope.APPLICATION);
		if (!stored) {
			return cache;
		}

		const revived = revive<IStoredGitHubMarketplaceCache>(stored);

		for (const [cacheKey, entry] of Object.entries(revived)) {
			if (!entry || !Array.isArray(entry.plugins) || typeof entry.expiresAt !== 'number' || entry.expiresAt <= now || typeof entry.referenceRawValue !== 'string') {
				continue;
			}

			const reference = parseMarketplaceReference(entry.referenceRawValue);
			if (!reference) {
				continue;
			}

			const plugins = entry.plugins.map(plugin => ensureSourceDescriptor({
				...plugin,
				marketplace: reference.displayLabel,
				marketplaceReference: reference,
			}));

			cache.set(cacheKey, {
				plugins,
				expiresAt: entry.expiresAt,
				referenceRawValue: entry.referenceRawValue,
			});
		}

		return cache;
	}

	private _savePersistedGitHubMarketplaceCache(cache: Map<string, IGitHubMarketplaceCacheEntry>): void {
		const serialized: IStoredGitHubMarketplaceCache = {};
		for (const [cacheKey, entry] of cache) {
			if (!entry.plugins.length || entry.expiresAt <= Date.now()) {
				continue;
			}

			serialized[cacheKey] = {
				expiresAt: entry.expiresAt,
				referenceRawValue: entry.referenceRawValue,
				plugins: entry.plugins,
			};
		}

		if (Object.keys(serialized).length === 0) {
			this._storageService.remove(GITHUB_MARKETPLACE_CACHE_STORAGE_KEY, StorageScope.APPLICATION);
			return;
		}

		this._storageService.store(
			GITHUB_MARKETPLACE_CACHE_STORAGE_KEY,
			JSON.stringify(serialized),
			StorageScope.APPLICATION,
			StorageTarget.MACHINE,
		);
	}

	getMarketplacePluginMetadata(pluginUri: URI): IMarketplacePlugin | undefined {
		const installed = this.installedPlugins.get();
		return installed.find(e => isEqualOrParent(pluginUri, e.pluginUri))?.plugin;
	}

	addInstalledPlugin(pluginUri: URI, plugin: IMarketplacePlugin): void {
		const current = this.installedPlugins.get();
		const existing = current.find(e => isEqual(e.pluginUri, pluginUri));
		if (existing) {
			// Still update to trigger watchers to re-check, something might have happened that we want to know about
			this._installedPluginsStore.set(current.map(c => c === existing ? { pluginUri, plugin, enabled: existing.enabled } : c), undefined);
		} else {
			this._installedPluginsStore.set([...current, { pluginUri, plugin, enabled: true }], undefined);
		}
	}

	removeInstalledPlugin(pluginUri: URI): void {
		const current = this.installedPlugins.get();
		this._installedPluginsStore.set(current.filter(e => !isEqual(e.pluginUri, pluginUri)), undefined);
	}

	setInstalledPluginEnabled(pluginUri: URI, enabled: boolean): void {
		const current = this.installedPlugins.get();
		this._installedPluginsStore.set(
			current.map(e => isEqual(e.pluginUri, pluginUri) ? { ...e, enabled } : e),
			undefined,
		);
	}

	isMarketplaceTrusted(ref: IMarketplaceReference): boolean {
		return this._trustedMarketplacesStore.get().includes(ref.canonicalId);
	}

	trustMarketplace(ref: IMarketplaceReference): void {
		const current = this._trustedMarketplacesStore.get();
		if (!current.includes(ref.canonicalId)) {
			this._trustedMarketplacesStore.set([...current, ref.canonicalId], undefined);
		}
	}

	// --- Periodic update check ------------------------------------------------

	private _isAutoUpdateEnabled(): AutoUpdateConfigurationValue {
		return this._configurationService.getValue<AutoUpdateConfigurationValue>(AutoUpdateConfigurationKey);
	}

	/**
	 * (Re-)schedules the next periodic update check. Called on
	 * construction and whenever the auto-update config changes.
	 */
	private _scheduleUpdateCheck(): void {
		if (this._updateCheckTimer !== undefined) {
			clearTimeout(this._updateCheckTimer);
			this._updateCheckTimer = undefined;
		}

		if (!this._isAutoUpdateEnabled()) {
			return;
		}

		const lastCheck = this._storageService.getNumber(
			PLUGIN_UPDATE_LAST_CHECK_STORAGE_KEY,
			StorageScope.APPLICATION,
			0,
		);
		const elapsed = Date.now() - lastCheck;
		const delay = Math.max(0, PLUGIN_UPDATE_CHECK_INTERVAL_MS - elapsed);

		this._updateCheckTimer = setTimeout(() => this._runUpdateCheck(), delay);
	}

	private async _runUpdateCheck(): Promise<void> {
		this._updateCheckTimer = undefined;

		try {
			const installed = this.installedPlugins.get().filter(e => e.enabled);
			if (installed.length === 0) {
				return;
			}

			const seenMarketplaces = new Set<string>();
			let hasUpdates = false;

			for (const entry of installed) {
				const ref = entry.plugin.marketplaceReference;
				if (seenMarketplaces.has(ref.canonicalId)) {
					continue;
				}
				seenMarketplaces.add(ref.canonicalId);

				try {
					const behind = await this._pluginRepositoryService.fetchRepository(ref);
					if (behind) {
						hasUpdates = true;
						break;
					}
				} catch (err) {
					this._logService.debug(`[PluginMarketplaceService] Update check failed for ${ref.displayLabel}:`, err);
				}
			}

			this._hasUpdatesAvailable.set(hasUpdates, undefined);
			this._storageService.store(
				PLUGIN_UPDATE_LAST_CHECK_STORAGE_KEY,
				Date.now(),
				StorageScope.APPLICATION,
				StorageTarget.MACHINE,
			);
		} catch (err) {
			this._logService.debug('[PluginMarketplaceService] Periodic update check failed:', err);
		} finally {
			// Reschedule for the next check
			if (this._isAutoUpdateEnabled()) {
				this._updateCheckTimer = setTimeout(() => this._runUpdateCheck(), PLUGIN_UPDATE_CHECK_INTERVAL_MS);
			}
		}
	}

	private async _fetchFromClonedRepo(reference: IMarketplaceReference, token: CancellationToken): Promise<IMarketplacePlugin[]> {
		let repoDir: URI;
		try {
			repoDir = await this._pluginRepositoryService.ensureRepository(reference);
		} catch (err) {
			this._logService.debug(`[PluginMarketplaceService] Failed to prepare marketplace repository ${reference.rawValue}:`, err);
			return [];
		}

		for (const def of MARKETPLACE_DEFINITIONS) {
			if (token.isCancellationRequested) {
				return [];
			}

			const definitionUri = joinPath(repoDir, def.path);
			let json: IMarketplaceJson | undefined;
			try {
				const contents = await this._fileService.readFile(definitionUri);
				json = parseJSONC(contents.value.toString()) as IMarketplaceJson | undefined;
			} catch {
				continue;
			}

			if (!json?.plugins || !Array.isArray(json.plugins)) {
				this._logService.debug(`[PluginMarketplaceService] ${definitionUri.toString()} did not contain a valid plugins array, skipping`);
				continue;
			}

			return json.plugins
				.filter((p): p is { name: string; description?: string; version?: string; source?: string | IJsonPluginSource } =>
					typeof p.name === 'string' && !!p.name
				)
				.flatMap(p => {
					const sourceDescriptor = parsePluginSource(p.source, json.metadata?.pluginRoot, {
						pluginName: p.name,
						logService: this._logService,
						logPrefix: `[PluginMarketplaceService]`,
					});
					if (!sourceDescriptor) {
						return [];
					}

					const source = sourceDescriptor.kind === PluginSourceKind.RelativePath ? sourceDescriptor.path : '';

					return [{
						name: p.name,
						description: p.description ?? '',
						version: p.version ?? '',
						source,
						sourceDescriptor,
						marketplace: reference.displayLabel,
						marketplaceReference: reference,
						marketplaceType: def.type,
						readmeUri: getMarketplaceReadmeFileUri(repoDir, source),
					}];
				});
		}

		this._logService.debug(`[PluginMarketplaceService] No marketplace.json found in ${reference.rawValue}`);
		return [];
	}
}

export function parseMarketplaceReferences(values: readonly unknown[]): IMarketplaceReference[] {
	const byCanonicalId = new Map<string, IMarketplaceReference>();

	for (const value of values) {
		if (typeof value !== 'string') {
			continue;
		}

		const parsed = parseMarketplaceReference(value);
		if (!parsed) {
			continue;
		}

		if (!byCanonicalId.has(parsed.canonicalId)) {
			byCanonicalId.set(parsed.canonicalId, parsed);
		}
	}

	return [...byCanonicalId.values()];
}

export function parseMarketplaceReference(value: string): IMarketplaceReference | undefined {
	const rawValue = value.trim();
	if (!rawValue) {
		return undefined;
	}

	const uriReference = parseUriMarketplaceReference(rawValue);
	if (uriReference) {
		return uriReference;
	}

	const scpReference = parseScpMarketplaceReference(rawValue);
	if (scpReference) {
		return scpReference;
	}

	const shorthandMatch = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(rawValue);
	if (shorthandMatch) {
		const owner = shorthandMatch[1];
		const repo = shorthandMatch[2];
		return {
			rawValue,
			displayLabel: `${owner}/${repo}`,
			cloneUrl: `https://github.com/${owner}/${repo}.git`,
			canonicalId: getGitHubCanonicalId(owner, repo),
			cacheSegments: ['github.com', owner, repo],
			kind: MarketplaceReferenceKind.GitHubShorthand,
			githubRepo: `${owner}/${repo}`,
		};
	}

	return undefined;
}

function parseUriMarketplaceReference(rawValue: string): IMarketplaceReference | undefined {
	let uri: URI;
	try {
		uri = URI.parse(rawValue);
	} catch {
		return undefined;
	}

	const scheme = uri.scheme.toLowerCase();
	if (scheme === 'file' && /^file:\/\//i.test(rawValue)) {
		const localRepositoryUri = URI.file(uri.fsPath);
		return {
			rawValue,
			displayLabel: localRepositoryUri.fsPath,
			cloneUrl: rawValue,
			canonicalId: `file:${localRepositoryUri.toString().toLowerCase()}`,
			cacheSegments: [],
			kind: MarketplaceReferenceKind.LocalFileUri,
			localRepositoryUri,
		};
	}

	if (scheme !== 'http' && scheme !== 'https' && scheme !== 'ssh') {
		return undefined;
	}

	if (!uri.authority) {
		return undefined;
	}

	const normalizedPath = normalizeGitRepoPath(uri.path);
	if (!normalizedPath) {
		return undefined;
	}

	const gitSuffix = '.git';
	const sanitizedAuthority = sanitizePathSegment(uri.authority.toLowerCase());
	const pathHasGitSuffix = normalizedPath.toLowerCase().endsWith(gitSuffix);
	const pathWithoutGit = pathHasGitSuffix ? normalizedPath.slice(1, normalizedPath.length - gitSuffix.length) : normalizedPath.slice(1);
	const pathSegments = pathWithoutGit.split('/').map(sanitizePathSegment);
	// Always normalize the canonical path to include .git so that URLs with and without the suffix deduplicate.
	const canonicalPath = pathHasGitSuffix ? normalizedPath.slice(1).toLowerCase() : `${normalizedPath.slice(1).toLowerCase()}${gitSuffix}`;
	return {
		rawValue,
		displayLabel: rawValue,
		cloneUrl: rawValue,
		canonicalId: `git:${uri.authority.toLowerCase()}/${canonicalPath}`,
		cacheSegments: [sanitizedAuthority, ...pathSegments],
		kind: MarketplaceReferenceKind.GitUri,
	};
}

function parseScpMarketplaceReference(rawValue: string): IMarketplaceReference | undefined {
	const match = /^([^@\s]+)@([^:\s]+):(.+\.git)$/i.exec(rawValue);
	if (!match) {
		return undefined;
	}

	const authority = match[2];
	const pathWithGit = match[3].replace(/^\/+/, '');
	if (!pathWithGit.toLowerCase().endsWith('.git')) {
		return undefined;
	}

	const pathSegments = pathWithGit.slice(0, -4).split('/').map(sanitizePathSegment);
	return {
		rawValue,
		displayLabel: rawValue,
		cloneUrl: rawValue,
		canonicalId: `git:${authority.toLowerCase()}/${pathWithGit.toLowerCase()}`,
		cacheSegments: [sanitizePathSegment(authority.toLowerCase()), ...pathSegments],
		kind: MarketplaceReferenceKind.GitUri,
	};
}

/**
 * Normalizes a Git repository path and validates that it has at least two segments
 * (i.e., at least one owner/repo pair below the root). Accepts paths with or without
 * a `.git` suffix — the suffix is preserved in the returned value so callers can decide
 * how to treat it.
 */
function normalizeGitRepoPath(path: string): string | undefined {
	const gitSuffix = '.git';
	const trimmed = path.replace(/\/+/g, '/').replace(/\/+$/g, '');

	const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
	// Strip .git suffix (if present) only for the purposes of validating path depth.
	const pathWithoutGit = withLeadingSlash.toLowerCase().endsWith(gitSuffix)
		? withLeadingSlash.slice(1, withLeadingSlash.length - gitSuffix.length)
		: withLeadingSlash.slice(1);
	if (!pathWithoutGit || !pathWithoutGit.includes('/')) {
		return undefined;
	}

	return withLeadingSlash;
}

function getGitHubCanonicalId(owner: string, repo: string): string {
	return `github:${owner.toLowerCase()}/${repo.toLowerCase()}`;
}

function sanitizePathSegment(value: string): string {
	return value.replace(/[\\/:*?"<>|]/g, '_');
}

function normalizeMarketplacePath(value: string): string {
	let normalized = value.trim().replace(/\\/g, '/');
	normalized = normalized.replace(/^\.?\/+/, '').replace(/\/+$/g, '');
	return normalized;
}

/**
 * Resolve plugin source from marketplace metadata.
 * - If pluginRoot exists, plugin source is resolved relative to it.
 * - If source already includes pluginRoot, it's preserved.
 * Validation of whether the final path is allowed is performed by the install service.
 */
function resolvePluginSource(pluginRoot: string | undefined, source: string): string | undefined {
	const normalizedRoot = pluginRoot ? normalizeMarketplacePath(pluginRoot) : '';
	const normalizedSource = normalizeMarketplacePath(source);
	const repoRoot = URI.file('/');
	const pluginRootUri = normalizedRoot ? normalizePath(joinPath(repoRoot, normalizedRoot)) : repoRoot;

	if (!normalizedSource) {
		return normalizedRoot || undefined;
	}

	if (normalizedRoot && (normalizedSource === normalizedRoot || normalizedSource.startsWith(`${normalizedRoot}/`))) {
		return normalizedSource;
	}

	const resolvedUri = normalizePath(joinPath(pluginRootUri, normalizedSource));
	return relativePath(repoRoot, resolvedUri) ?? undefined;
}

/**
 * Parse a raw `source` field from marketplace.json into a structured
 * {@link IPluginSourceDescriptor}. Accepts either a relative-path string
 * or a JSON object with a `source` discriminant indicating the kind.
 */
export function parsePluginSource(
	rawSource: string | IJsonPluginSource | undefined,
	pluginRoot: string | undefined,
	logContext: { pluginName: string; logService: ILogService; logPrefix: string },
): IPluginSourceDescriptor | undefined {
	if (rawSource === undefined || rawSource === null) {
		// Treat missing source the same as empty string → pluginRoot or repo root.
		const resolved = resolvePluginSource(pluginRoot, '');
		if (resolved === undefined) {
			return undefined;
		}
		return { kind: PluginSourceKind.RelativePath, path: resolved };
	}

	// String source → legacy relative-path behaviour.
	if (typeof rawSource === 'string') {
		const resolved = resolvePluginSource(pluginRoot, rawSource);
		if (resolved === undefined) {
			return undefined;
		}
		return { kind: PluginSourceKind.RelativePath, path: resolved };
	}

	// Object source → discriminated by `rawSource.source`.
	if (typeof rawSource !== 'object' || typeof rawSource.source !== 'string') {
		logContext.logService.warn(`${logContext.logPrefix} Skipping plugin '${logContext.pluginName}': source object is missing a 'source' discriminant`);
		return undefined;
	}

	switch (rawSource.source) {
		case 'github': {
			if (typeof rawSource.repo !== 'string' || !rawSource.repo) {
				logContext.logService.warn(`${logContext.logPrefix} Skipping plugin '${logContext.pluginName}': github source is missing required 'repo' field`);
				return undefined;
			}
			if (!isValidGitHubRepo(rawSource.repo)) {
				logContext.logService.warn(`${logContext.logPrefix} Skipping plugin '${logContext.pluginName}': github source repo must be in 'owner/repo' format`);
				return undefined;
			}
			if (!isOptionalString(rawSource.ref)) {
				logContext.logService.warn(`${logContext.logPrefix} Skipping plugin '${logContext.pluginName}': github source 'ref' must be a string when provided`);
				return undefined;
			}
			if (!isOptionalGitSha(rawSource.sha)) {
				logContext.logService.warn(`${logContext.logPrefix} Skipping plugin '${logContext.pluginName}': github source 'sha' must be a full 40-character commit hash when provided`);
				return undefined;
			}
			return {
				kind: PluginSourceKind.GitHub,
				repo: rawSource.repo,
				ref: rawSource.ref,
				sha: rawSource.sha,
			};
		}
		case 'url': {
			if (typeof rawSource.url !== 'string' || !rawSource.url) {
				logContext.logService.warn(`${logContext.logPrefix} Skipping plugin '${logContext.pluginName}': url source is missing required 'url' field`);
				return undefined;
			}
			if (!rawSource.url.toLowerCase().endsWith('.git')) {
				logContext.logService.warn(`${logContext.logPrefix} Skipping plugin '${logContext.pluginName}': url source must end with '.git'`);
				return undefined;
			}
			if (!isOptionalString(rawSource.ref)) {
				logContext.logService.warn(`${logContext.logPrefix} Skipping plugin '${logContext.pluginName}': url source 'ref' must be a string when provided`);
				return undefined;
			}
			if (!isOptionalGitSha(rawSource.sha)) {
				logContext.logService.warn(`${logContext.logPrefix} Skipping plugin '${logContext.pluginName}': url source 'sha' must be a full 40-character commit hash when provided`);
				return undefined;
			}
			return {
				kind: PluginSourceKind.GitUrl,
				url: rawSource.url,
				ref: rawSource.ref,
				sha: rawSource.sha,
			};
		}
		case 'npm': {
			if (typeof rawSource.package !== 'string' || !rawSource.package) {
				logContext.logService.warn(`${logContext.logPrefix} Skipping plugin '${logContext.pluginName}': npm source is missing required 'package' field`);
				return undefined;
			}
			if (!isOptionalString(rawSource.version) || !isOptionalString(rawSource.registry)) {
				logContext.logService.warn(`${logContext.logPrefix} Skipping plugin '${logContext.pluginName}': npm source 'version' and 'registry' must be strings when provided`);
				return undefined;
			}
			return {
				kind: PluginSourceKind.Npm,
				package: rawSource.package,
				version: rawSource.version,
				registry: rawSource.registry,
			};
		}
		case 'pip': {
			if (typeof rawSource.package !== 'string' || !rawSource.package) {
				logContext.logService.warn(`${logContext.logPrefix} Skipping plugin '${logContext.pluginName}': pip source is missing required 'package' field`);
				return undefined;
			}
			if (!isOptionalString(rawSource.version) || !isOptionalString(rawSource.registry)) {
				logContext.logService.warn(`${logContext.logPrefix} Skipping plugin '${logContext.pluginName}': pip source 'version' and 'registry' must be strings when provided`);
				return undefined;
			}
			return {
				kind: PluginSourceKind.Pip,
				package: rawSource.package,
				version: rawSource.version,
				registry: rawSource.registry,
			};
		}
		default:
			logContext.logService.warn(`${logContext.logPrefix} Skipping plugin '${logContext.pluginName}': unknown source kind '${rawSource.source}'`);
			return undefined;
	}
}

function isOptionalString(value: unknown): value is string | undefined {
	return value === undefined || typeof value === 'string';
}

function isOptionalGitSha(value: unknown): value is string | undefined {
	return value === undefined || (typeof value === 'string' && /^[0-9a-fA-F]{40}$/.test(value));
}

function isValidGitHubRepo(repo: string): boolean {
	return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo);
}

/**
 * Returns a human-readable label for a plugin source descriptor,
 * suitable for error messages and UI display.
 */
export function getPluginSourceLabel(descriptor: IPluginSourceDescriptor): string {
	switch (descriptor.kind) {
		case PluginSourceKind.RelativePath:
			return descriptor.path || '.';
		case PluginSourceKind.GitHub:
			return descriptor.repo;
		case PluginSourceKind.GitUrl:
			return descriptor.url;
		case PluginSourceKind.Npm:
			return descriptor.version ? `${descriptor.package}@${descriptor.version}` : descriptor.package;
		case PluginSourceKind.Pip:
			return descriptor.version ? `${descriptor.package}==${descriptor.version}` : descriptor.package;
	}
}

/**
 * Returns `true` when the marketplace source descriptor differs from the
 * installed one — meaning an update should be performed.
 */
export function hasSourceChanged(installed: IPluginSourceDescriptor, marketplace: IPluginSourceDescriptor): boolean {
	if (installed.kind !== marketplace.kind) {
		return true;
	}

	switch (installed.kind) {
		case PluginSourceKind.GitHub:
			return installed.ref !== (marketplace as typeof installed).ref
				|| installed.sha !== (marketplace as typeof installed).sha;
		case PluginSourceKind.GitUrl:
			return installed.ref !== (marketplace as typeof installed).ref
				|| installed.sha !== (marketplace as typeof installed).sha;
		case PluginSourceKind.Npm:
			return installed.version !== (marketplace as typeof installed).version;
		case PluginSourceKind.Pip:
			return installed.version !== (marketplace as typeof installed).version;
		default:
			return false;
	}
}

function getMarketplaceReadmeUri(repo: string, source: string): URI {
	const normalizedSource = source.trim().replace(/^\.?\/+|\/+$/g, '');
	const readmePath = normalizedSource ? `${normalizedSource}/README.md` : 'README.md';
	return URI.parse(`https://github.com/${repo}/blob/main/${readmePath}`);
}

function getMarketplaceReadmeFileUri(repoDir: URI, source: string): URI {
	const normalizedSource = source.trim().replace(/^\.?\/+|\/+$/g, '');
	return normalizedSource ? joinPath(repoDir, normalizedSource, 'README.md') : joinPath(repoDir, 'README.md');
}
