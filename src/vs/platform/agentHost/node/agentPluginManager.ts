/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../base/common/buffer.js';
import { SequencerByKey } from '../../../base/common/async.js';
import { URI } from '../../../base/common/uri.js';
import { FileOperationResult, IFileService, toFileOperationResult } from '../../files/common/files.js';
import { ILogService } from '../../log/common/log.js';
import { IAgentPluginManager, type ISyncedCustomization } from '../common/agentPluginManager.js';
import { CustomizationLoadStatus, type ClientPluginCustomization, type PluginCustomization } from '../common/state/sessionState.js';
import { toAgentClientUri } from '../common/agentClientUri.js';

/**
 * Cap on the total number of materialized plugin revisions kept on disk,
 * across all plugins. Bounds disk usage; the LRU decides which revisions
 * survive, so a plugin that is actively synced keeps more of its history
 * than one that has gone idle.
 */
const DEFAULT_MAX_PLUGIN_REVISIONS = 64;

/**
 * Revisions retained per plugin URI before older ones are evicted.
 *
 * A client's nonce is a hash of the bundle's contents, so it is not
 * monotonic: a customization set that changes and then changes back
 * produces a nonce that was already synced. Retaining only the current
 * revision turned every such cycle into a full re-copy of the bundle over
 * the agent host connection. Keeping a short history makes those cycles
 * cache hits instead.
 */
const MAX_REVISIONS_PER_PLUGIN = 8;

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
 * starts up and again after each fresh sync of the same plugin. Up to
 * {@link MAX_REVISIONS_PER_PLUGIN} revisions are retained so that a
 * customization set which cycles back to a previously synced state is a cache
 * hit rather than a full re-copy. If a stale nonce directory cannot be removed
 * (e.g. it is still locked), it is retained in the LRU and retried on a later
 * cleanup pass.
 *
 * The LRU (which records each plugin's URI and nonce) is persisted to a JSON
 * file in the base path so it survives process restarts.
 */
export class AgentPluginManager implements IAgentPluginManager {
	declare readonly _serviceBrand: undefined;

	private readonly _basePath: URI;
	private readonly _cachePath: URI;
	private readonly _maxRevisions: number;

	/** Serializes concurrent sync operations per plugin URI. */
	private readonly _sequencer = new SequencerByKey<string>();

	/**
	 * LRU of synced plugins, most recently used at the end. Each entry records
	 * the plugin's original customization URI and the nonce materialized on
	 * disk under `{key}/{nonce}`.
	 */
	private readonly _lru: ICacheEntry[] = [];

	private _cacheLoadPromise: Promise<void> | undefined;

	constructor(
		userDataPath: URI,
		@IFileService private readonly _fileService: IFileService,
		@ILogService private readonly _logService: ILogService,
		maxRevisions: number = DEFAULT_MAX_PLUGIN_REVISIONS,
	) {
		this._basePath = URI.joinPath(userDataPath, 'agentPlugins');
		this._cachePath = URI.joinPath(this._basePath, 'cache.json');
		this._maxRevisions = maxRevisions;
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
			// Persist the reordering: retention now keeps several revisions per
			// plugin, so an unpersisted touch would reload in the pre-hit order
			// and evict the revision that was most recently used.
			await this._persistCache();
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
			if (toFileOperationResult(err) === FileOperationResult.FILE_NOT_FOUND) {
				return true;
			}
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
	 * Attempts to evict revisions of {@link uri} beyond the most recent
	 * {@link MAX_REVISIONS_PER_PLUGIN}. Entries whose directory cannot be
	 * removed are left in the LRU so they can be retried later, once whatever
	 * was holding them has released them.
	 */
	private async _cleanupStaleNoncesFor(uri: string): Promise<void> {
		const entries = this._lru.filter(entry => entry.uri === uri);
		// `entries` preserves LRU order; the tail holds the revisions we keep.
		const stale = entries.slice(0, -MAX_REVISIONS_PER_PLUGIN);
		for (const entry of stale) {
			this._logService.info(`[AgentPluginManager] Evicting stale nonce ${entry.nonce || 'default'} for plugin: ${uri}`);
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
		while (this._lru.length > this._maxRevisions && i < this._lru.length) {
			const candidate = this._lru[i];
			this._logService.info(`[AgentPluginManager] Evicting revision ${candidate.nonce || 'default'} of plugin: ${candidate.uri}`);
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

	private _ensureCacheLoaded(): Promise<void> {
		this._cacheLoadPromise ??= this._loadCache();
		return this._cacheLoadPromise;
	}

	private async _loadCache(): Promise<void> {
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

		await this._pruneMissingEntries();
		await this._cleanupStaleNonces();
		await this._persistCache();
	}

	/**
	 * Drops entries whose directory is gone (deleted out from under us, or a
	 * copy that never completed). Such an entry can never produce a cache hit,
	 * so leaving it in place would waste a per-plugin retention slot and a slot
	 * against the global cap.
	 */
	private async _pruneMissingEntries(): Promise<void> {
		const present = await Promise.all(this._lru.map(async entry => {
			try {
				await this._fileService.stat(this._dirFor(entry.uri, entry.nonce));
				return true;
			} catch (err) {
				// Only a confirmed absence justifies dropping the entry.
				// `exists()` reports false for transient I/O and permission
				// failures too, which would evict a still-valid revision and
				// force a full re-copy of the bundle later.
				return toFileOperationResult(err) !== FileOperationResult.FILE_NOT_FOUND;
			}
		}));
		for (let i = this._lru.length - 1; i >= 0; i--) {
			if (!present[i]) {
				this._logService.trace(`[AgentPluginManager] Dropping cache entry with no directory: ${this._lru[i].uri}`);
				this._lru.splice(i, 1);
			}
		}
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
