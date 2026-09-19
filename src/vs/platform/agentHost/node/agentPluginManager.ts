/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../base/common/buffer.js';
import { Sequencer, SequencerByKey } from '../../../base/common/async.js';
import { Disposable, type IDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { FileOperationResult, IFileService, toFileOperationResult } from '../../files/common/files.js';
import { ILogService } from '../../log/common/log.js';
import { IAgentPluginManager, type ISyncedCustomization } from '../common/agentPluginManager.js';
import { CustomizationLoadStatus, type ClientPluginCustomization, type PluginCustomization } from '../common/state/sessionState.js';
import { toAgentClientUri } from '../common/agentClientUri.js';
import { isPidAlive } from './agentHostLockfile.js';

/**
 * Cap on unleased materialized plugin revisions retained by one Agent Host.
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

interface ICacheEntry {
	readonly uri: string;
	readonly nonce: string;
	references: number;
}

interface IRuntimeOwner {
	readonly pid: number;
	readonly instanceId: string;
}

/**
 * Implementation of {@link IAgentPluginManager}.
 *
 * Syncs plugin directories to local storage under
 * `{userDataPath}/agentPlugins/runtimes/{runtime}/{key}/{nonce}/`. Each Agent
 * Host owns a separate runtime directory, so another live host sharing the
 * same user data path cannot invalidate its plugin paths. Materializing each nonce in
 * its own subdirectory means a new revision is copied into a fresh directory
 * rather than overwriting (and deleting) the previous one. This both avoids
 * `EBUSY` failures when the in-use copy is still locked and allows multiple
 * revisions of the same plugin to coexist — e.g. a long-running session may
 * still reference an older nonce that we cannot delete yet. Uses a
 * {@link SequencerByKey} per plugin URI so that concurrent syncs of the same
 * plugin are serialized and cannot clobber each other.
 *
 * Older unleased nonces are evicted after synchronization and lease release.
 * Leased revisions may temporarily exceed the limits until their owning
 * sessions end. Up to {@link MAX_REVISIONS_PER_PLUGIN} unleased revisions are
 * retained so a customization set which cycles back to a recent state remains
 * a cache hit.
 *
 * Crashed runtimes are removed when a later manager observes that their owner
 * process is no longer alive.
 */
export class AgentPluginManager extends Disposable implements IAgentPluginManager {
	declare readonly _serviceBrand: undefined;

	private readonly _storagePath: URI;
	private readonly _runtimesPath: URI;
	private readonly _basePath: URI;
	private readonly _ownerPath: URI;
	private readonly _maxRevisions: number;
	private readonly _instanceId = generateUuid();

	/** Serializes concurrent sync operations per plugin URI. */
	private readonly _sequencer = new SequencerByKey<string>();
	private readonly _cacheSequencer = new Sequencer();

	/**
	 * LRU of synced plugins, most recently used at the end. Each entry records
	 * the plugin's original customization URI and the nonce materialized on
	 * disk under `{key}/{nonce}`.
	 */
	private readonly _lru: ICacheEntry[] = [];

	private _initializationPromise: Promise<void> | undefined;
	private _isDisposed = false;

	constructor(
		userDataPath: URI,
		@IFileService private readonly _fileService: IFileService,
		@ILogService private readonly _logService: ILogService,
		maxRevisions: number = DEFAULT_MAX_PLUGIN_REVISIONS,
	) {
		super();
		this._storagePath = URI.joinPath(userDataPath, 'agentPlugins');
		this._runtimesPath = URI.joinPath(this._storagePath, 'runtimes');
		this._basePath = URI.joinPath(this._runtimesPath, `${process.pid}-${this._instanceId}`);
		this._ownerPath = URI.joinPath(this._basePath, 'owner.json');
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
		await this._ensureInitialized();

		// Sync each customization in parallel, serialized per URI
		const results = await Promise.all(customizations.map(ref =>
			this._sequencer.queue(ref.uri, async (): Promise<ISyncedCustomization> => {
				try {
					const synced = await this._syncPlugin(clientId, ref);
					const customization: PluginCustomization = { ...ref, load: { kind: CustomizationLoadStatus.Loaded } };
					try {
						progress?.(customization);
					} catch (error) {
						synced.lease.dispose();
						throw error;
					}
					return { customization, ...synced };
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
	 * the copy is skipped. Returns the local directory URI.
	 */
	private async _syncPlugin(clientId: string, ref: ClientPluginCustomization): Promise<{ pluginDir: URI; lease: IDisposable }> {
		const pluginUri = toAgentClientUri(URI.parse(ref.uri), clientId);
		const revision = ref.nonce ?? generateUuid();
		const destDir = this._dirFor(ref.uri, revision);

		// Nonce cache hit — the plugin is already materialized under the nonce
		// subdirectory, so skip the copy.
		if (ref.nonce) {
			const cached = await this._cacheSequencer.queue(async () => {
				const entry = this._findEntry(ref.uri, revision);
				if (!entry || !await this._fileService.exists(destDir)) {
					return undefined;
				}
				entry.references++;
				this._touchLru(entry);
				return { pluginDir: destDir, lease: this._createLease(entry) };
			});
			if (cached) {
				this._logService.trace(`[AgentPluginManager] Nonce match for ${ref.uri}, skipping copy`);
				return cached;
			}
		}

		this._logService.info(`[AgentPluginManager] Syncing plugin: ${ref.uri} → ${destDir.toString()}`);

		await this._fileService.copy(pluginUri, destDir, true);

		return this._cacheSequencer.queue(async () => {
			let entry = this._findEntry(ref.uri, revision);
			if (entry) {
				entry.references++;
				this._touchLru(entry);
			} else {
				entry = { uri: ref.uri, nonce: revision, references: 1 };
				this._lru.push(entry);
			}
			await this._cleanupStaleNoncesFor(ref.uri);
			await this._evictIfNeeded();
			return { pluginDir: destDir, lease: this._createLease(entry) };
		});
	}

	private _createLease(entry: ICacheEntry): IDisposable {
		return toDisposable(() => {
			void this._cacheSequencer.queue(async () => {
				entry.references--;
				if (this._isDisposed) {
					return;
				}
				await this._cleanupStaleNoncesFor(entry.uri);
				await this._evictIfNeeded();
			});
		});
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

	private _removeEntryRef(entry: ICacheEntry): void {
		const idx = this._lru.indexOf(entry);
		if (idx !== -1) {
			this._lru.splice(idx, 1);
		}
	}

	private _touchLru(entry: ICacheEntry): void {
		this._removeEntryRef(entry);
		this._lru.push(entry);
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

	/**
	 * Attempts to evict revisions of {@link uri} beyond the most recent
	 * {@link MAX_REVISIONS_PER_PLUGIN}. Entries whose directory cannot be
	 * removed are left in the LRU so they can be retried later, once whatever
	 * was holding them has released them.
	 */
	private async _cleanupStaleNoncesFor(uri: string): Promise<void> {
		const entries = this._lru.filter(entry => entry.uri === uri);
		let excess = entries.length - MAX_REVISIONS_PER_PLUGIN;
		for (const entry of entries) {
			if (excess <= 0) {
				break;
			}
			if (entry.references > 0) {
				continue;
			}
			this._logService.info(`[AgentPluginManager] Evicting stale nonce ${entry.nonce || 'default'} for plugin: ${uri}`);
			if (await this._tryDeleteDir(this._dirFor(entry.uri, entry.nonce))) {
				this._removeEntryRef(entry);
				excess--;
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
			if (candidate.references > 0) {
				i++;
				continue;
			}
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

	private _ensureInitialized(): Promise<void> {
		this._initializationPromise ??= this._initialize();
		return this._initializationPromise;
	}

	private async _initialize(): Promise<void> {
		await this._fileService.createFolder(this._basePath);
		const owner: IRuntimeOwner = { pid: process.pid, instanceId: this._instanceId };
		await this._fileService.writeFile(this._ownerPath, VSBuffer.fromString(JSON.stringify(owner)));
		await this._cleanupStaleRuntimes();
	}

	private async _cleanupStaleRuntimes(): Promise<void> {
		let runtimes;
		try {
			runtimes = await this._fileService.resolve(this._runtimesPath);
		} catch {
			return;
		}
		for (const runtime of runtimes.children ?? []) {
			if (!runtime.isDirectory || runtime.resource.toString() === this._basePath.toString()) {
				continue;
			}
			try {
				const content = await this._fileService.readFile(URI.joinPath(runtime.resource, 'owner.json'));
				const owner = JSON.parse(content.value.toString()) as Partial<IRuntimeOwner>;
				if (typeof owner.pid === 'number' && Number.isSafeInteger(owner.pid) && !isPidAlive(owner.pid)) {
					await this._tryDeleteDir(runtime.resource);
				}
			} catch {
				// An incomplete or unreadable owner is retained conservatively.
			}
		}
	}

	override dispose(): void {
		this._isDisposed = true;
		void this._cacheSequencer.queue(() => this._tryDeleteDir(this._basePath));
		super.dispose();
	}
}
