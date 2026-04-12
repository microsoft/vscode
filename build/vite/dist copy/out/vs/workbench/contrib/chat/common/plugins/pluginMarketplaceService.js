/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { runWhenGlobalIdle } from '../../../../../base/common/async.js';
import { Event } from '../../../../../base/common/event.js';
import { parse as parseJSONC } from '../../../../../base/common/json.js';
import { Lazy } from '../../../../../base/common/lazy.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { revive } from '../../../../../base/common/marshalling.js';
import { autorun, derived, observableFromEvent, observableValue } from '../../../../../base/common/observable.js';
import { isEqual, isEqualOrParent, joinPath, normalizePath, relativePath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { observableMemento } from '../../../../../platform/observable/common/observableMemento.js';
import { asJson, IRequestService } from '../../../../../platform/request/common/request.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { AutoUpdateConfigurationKey } from '../../../extensions/common/extensions.js';
import { ChatConfiguration } from '../constants.js';
import { IAgentPluginRepositoryService } from './agentPluginRepositoryService.js';
import { FileBackedInstalledPluginsStore } from './fileBackedInstalledPluginsStore.js';
import { IWorkspacePluginSettingsService } from './workspacePluginSettingsService.js';
import { IWorkspaceTrustManagementService } from '../../../../../platform/workspace/common/workspaceTrust.js';
import { deduplicateMarketplaceReferences, parseMarketplaceReference, parseMarketplaceReferences } from './marketplaceReference.js';
// Re-export marketplace reference types for downstream consumers.
export { deduplicateMarketplaceReferences, MarketplaceReferenceKind, parseMarketplaceReference, parseMarketplaceReferences } from './marketplaceReference.js';
export var MarketplaceType;
(function (MarketplaceType) {
    MarketplaceType["Copilot"] = "copilot";
    MarketplaceType["Claude"] = "claude";
    MarketplaceType["OpenPlugin"] = "openPlugin";
})(MarketplaceType || (MarketplaceType = {}));
export var PluginSourceKind;
(function (PluginSourceKind) {
    PluginSourceKind["RelativePath"] = "relativePath";
    PluginSourceKind["GitHub"] = "github";
    PluginSourceKind["GitUrl"] = "url";
    PluginSourceKind["Npm"] = "npm";
    PluginSourceKind["Pip"] = "pip";
})(PluginSourceKind || (PluginSourceKind = {}));
export const IPluginMarketplaceService = createDecorator('pluginMarketplaceService');
/**
 * Marketplace definition files by type, checked in order per repository.
 * The first match determines the marketplace type.
 */
const MARKETPLACE_DEFINITIONS = [
    { type: "openPlugin" /* MarketplaceType.OpenPlugin */, path: 'marketplace.json' },
    { type: "openPlugin" /* MarketplaceType.OpenPlugin */, path: '.plugin/marketplace.json' },
    { type: "copilot" /* MarketplaceType.Copilot */, path: '.github/plugin/marketplace.json' },
    { type: "claude" /* MarketplaceType.Claude */, path: '.claude-plugin/marketplace.json' },
];
const GITHUB_MARKETPLACE_CACHE_TTL_MS = 8 * 60 * 60 * 1000;
const GITHUB_MARKETPLACE_CACHE_STORAGE_KEY = 'chat.plugins.marketplaces.githubCache.v1';
/** Interval between periodic plugin update checks (24 hours). */
const PLUGIN_UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const PLUGIN_UPDATE_LAST_CHECK_STORAGE_KEY = 'chat.plugins.lastUpdateCheck.v1';
/**
 * Ensures that an {@link IMarketplacePlugin} loaded from storage has a
 * {@link IMarketplacePlugin.sourceDescriptor sourceDescriptor}. Plugins
 * persisted before the sourceDescriptor field was introduced will only
 * have the legacy `source` string — this function synthesises a
 * {@link PluginSourceKind.RelativePath} descriptor from it.
 */
function ensureSourceDescriptor(plugin) {
    if (plugin.sourceDescriptor) {
        return plugin;
    }
    return {
        ...plugin,
        sourceDescriptor: { kind: "relativePath" /* PluginSourceKind.RelativePath */, path: plugin.source },
    };
}
const trustedMarketplacesMemento = observableMemento({
    defaultValue: [],
    key: 'chat.plugins.trustedMarketplaces.v1',
    toStorage: value => JSON.stringify(value),
    fromStorage: value => {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
    },
});
const lastFetchedPluginsMemento = observableMemento({
    defaultValue: { plugins: [], fetchedAt: 0 },
    key: 'chat.plugins.lastFetchedPlugins.v2',
    toStorage: value => JSON.stringify(value),
    fromStorage: value => {
        const parsed = JSON.parse(value);
        if (parsed && Array.isArray(parsed.plugins)) {
            return parsed;
        }
        return { plugins: [], fetchedAt: 0 };
    },
});
let PluginMarketplaceService = class PluginMarketplaceService extends Disposable {
    constructor(_configurationService, _requestService, environmentService, _fileService, _pluginRepositoryService, _logService, _storageService, _workspacePluginSettingsService, _workspaceTrustService) {
        super();
        this._configurationService = _configurationService;
        this._requestService = _requestService;
        this._fileService = _fileService;
        this._pluginRepositoryService = _pluginRepositoryService;
        this._logService = _logService;
        this._storageService = _storageService;
        this._workspacePluginSettingsService = _workspacePluginSettingsService;
        this._workspaceTrustService = _workspaceTrustService;
        this._gitHubMarketplaceCache = new Lazy(() => this._loadPersistedGitHubMarketplaceCache());
        this._pluginMetadata = new Map();
        this._hasUpdatesAvailable = observableValue('hasUpdatesAvailable', false);
        this.hasUpdatesAvailable = this._hasUpdatesAvailable;
        // File-backed store for installed plugins. The old cache location
        // is passed so the store can rebase URIs during migration.
        const oldCacheRoot = joinPath(environmentService.cacheHome, 'agentPlugins');
        this._installedPluginsStore = this._register(new FileBackedInstalledPluginsStore(_pluginRepositoryService.agentPluginsHome, oldCacheRoot, _fileService, _logService, _storageService));
        this._trustedMarketplacesStore = this._register(trustedMarketplacesMemento(-1 /* StorageScope.APPLICATION */, 1 /* StorageTarget.MACHINE */, _storageService));
        this._lastFetchedPluginsStore = this._register(lastFetchedPluginsMemento(-1 /* StorageScope.APPLICATION */, 1 /* StorageTarget.MACHINE */, _storageService));
        this.lastFetchedPlugins = this._lastFetchedPluginsStore.map(s => {
            const revived = revive(s);
            return revived.plugins.map(ensureSourceDescriptor);
        });
        this.installedPlugins = this._installedPluginsStore.value.map(entries => {
            const result = [];
            for (const e of entries) {
                const plugin = this._pluginMetadata.get(e.pluginUri.toString());
                if (plugin) {
                    result.push({ pluginUri: e.pluginUri, plugin });
                }
            }
            return result;
        });
        // Aggregate recommended plugin keys from all providers.
        // Currently sourced from Claude workspace settings; more providers can be
        // added here via additional observables in the derived computation.
        // Only expose recommendations when the workspace is trusted.
        const workspaceTrusted = observableFromEvent(this, this._workspaceTrustService.onDidChangeTrust, () => this._workspaceTrustService.isWorkspaceTrusted());
        this.recommendedPlugins = derived(reader => {
            if (!workspaceTrusted.read(reader)) {
                return new Set();
            }
            const enabledMap = this._workspacePluginSettingsService.enabledPlugins.read(reader);
            const keys = new Set();
            for (const [key, value] of enabledMap) {
                if (value) {
                    keys.add(key);
                }
            }
            return keys;
        });
        this.onDidChangeMarketplaces = Event.any(Event.filter(_configurationService.onDidChangeConfiguration, e => e.affectsConfiguration(ChatConfiguration.PluginsEnabled) || e.affectsConfiguration(ChatConfiguration.PluginMarketplaces)), Event.fromObservableLight(this._workspacePluginSettingsService.extraMarketplaces), Event.map(this._workspaceTrustService.onDidChangeTrust, () => { }));
        this._register(runWhenGlobalIdle(() => {
            // Schedule periodic update checks when auto-update is enabled.
            this._scheduleUpdateCheck();
            this._register(Event.filter(_configurationService.onDidChangeConfiguration, e => e.affectsConfiguration(AutoUpdateConfigurationKey))(() => this._scheduleUpdateCheck()));
        }));
        // Hydrate plugin metadata for installed entries that are not yet in
        // the in-memory cache (e.g. after restart when installed.json is read
        // but the metadata map is empty). Walks up from each plugin URI to
        // find the marketplace.json in the enclosing repository directory.
        this._register(autorun(reader => {
            const entries = this._installedPluginsStore.value.read(reader);
            const unhydrated = entries.filter(e => !this._pluginMetadata.has(e.pluginUri.toString()));
            if (unhydrated.length > 0) {
                this._hydratePluginMetadata(unhydrated);
            }
        }));
    }
    dispose() {
        if (this._updateCheckTimer !== undefined) {
            clearTimeout(this._updateCheckTimer);
            this._updateCheckTimer = undefined;
        }
        super.dispose();
    }
    clearUpdatesAvailable() {
        this._hasUpdatesAvailable.set(false, undefined);
    }
    async fetchMarketplacePlugins(token) {
        if (!this._configurationService.getValue(ChatConfiguration.PluginsEnabled)) {
            return [];
        }
        const configuredRefs = this._configurationService.getValue(ChatConfiguration.PluginMarketplaces) ?? [];
        const configRefs = parseMarketplaceReferences(configuredRefs);
        // Merge marketplace references from Claude workspace settings.
        // Workspace-defined refs take precedence (are primary) so that their
        // displayLabel overrides any matching global marketplace entry.
        // Only include workspace-sourced refs when the workspace is trusted.
        let allRefs;
        if (this._workspaceTrustService.isWorkspaceTrusted()) {
            const workspaceEntries = this._workspacePluginSettingsService.extraMarketplaces.get();
            allRefs = deduplicateMarketplaceReferences(workspaceEntries.map(e => e.reference), configRefs);
        }
        else {
            allRefs = configRefs;
        }
        for (const value of configuredRefs) {
            if (typeof value !== 'string' || !parseMarketplaceReference(value)) {
                this._logService.debug(`[PluginMarketplaceService] Ignoring invalid marketplace entry: ${String(value)}`);
            }
        }
        const results = await Promise.all(allRefs.map(ref => {
            if (ref.kind === "githubShorthand" /* MarketplaceReferenceKind.GitHubShorthand */ && ref.githubRepo) {
                return this._fetchFromGitHubRepo(ref, ref.githubRepo, token);
            }
            return this._fetchFromClonedRepo(ref, token);
        }));
        const plugins = results.flat();
        this._lastFetchedPluginsStore.set({ plugins, fetchedAt: Date.now() }, undefined);
        return plugins;
    }
    async _fetchFromGitHubRepo(reference, repo, token) {
        const cache = this._gitHubMarketplaceCache.value;
        const cached = this._getCachedGitHubMarketplacePlugins(cache, reference.canonicalId);
        if (cached) {
            return cached.map(c => ({
                ...c,
                marketplace: reference.displayLabel,
                marketplaceReference: reference,
            }));
        }
        let repoMayBePrivate = true;
        const plugins = await this._readPluginsFromDefinitions(reference, async (defPath) => {
            if (token.isCancellationRequested) {
                return undefined;
            }
            const url = `https://raw.githubusercontent.com/${repo}/main/${defPath}`;
            try {
                const context = await this._requestService.request({ type: 'GET', url, callSite: 'pluginMarketplaceService.fetchPluginList' }, token);
                const statusCode = context.res.statusCode;
                if (statusCode !== 200) {
                    repoMayBePrivate &&= statusCode !== undefined && statusCode >= 400 && statusCode < 500;
                    this._logService.debug(`[PluginMarketplaceService] ${url} returned status ${statusCode}, skipping`);
                    return undefined;
                }
                return await asJson(context) ?? undefined;
            }
            catch (err) {
                this._logService.debug(`[PluginMarketplaceService] Failed to fetch marketplace.json from ${url}:`, err);
                return undefined;
            }
        });
        if (plugins.length > 0) {
            cache.set(reference.canonicalId, {
                plugins,
                expiresAt: Date.now() + GITHUB_MARKETPLACE_CACHE_TTL_MS,
                referenceRawValue: reference.rawValue,
            });
            this._savePersistedGitHubMarketplaceCache(cache);
            return plugins;
        }
        if (repoMayBePrivate) {
            this._logService.debug(`[PluginMarketplaceService] ${repo} may be private, attempting clone-based marketplace discovery`);
            return this._fetchFromClonedRepo(reference, token);
        }
        this._logService.debug(`[PluginMarketplaceService] No marketplace.json found in ${repo}`);
        return [];
    }
    _getCachedGitHubMarketplacePlugins(cache, cacheKey) {
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
    _loadPersistedGitHubMarketplaceCache() {
        const cache = new Map();
        const now = Date.now();
        const stored = this._storageService.getObject(GITHUB_MARKETPLACE_CACHE_STORAGE_KEY, -1 /* StorageScope.APPLICATION */);
        if (!stored) {
            return cache;
        }
        const revived = revive(stored);
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
    _savePersistedGitHubMarketplaceCache(cache) {
        const serialized = {};
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
            this._storageService.remove(GITHUB_MARKETPLACE_CACHE_STORAGE_KEY, -1 /* StorageScope.APPLICATION */);
            return;
        }
        this._storageService.store(GITHUB_MARKETPLACE_CACHE_STORAGE_KEY, JSON.stringify(serialized), -1 /* StorageScope.APPLICATION */, 1 /* StorageTarget.MACHINE */);
    }
    getMarketplacePluginMetadata(pluginUri) {
        return this._pluginMetadata.get(pluginUri.toString())
            ?? [...this._pluginMetadata.entries()].find(([key]) => isEqualOrParent(pluginUri, URI.parse(key)))?.[1];
    }
    addInstalledPlugin(pluginUri, plugin) {
        this._pluginMetadata.set(pluginUri.toString(), plugin);
        const current = this._installedPluginsStore.get();
        const existing = current.find(e => isEqual(e.pluginUri, pluginUri));
        if (existing) {
            // Still update to trigger watchers to re-check, something might have happened that we want to know about
            this._installedPluginsStore.set(current.map(c => c === existing ? { pluginUri, marketplace: plugin.marketplaceReference.rawValue } : c), undefined);
        }
        else {
            this._installedPluginsStore.set([...current, { pluginUri, marketplace: plugin.marketplaceReference.rawValue }], undefined);
        }
    }
    removeInstalledPlugin(pluginUri) {
        this._pluginMetadata.delete(pluginUri.toString());
        const current = this._installedPluginsStore.get();
        this._installedPluginsStore.set(current.filter(e => !isEqual(e.pluginUri, pluginUri)), undefined);
    }
    isMarketplaceTrusted(ref) {
        return this._trustedMarketplacesStore.get().includes(ref.canonicalId);
    }
    // --- Plugin metadata hydration -----------------------------------------------
    /**
     * For each plugin URI that has no cached metadata, walk up the directory
     * tree from the plugin towards the agent-plugins root looking for a
     * marketplace definition file. When found, read the marketplace plugins
     * and match by source path to populate {@link _pluginMetadata}.
     *
     * After hydration completes the installed-plugins store is "touched" so
     * that the derived {@link installedPlugins} observable re-evaluates with
     * the newly available metadata.
     */
    async _hydratePluginMetadata(entries) {
        let hydrated = 0;
        for (const entry of entries) {
            const key = entry.pluginUri.toString();
            if (this._pluginMetadata.has(key)) {
                continue;
            }
            const reference = parseMarketplaceReference(entry.marketplace);
            if (!reference) {
                this._logService.debug(`[PluginMarketplaceService] Cannot parse marketplace reference '${entry.marketplace}' for ${key}`);
                continue;
            }
            try {
                const repoDir = this._pluginRepositoryService.getRepositoryUri(reference);
                const plugins = await this._readPluginsFromDirectory(repoDir, reference);
                const match = plugins.find(p => {
                    const installUri = this._pluginRepositoryService.getPluginInstallUri(p);
                    return isEqual(installUri, entry.pluginUri);
                });
                if (match) {
                    this._pluginMetadata.set(key, match);
                    hydrated++;
                }
            }
            catch (err) {
                this._logService.debug(`[PluginMarketplaceService] Failed to hydrate metadata for ${key}:`, err);
            }
        }
        if (hydrated > 0) {
            // Touch the store to trigger the derived observable to re-evaluate
            // now that _pluginMetadata has new entries.
            const current = this._installedPluginsStore.get();
            this._installedPluginsStore.set([...current], undefined);
        }
    }
    /**
     * Shared logic to parse a marketplace.json into {@link IMarketplacePlugin}
     * objects. Used by both fetch and hydration paths.
     */
    _parseMarketplacePlugins(json, reference, marketplaceType, repoDir) {
        if (!json.plugins || !Array.isArray(json.plugins)) {
            return [];
        }
        return json.plugins
            .filter((p) => typeof p.name === 'string' && !!p.name)
            .flatMap(p => {
            const sourceDescriptor = parsePluginSource(p.source, json.metadata?.pluginRoot, {
                pluginName: p.name,
                logService: this._logService,
                logPrefix: '[PluginMarketplaceService]',
            });
            if (!sourceDescriptor) {
                return [];
            }
            const source = sourceDescriptor.kind === "relativePath" /* PluginSourceKind.RelativePath */ ? sourceDescriptor.path : '';
            return [{
                    name: p.name,
                    description: p.description ?? '',
                    version: p.version ?? '',
                    source,
                    sourceDescriptor,
                    marketplace: reference.displayLabel,
                    marketplaceReference: reference,
                    marketplaceType,
                    readmeUri: repoDir ? getMarketplaceReadmeFileUri(repoDir, source) : getMarketplaceReadmeUri(reference.githubRepo ?? '', source),
                }];
        });
    }
    trustMarketplace(ref) {
        const current = this._trustedMarketplacesStore.get();
        if (!current.includes(ref.canonicalId)) {
            this._trustedMarketplacesStore.set([...current, ref.canonicalId], undefined);
        }
    }
    // --- Periodic update check ------------------------------------------------
    _isAutoUpdateEnabled() {
        return this._configurationService.getValue(AutoUpdateConfigurationKey);
    }
    /**
     * (Re-)schedules the next periodic update check. Called on
     * construction and whenever the auto-update config changes.
     */
    _scheduleUpdateCheck() {
        if (this._updateCheckTimer !== undefined) {
            clearTimeout(this._updateCheckTimer);
            this._updateCheckTimer = undefined;
        }
        if (!this._isAutoUpdateEnabled()) {
            return;
        }
        const lastCheck = this._storageService.getNumber(PLUGIN_UPDATE_LAST_CHECK_STORAGE_KEY, -1 /* StorageScope.APPLICATION */, 0);
        const elapsed = Date.now() - lastCheck;
        const delay = Math.max(0, PLUGIN_UPDATE_CHECK_INTERVAL_MS - elapsed);
        this._updateCheckTimer = setTimeout(() => this._runUpdateCheck(), delay);
    }
    async _runUpdateCheck() {
        this._updateCheckTimer = undefined;
        try {
            const installed = this.installedPlugins.get();
            if (installed.length === 0) {
                return;
            }
            const seenMarketplaces = new Set();
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
                }
                catch (err) {
                    this._logService.debug(`[PluginMarketplaceService] Update check failed for ${ref.displayLabel}:`, err);
                }
            }
            this._hasUpdatesAvailable.set(hasUpdates, undefined);
            this._storageService.store(PLUGIN_UPDATE_LAST_CHECK_STORAGE_KEY, Date.now(), -1 /* StorageScope.APPLICATION */, 1 /* StorageTarget.MACHINE */);
        }
        catch (err) {
            this._logService.debug('[PluginMarketplaceService] Periodic update check failed:', err);
        }
        finally {
            // Reschedule for the next check
            if (this._isAutoUpdateEnabled()) {
                this._updateCheckTimer = setTimeout(() => this._runUpdateCheck(), PLUGIN_UPDATE_CHECK_INTERVAL_MS);
            }
        }
    }
    async _fetchFromClonedRepo(reference, token) {
        let repoDir;
        try {
            repoDir = await this._pluginRepositoryService.ensureRepository(reference);
        }
        catch (err) {
            this._logService.debug(`[PluginMarketplaceService] Failed to prepare marketplace repository ${reference.rawValue}:`, err);
            return [];
        }
        return this._readPluginsFromDirectory(repoDir, reference, token);
    }
    async readPluginsFromDirectory(repoDir, reference) {
        return this._readPluginsFromDirectory(repoDir, reference);
    }
    async _readPluginsFromDirectory(repoDir, reference, token) {
        return this._readPluginsFromDefinitions(reference, async (defPath) => {
            if (token?.isCancellationRequested) {
                return undefined;
            }
            const definitionUri = joinPath(repoDir, defPath);
            try {
                const contents = await this._fileService.readFile(definitionUri);
                return parseJSONC(contents.value.toString());
            }
            catch {
                return undefined;
            }
        }, repoDir);
    }
    /**
     * Iterates over {@link MARKETPLACE_DEFINITIONS} paths, calling
     * {@link readJson} for each to obtain the parsed JSON. Returns the
     * plugins from the first definition that yields a valid result.
     */
    async _readPluginsFromDefinitions(reference, readJson, repoDir) {
        for (const def of MARKETPLACE_DEFINITIONS) {
            const json = await readJson(def.path);
            if (!json?.plugins || !Array.isArray(json.plugins)) {
                continue;
            }
            return this._parseMarketplacePlugins(json, reference, def.type, repoDir);
        }
        this._logService.debug(`[PluginMarketplaceService] No marketplace.json found in ${reference.rawValue}`);
        return [];
    }
};
PluginMarketplaceService = __decorate([
    __param(0, IConfigurationService),
    __param(1, IRequestService),
    __param(2, IEnvironmentService),
    __param(3, IFileService),
    __param(4, IAgentPluginRepositoryService),
    __param(5, ILogService),
    __param(6, IStorageService),
    __param(7, IWorkspacePluginSettingsService),
    __param(8, IWorkspaceTrustManagementService)
], PluginMarketplaceService);
export { PluginMarketplaceService };
function normalizeMarketplacePath(value) {
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
function resolvePluginSource(pluginRoot, source) {
    const normalizedRoot = pluginRoot ? normalizeMarketplacePath(pluginRoot) : '';
    const normalizedSource = normalizeMarketplacePath(source);
    const repoRoot = URI.file('/');
    const pluginRootUri = normalizedRoot ? normalizePath(joinPath(repoRoot, normalizedRoot)) : repoRoot;
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
export function parsePluginSource(rawSource, pluginRoot, logContext) {
    if (rawSource === undefined || rawSource === null) {
        // Treat missing source the same as empty string → pluginRoot or repo root.
        const resolved = resolvePluginSource(pluginRoot, '');
        if (resolved === undefined) {
            return undefined;
        }
        return { kind: "relativePath" /* PluginSourceKind.RelativePath */, path: resolved };
    }
    // String source → legacy relative-path behaviour.
    if (typeof rawSource === 'string') {
        const resolved = resolvePluginSource(pluginRoot, rawSource);
        if (resolved === undefined) {
            return undefined;
        }
        return { kind: "relativePath" /* PluginSourceKind.RelativePath */, path: resolved };
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
            if (!isOptionalString(rawSource.path)) {
                logContext.logService.warn(`${logContext.logPrefix} Skipping plugin '${logContext.pluginName}': github source 'path' must be a string when provided`);
                return undefined;
            }
            return {
                kind: "github" /* PluginSourceKind.GitHub */,
                repo: rawSource.repo,
                ref: rawSource.ref,
                sha: rawSource.sha,
                path: rawSource.path,
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
                kind: "url" /* PluginSourceKind.GitUrl */,
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
                kind: "npm" /* PluginSourceKind.Npm */,
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
                kind: "pip" /* PluginSourceKind.Pip */,
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
function isOptionalString(value) {
    return value === undefined || typeof value === 'string';
}
function isOptionalGitSha(value) {
    return value === undefined || (typeof value === 'string' && /^[0-9a-fA-F]{40}$/.test(value));
}
function isValidGitHubRepo(repo) {
    return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo);
}
/**
 * Returns a human-readable label for a plugin source descriptor,
 * suitable for error messages and UI display.
 */
export function getPluginSourceLabel(descriptor) {
    switch (descriptor.kind) {
        case "relativePath" /* PluginSourceKind.RelativePath */:
            return descriptor.path || '.';
        case "github" /* PluginSourceKind.GitHub */:
            return descriptor.path ? `${descriptor.repo}/${descriptor.path}` : descriptor.repo;
        case "url" /* PluginSourceKind.GitUrl */:
            return descriptor.url;
        case "npm" /* PluginSourceKind.Npm */:
            return descriptor.version ? `${descriptor.package}@${descriptor.version}` : descriptor.package;
        case "pip" /* PluginSourceKind.Pip */:
            return descriptor.version ? `${descriptor.package}==${descriptor.version}` : descriptor.package;
    }
}
/**
 * Returns `true` when the marketplace source descriptor differs from the
 * installed one — meaning an update should be performed.
 */
export function hasSourceChanged(installed, marketplace) {
    if (installed.kind !== marketplace.kind) {
        return true;
    }
    switch (installed.kind) {
        case "github" /* PluginSourceKind.GitHub */:
            return installed.ref !== marketplace.ref
                || installed.sha !== marketplace.sha
                || installed.path !== marketplace.path;
        case "url" /* PluginSourceKind.GitUrl */:
            return installed.ref !== marketplace.ref
                || installed.sha !== marketplace.sha;
        case "npm" /* PluginSourceKind.Npm */:
            return installed.version !== marketplace.version;
        case "pip" /* PluginSourceKind.Pip */:
            return installed.version !== marketplace.version;
        default:
            return false;
    }
}
function getMarketplaceReadmeUri(repo, source) {
    const normalizedSource = source.trim().replace(/^\.?\/+|\/+$/g, '');
    const readmePath = normalizedSource ? `${normalizedSource}/README.md` : 'README.md';
    return URI.parse(`https://github.com/${repo}/blob/main/${readmePath}`);
}
function getMarketplaceReadmeFileUri(repoDir, source) {
    const normalizedSource = source.trim().replace(/^\.?\/+|\/+$/g, '');
    return normalizedSource ? joinPath(repoDir, normalizedSource, 'README.md') : joinPath(repoDir, 'README.md');
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGx1Z2luTWFya2V0cGxhY2VTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vcGx1Z2lucy9wbHVnaW5NYXJrZXRwbGFjZVNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFFeEUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzVELE9BQU8sRUFBRSxLQUFLLElBQUksVUFBVSxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDekUsT0FBTyxFQUFFLElBQUksRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzFELE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNyRSxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDbkUsT0FBTyxFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQWUsbUJBQW1CLEVBQUUsZUFBZSxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDL0gsT0FBTyxFQUFFLE9BQU8sRUFBRSxlQUFlLEVBQUUsUUFBUSxFQUFFLGFBQWEsRUFBRSxZQUFZLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUMxSCxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDeEQsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDdEcsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sMkRBQTJELENBQUM7QUFDaEcsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQzdFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUNoRyxPQUFPLEVBQUUsV0FB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U0FBa0MsRUFBRSxXQUFvQztJQUN4RyxJQUFJLFNBQVMsQ0FBQyxJQUFJLEtBQUssV0FBVyxDQUFDLElBQUksRUFBRSxDQUFDO1FBQ3pDLE9BQU8sSUFBSSxDQUFDO0lBQ2IsQ0FBQztJQUVELFFBQVEsU0FBUyxDQUFDLElBQUksRUFBRSxDQUFDO1FBQ3hCO1lBQ0MsT0FBTyxTQUFTLENBQUMsR0FBRyxLQUFNLFdBQWdDLENBQUMsR0FBRzttQkFDMUQsU0FBUyxDQUFDLEdBQUcsS0FBTSxXQUFnQyxDQUFDLEdBQUc7bUJBQ3ZELFNBQVMsQ0FBQyxJQUFJLEtBQU0sV0FBZ0MsQ0FBQyxJQUFJLENBQUM7UUFDL0Q7WUFDQyxPQUFPLFNBQVMsQ0FBQyxHQUFHLEtBQU0sV0FBZ0MsQ0FBQyxHQUFHO21CQUMxRCxTQUFTLENBQUMsR0FBRyxLQUFNLFdBQWdDLENBQUMsR0FBRyxDQUFDO1FBQzdEO1lBQ0MsT0FBTyxTQUFTLENBQUMsT0FBTyxLQUFNLFdBQWdDLENBQUMsT0FBTyxDQUFDO1FBQ3hFO1lBQ0MsT0FBTyxTQUFTLENBQUMsT0FBTyxLQUFNLFdBQWdDLENBQUMsT0FBTyxDQUFDO1FBQ3hFO1lBQ0MsT0FBTyxLQUFLLENBQUM7SUFDZixDQUFDO0FBQ0YsQ0FBQztBQUVELFNBQVMsdUJBQXVCLENBQUMsSUFBWSxFQUFFLE1BQWM7SUFDNUQsTUFBTSxnQkFBZ0IsR0FBRyxNQUFNLENBQUMsSUFBSSxFQUFFLENBQUMsT0FBTyxDQUFDLGVBQWUsRUFBRSxFQUFFLENBQUMsQ0FBQztJQUNwRSxNQUFNLFVBQVUsR0FBRyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUMsR0FBRyxnQkFBZ0IsWUFBWSxDQUFDLENBQUMsQ0FBQyxXQUFXLENBQUM7SUFDcEYsT0FBTyxHQUFHLENBQUMsS0FBSyxDQUFDLHNCQUFzQixJQUFJLGNBQWMsVUFBVSxFQUFFLENBQUMsQ0FBQztBQUN4RSxDQUFDO0FBRUQsU0FBUywyQkFBMkIsQ0FBQyxPQUFZLEVBQUUsTUFBYztJQUNoRSxNQUFNLGdCQUFnQixHQUFHLE1BQU0sQ0FBQyxJQUFJLEVBQUUsQ0FBQyxPQUFPLENBQUMsZUFBZSxFQUFFLEVBQUUsQ0FBQyxDQUFDO0lBQ3BFLE9BQU8sZ0JBQWdCLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxPQUFPLEVBQUUsV0FBVyxDQUFDLENBQUM7QUFDN0csQ0FBQyJ9