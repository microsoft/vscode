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
import { VSBuffer } from '../../../base/common/buffer.js';
import { SequencerByKey } from '../../../base/common/async.js';
import { URI } from '../../../base/common/uri.js';
import { IFileService } from '../../files/common/files.js';
import { ILogService } from '../../log/common/log.js';
import { toAgentClientUri } from '../common/agentClientUri.js';
const DEFAULT_MAX_PLUGINS = 20;
/**
 * Implementation of {@link IAgentPluginManager}.
 *
 * Syncs plugin directories to local storage under
 * `{userDataPath}/agentPlugins/{key}/`. Uses a {@link SequencerByKey}
 * per plugin URI so that concurrent syncs of the same plugin are
 * serialized and cannot clobber each other.
 *
 * The nonce cache and LRU order are persisted to a JSON file in the
 * base path so they survive process restarts.
 */
let AgentPluginManager = class AgentPluginManager {
    constructor(userDataPath, _fileService, _logService, maxPlugins = DEFAULT_MAX_PLUGINS) {
        this._fileService = _fileService;
        this._logService = _logService;
        /** Serializes concurrent sync operations per plugin URI. */
        this._sequencer = new SequencerByKey();
        /** Nonces for plugins on disk, keyed by original customization URI string. */
        this._cachedNonces = new Map();
        /** LRU order: most recently used original customization URI strings at the end. */
        this._lruOrder = [];
        /** Whether the on-disk cache has been loaded. */
        this._cacheLoaded = false;
        this._basePath = URI.joinPath(userDataPath, 'agentPlugins');
        this._cachePath = URI.joinPath(this._basePath, 'cache.json');
        this._maxPlugins = maxPlugins;
    }
    async syncCustomizations(clientId, customizations, progress) {
        await this._ensureCacheLoaded();
        // Build initial loading status and fire it immediately via progress
        const statuses = customizations.map(c => ({
            customization: c,
            enabled: true,
            status: "loading" /* CustomizationStatus.Loading */,
        }));
        progress?.([...statuses]);
        // Sync each customization in parallel, serialized per URI
        const results = await Promise.all(customizations.map((ref, i) => this._sequencer.queue(ref.uri, async () => {
            try {
                const pluginDir = await this._syncPlugin(clientId, ref);
                statuses[i] = { customization: ref, enabled: true, status: "loaded" /* CustomizationStatus.Loaded */ };
                progress?.([...statuses]);
                return { customization: statuses[i], pluginDir };
            }
            catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                this._logService.error(`[AgentPluginManager] Failed to sync plugin ${ref.uri}: ${message}`);
                statuses[i] = { customization: ref, enabled: true, status: "error" /* CustomizationStatus.Error */, statusMessage: message };
                progress?.([...statuses]);
                return { customization: statuses[i] };
            }
        })));
        return results;
    }
    // ---- plugin storage logic -----------------------------------------------
    /**
     * Syncs a single plugin to local storage. Skips the copy when the
     * nonce matches the cached value. Returns the local directory URI.
     */
    async _syncPlugin(clientId, ref) {
        const pluginUri = toAgentClientUri(URI.parse(ref.uri), clientId);
        const key = this._keyForUri(ref.uri);
        const destDir = URI.joinPath(this._basePath, key);
        // Nonce cache hit — skip copy
        if (ref.nonce && this._cachedNonces.get(ref.uri) === ref.nonce) {
            this._touchLru(ref.uri);
            this._logService.trace(`[AgentPluginManager] Nonce match for ${ref.uri}, skipping copy`);
            return destDir;
        }
        this._logService.info(`[AgentPluginManager] Syncing plugin: ${ref.uri} → ${destDir.toString()}`);
        await this._fileService.copy(pluginUri, destDir, true);
        if (ref.nonce) {
            this._cachedNonces.set(ref.uri, ref.nonce);
        }
        this._touchLru(ref.uri);
        await this._evictIfNeeded();
        await this._persistCache();
        return destDir;
    }
    _keyForUri(uri) {
        return uri.replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').substring(0, 128);
    }
    _touchLru(uri) {
        const idx = this._lruOrder.indexOf(uri);
        if (idx !== -1) {
            this._lruOrder.splice(idx, 1);
        }
        this._lruOrder.push(uri);
    }
    async _evictIfNeeded() {
        while (this._lruOrder.length > this._maxPlugins) {
            const evictUri = this._lruOrder.shift();
            if (!evictUri) {
                break;
            }
            this._cachedNonces.delete(evictUri);
            const evictKey = this._keyForUri(evictUri);
            const evictDir = URI.joinPath(this._basePath, evictKey);
            this._logService.info(`[AgentPluginManager] Evicting plugin: ${evictUri}`);
            try {
                await this._fileService.del(evictDir, { recursive: true });
            }
            catch (err) {
                this._logService.warn(`[AgentPluginManager] Failed to evict plugin: ${evictUri}`, err);
            }
        }
    }
    // ---- cache persistence --------------------------------------------------
    async _ensureCacheLoaded() {
        if (this._cacheLoaded) {
            return;
        }
        this._cacheLoaded = true;
        try {
            if (!await this._fileService.exists(this._cachePath)) {
                return;
            }
            const content = await this._fileService.readFile(this._cachePath);
            const entries = JSON.parse(content.value.toString());
            if (!Array.isArray(entries)) {
                return;
            }
            // Entries are stored in LRU order (oldest first)
            for (const entry of entries) {
                if (typeof entry.uri === 'string' && typeof entry.nonce === 'string') {
                    this._cachedNonces.set(entry.uri, entry.nonce);
                    this._lruOrder.push(entry.uri);
                }
            }
            this._logService.trace(`[AgentPluginManager] Loaded ${entries.length} cache entries from disk`);
        }
        catch (err) {
            this._logService.warn('[AgentPluginManager] Failed to load cache from disk', err);
        }
    }
    async _persistCache() {
        try {
            // Write entries in LRU order (oldest first)
            const entries = [];
            for (const uri of this._lruOrder) {
                const nonce = this._cachedNonces.get(uri);
                if (nonce) {
                    entries.push({ uri, nonce });
                }
            }
            await this._fileService.createFolder(this._basePath);
            await this._fileService.writeFile(this._cachePath, VSBuffer.fromString(JSON.stringify(entries)));
        }
        catch (err) {
            this._logService.warn('[AgentPluginManager] Failed to persist cache to disk', err);
        }
    }
};
AgentPluginManager = __decorate([
    __param(1, IFileService),
    __param(2, ILogService)
], AgentPluginManager);
export { AgentPluginManager };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWdlbnRQbHVnaW5NYW5hZ2VyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vYWdlbnRIb3N0L25vZGUvYWdlbnRQbHVnaW5NYW5hZ2VyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUMxRCxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDL0QsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBQ2xELE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUMzRCxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFHdEQsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFFL0QsTUFBTSxtQkFBbUIsR0FBRyxFQUFFLENBQUM7QUFRL0I7Ozs7Ozs7Ozs7R0FVRztBQUNJLElBQU0sa0JBQWtCLEdBQXhCLE1BQU0sa0JBQWtCO0lBbUI5QixZQUNDLFlBQWlCLEVBQ0gsWUFBMkMsRUFDNUMsV0FBeUMsRUFDdEQsYUFBcUIsbUJBQW1CO1FBRlQsaUJBQVksR0FBWixZQUFZLENBQWM7UUFDM0IsZ0JBQVcsR0FBWCxXQUFXLENBQWE7UUFmdkQsNERBQTREO1FBQzNDLGVBQVUsR0FBRyxJQUFJLGNBQWMsRUFBVSxDQUFDO1FBRTNELDhFQUE4RTtRQUM3RCxrQkFBYSxHQUFHLElBQUksR0FBRyxFQUFrQixDQUFDO1FBRTNELG1GQUFtRjtRQUNsRSxjQUFTLEdBQWEsRUFBRSxDQUFDO1FBRTFDLGlEQUFpRDtRQUN6QyxpQkFBWSxHQUFHLEtBQUssQ0FBQztRQVE1QixJQUFJLENBQUMsU0FBUyxHQUFHLEdBQUcsQ0FBQyxRQUFRLENBQUMsWUFBWSxF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