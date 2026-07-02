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
import { CustomizationLoadStatus, type ClientPluginCustomization, type PluginCustomization } from '../common/state/sessionState.js';
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
 * `{userDataPath}/agentPlugins/{key}/{nonce}/`. Materializing each nonce in
 * its own subdirectory means a new revision is copied into a fresh directory
 * rather than overwriting (and deleting) the previous one. This both avoids
 * `EBUSY` failures when the in-use copy is still locked and allows multiple
 * revisions of the same plugin to coexist — e.g. a long-running session may
 * still reference an older nonce that we cannot delete yet. Uses a
 * {@link SequencerByKey} per plugin URI so that concurrent syncs of the same
 * plugin are serialized and cannot clobber each other.
 *
 * Older nonces of a plugin are evicted opportunistically: when the manager
 * starts up and again after each fresh sync of the same plugin. If a stale
 * nonce directory cannot be removed (e.g. it is still locked), it is retained
 * in the LRU and retried on a later cleanup pass.
 *
 * The LRU (which records each plugin's URI and nonce) is persisted to a JSON
 * file in the base path so it survives process restarts.
 */
export class AgentPluginManager implements IAgentPluginManager {
	declare readonly _serviceBrand: undefined;

	private readonly _basePath: URI;
	private readonly _cachePath: URI;
	private readonly _maxPlugins: number;

	/** Serializes concurrent sync operations per plugin URI. */
	private readonly _sequencer = new SequencerByKey<string>();

	/**
	 * LRU of synced plugins, most recently used at the end. Each entry records
	 * the plugin's original customization URI and the nonce materialized on
	 * disk under `{key}/{nonce}`.
	 */
	private readonly _lru: ICacheEntry[] = [];

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

	get basePath(): URI {
		return this._basePath;
	}

	async syncCustomizations(
		clientId: string,
		customizations: ClientPluginCustomization[],
		progress?: (status: PluginCustomization) => void,
	): Promise<ISyncedCustomization[]> {
		await this._ensureCacheLoaded();

		// Sync each customization in parallel, serialized per URI
		const results = await Promise.all(customizations.map(ref =>
			this._sequencer.queue(ref.uri, async (): Promise<ISyncedCustomization> => {
				try {
					const pluginDir = await this._syncPlugin(clientId, ref);
					const customization: PluginCustomization = { ...ref, load: { kind: CustomizationLoadStatus.Loaded } };
					progress?.(customization);
					return { customization, pluginDir };
				} catch (err) {
					const message = err instanceof Error ? err.message : String(err);
					this._logService.error(`[AgentPluginManager] Failed to sync plugin ${ref.uri}: ${message}`);
					const customization: PluginCustomization = { ...ref, load: { kind: CustomizationLoadStatus.Error, message } };
					progress?.(customization);
					return { customization };
				}
			})
		));

		return results;
	}

	// ---- plugin storage logic -----------------------------------------------

	/**
	 * Syncs a single plugin to local storage. Each nonce is materialized in its
	 * own `{key}/{nonce}` subdirectory; when the same nonce is already present
	 * the copy is skipped. After a fresh copy, older nonces of the same plugin
	 * are evicted on a best-effort basis (retained in the LRU if still locked).
	 * Returns the local directory URI.
	 */
	private async _syncPlugin(clientId: string, ref: ClientPluginCustomization): Promise<URI> {
		const pluginUri = toAgentClientUri(URI.parse(ref.uri), clientId);
		const destDir = this._dirFor(ref.uri, ref.nonce);

		// Nonce cache hit — the plugin is already materialized under the nonce
		// subdirectory, so skip the copy.
		if (ref.nonce && this._findEntry(ref.uri, ref.nonce) && await this._fileService.exists(destDir)) {
			this._touchLru(ref.uri, ref.nonce);
			this._logService.trace(`[AgentPluginManager] Nonce match for ${ref.uri}, skipping copy`);
			return destDir;
		}

		this._logService.info(`[AgentPluginManager] Syncing plugin: ${ref.uri} → ${destDir.toString()}`);

		await this._fileService.copy(pluginUri, destDir, true);

		this._removeEntry(ref.uri, ref.nonce);
		this._lru.push({ uri: ref.uri, nonce: ref.nonce ?? '' });

		// Try to clean up superseded nonces of this plugin; undeletable ones stay
		// in the LRU for a later attempt.
		await this._cleanupStaleNoncesFor(ref.uri);
		await this._evictIfNeeded();
		await this._persistCache();

		return destDir;
	}

	private _keyForUri(uri: string): string {
		return this._sanitize(uri);
	}

	private _keyForNonce(nonce: string | undefined): string {
		return (nonce && this._sanitize(nonce)) || 'default';
	}

	private _sanitize(value: string): string {
		return value.replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').substring(0, 128);
	}

	/** Directory in which a specific `(uri, nonce)` revision is materialized. */
	private _dirFor(uri: string, nonce: string | undefined): URI {
		return URI.joinPath(this._basePath, this._keyForUri(uri), this._keyForNonce(nonce));
	}

	/** Parent directory holding all materialized nonces of a plugin. */
	private _pluginRootFor(uri: string): URI {
		return URI.joinPath(this._basePath, this._keyForUri(uri));
	}

	private _findEntry(uri: string, nonce: string | undefined): ICacheEntry | undefined {
		const n = nonce ?? '';
		return this._lru.find(entry => entry.uri === uri && entry.nonce === n);
	}

	private _removeEntry(uri: string, nonce: string | undefined): void {
		const entry = this._findEntry(uri, nonce);
		if (entry) {
			this._removeEntryRef(entry);
		}
	}

	private _removeEntryRef(entry: ICacheEntry): void {
		const idx = this._lru.indexOf(entry);
		if (idx !== -1) {
			this._lru.splice(idx, 1);
		}
	}

	private _touchLru(uri: string, nonce: string | undefined): void {
		const entry = this._findEntry(uri, nonce);
		if (entry) {
			this._removeEntryRef(entry);
			this._lru.push(entry);
		}
	}

	/** Best-effort recursive delete; returns `true` only when the dir is gone. */
	private async _tryDeleteDir(dir: URI): Promise<boolean> {
		try {
			await this._fileService.del(dir, { recursive: true });
			return true;
		} catch (err) {
			this._logService.warn(`[AgentPluginManager] Failed to remove plugin dir ${dir.toString()}`, err);
			return false;
		}
	}

	/** Attempts to evict older nonces of every tracked plugin. */
	private async _cleanupStaleNonces(): Promise<void> {
		for (const uri of new Set(this._lru.map(entry => entry.uri))) {
			await this._cleanupStaleNoncesFor(uri);
		}
	}

	/**
	 * Attempts to evict every nonce of {@link uri} except the most recently used
	 * one. Entries whose directory cannot be removed are left in the LRU so they
	 * can be retried later, once whatever was holding them has released them.
	 */
	private async _cleanupStaleNoncesFor(uri: string): Promise<void> {
		const entries = this._lru.filter(entry => entry.uri === uri);
		// `entries` preserves LRU order; the last is the current revision.
		const stale = entries.slice(0, -1);
		for (const entry of stale) {
			this._logService.info(`[AgentPluginManager] Evicting stale nonce for plugin: ${uri}`);
			if (await this._tryDeleteDir(this._dirFor(entry.uri, entry.nonce))) {
				this._removeEntryRef(entry);
			}
		}
	}

	private async _evictIfNeeded(): Promise<void> {
		// Pop from the head until we're at-or-below the cap. Entries whose
		// directory can't be deleted (still locked by a running session)
		// are kept in the LRU so they can be retried on a later eviction
		// pass; the cap may be exceeded temporarily in that case.
		let i = 0;
		while (this._lru.length > this._maxPlugins && i < this._lru.length) {
			const candidate = this._lru[i];
			this._logService.info(`[AgentPluginManager] Evicting plugin: ${candidate.uri}`);
			if (await this._tryDeleteDir(this._dirFor(candidate.uri, candidate.nonce))) {
				this._lru.splice(i, 1);
				if (!this._lru.some(entry => entry.uri === candidate.uri)) {
					await this._tryDeleteDir(this._pluginRootFor(candidate.uri));
				}
			} else {
				// Locked — keep it in the LRU and try the next candidate.
				i++;
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
					this._lru.push({ uri: entry.uri, nonce: entry.nonce });
				}
			}
			this._logService.trace(`[AgentPluginManager] Loaded ${entries.length} cache entries from disk`);
		} catch (err) {
			this._logService.warn('[AgentPluginManager] Failed to load cache from disk', err);
		}

		await this._cleanupStaleNonces();
		await this._persistCache();
	}

	private async _persistCache(): Promise<void> {
		try {
			// Write entries in LRU order (oldest first)
			const entries: ICacheEntry[] = this._lru.map(entry => ({ uri: entry.uri, nonce: entry.nonce }));
			await this._fileService.createFolder(this._basePath);
			await this._fileService.writeFile(this._cachePath, VSBuffer.fromString(JSON.stringify(entries)));
		} catch (err) {
			this._logService.warn('[AgentPluginManager] Failed to persist cache to disk', err);
		}
	}
}
