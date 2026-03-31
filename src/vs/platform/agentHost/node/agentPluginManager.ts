/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../base/common/buffer.js';
import { SequencerByKey } from '../../../base/common/async.js';
import { URI } from '../../../base/common/uri.js';
import { IFileService } from '../../files/common/files.js';
import { ILogService } from '../../log/common/log.js';
import { IAgentPluginManager, type ISyncedCustomization } from '../common/agentPluginManager.js';
import { CustomizationStatus, type ICustomizationRef, type ISessionCustomization } from '../common/state/sessionState.js';
import { toAgentClientUri } from '../common/agentClientUri.js';

const DEFAULT_MAX_PLUGINS = 20;

/** On-disk cache entry format. */
interface ICacheEntry {
	readonly uri: string;
	readonly nonce: string;
}

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
export class AgentPluginManager implements IAgentPluginManager {
	declare readonly _serviceBrand: undefined;

	private readonly _basePath: URI;
	private readonly _cachePath: URI;
	private readonly _maxPlugins: number;

	/** Serializes concurrent sync operations per plugin URI. */
	private readonly _sequencer = new SequencerByKey<string>();

	/** Nonces for plugins on disk, keyed by original customization URI string. */
	private readonly _cachedNonces = new Map<string, string>();

	/** LRU order: most recently used original customization URI strings at the end. */
	private readonly _lruOrder: string[] = [];

	/** Whether the on-disk cache has been loaded. */
	private _cacheLoaded = false;

	constructor(
		userDataPath: URI,
		@IFileService private readonly _fileService: IFileService,
		@ILogService private readonly _logService: ILogService,
		maxPlugins: number = DEFAULT_MAX_PLUGINS,
	) {
		this._basePath = URI.joinPath(userDataPath, 'agentPlugins');
		this._cachePath = URI.joinPath(this._basePath, 'cache.json');
		this._maxPlugins = maxPlugins;
	}

	async syncCustomizations(
		clientId: string,
		customizations: ICustomizationRef[],
		progress?: (status: ISessionCustomization[]) => void,
	): Promise<ISyncedCustomization[]> {
		await this._ensureCacheLoaded();

		// Build initial loading status and fire it immediately via progress
		const statuses: ISessionCustomization[] = customizations.map(c => ({
			customization: c,
			enabled: true,
			status: CustomizationStatus.Loading,
		}));
		progress?.([...statuses]);

		// Sync each customization in parallel, serialized per URI
		const results = await Promise.all(customizations.map((ref, i) =>
			this._sequencer.queue(ref.uri, async (): Promise<ISyncedCustomization> => {
				try {
					const pluginDir = await this._syncPlugin(clientId, ref);
					statuses[i] = { customization: ref, enabled: true, status: CustomizationStatus.Loaded };
					progress?.([...statuses]);
					return { customization: statuses[i], pluginDir };
				} catch (err) {
					const message = err instanceof Error ? err.message : String(err);
					this._logService.error(`[AgentPluginManager] Failed to sync plugin ${ref.uri}: ${message}`);
					statuses[i] = { customization: ref, enabled: true, status: CustomizationStatus.Error, statusMessage: message };
					progress?.([...statuses]);
					return { customization: statuses[i] };
				}
			})
		));

		return results;
	}

	// ---- plugin storage logic -----------------------------------------------

	/**
	 * Syncs a single plugin to local storage. Skips the copy when the
	 * nonce matches the cached value. Returns the local directory URI.
	 */
	private async _syncPlugin(clientId: string, ref: ICustomizationRef): Promise<URI> {
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

	private _keyForUri(uri: string): string {
		return uri.replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').substring(0, 128);
	}

	private _touchLru(uri: string): void {
		const idx = this._lruOrder.indexOf(uri);
		if (idx !== -1) {
			this._lruOrder.splice(idx, 1);
		}
		this._lruOrder.push(uri);
	}

	private async _evictIfNeeded(): Promise<void> {
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
			} catch (err) {
				this._logService.warn(`[AgentPluginManager] Failed to evict plugin: ${evictUri}`, err);
			}
		}
	}

	// ---- cache persistence --------------------------------------------------

	private async _ensureCacheLoaded(): Promise<void> {
		if (this._cacheLoaded) {
			return;
		}
		this._cacheLoaded = true;

		try {
			if (!await this._fileService.exists(this._cachePath)) {
				return;
			}
			const content = await this._fileService.readFile(this._cachePath);
			const entries: ICacheEntry[] = JSON.parse(content.value.toString());
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
		} catch (err) {
			this._logService.warn('[AgentPluginManager] Failed to load cache from disk', err);
		}
	}

	private async _persistCache(): Promise<void> {
		try {
			// Write entries in LRU order (oldest first)
			const entries: ICacheEntry[] = [];
			for (const uri of this._lruOrder) {
				const nonce = this._cachedNonces.get(uri);
				if (nonce) {
					entries.push({ uri, nonce });
				}
			}
			await this._fileService.createFolder(this._basePath);
			await this._fileService.writeFile(this._cachePath, VSBuffer.fromString(JSON.stringify(entries)));
		} catch (err) {
			this._logService.warn('[AgentPluginManager] Failed to persist cache to disk', err);
		}
	}
}
