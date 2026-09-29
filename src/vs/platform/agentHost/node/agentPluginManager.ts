/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createHash, randomUUID } from 'crypto';
import { VSBuffer } from '../../../base/common/buffer.js';
import { Sequencer, SequencerByKey } from '../../../base/common/async.js';
import { URI } from '../../../base/common/uri.js';
import { FileOperationResult, IFileService, toFileOperationResult } from '../../files/common/files.js';
import { ILogService } from '../../log/common/log.js';
import { IAgentPluginManager, type ICustomizationCaptureLease, type ISyncedCustomization } from '../common/agentPluginManager.js';
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
	readonly dir?: string;
	readonly capturedUri?: string;
	readonly holders?: Set<string>;
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
	private readonly _cacheMutationSequencer = new Sequencer();

	/**
	 * LRU of synced plugins, most recently used at the end. Each entry records
	 * the plugin's original customization URI and the nonce materialized on
	 * disk under `{key}/{nonce}`.
	 */
	private readonly _lru: ICacheEntry[] = [];
	private readonly _captureLeases = new Map<string, number>();
	private readonly _capturedDirs = new Set<string>();

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

	async captureCustomizations(clientId: string, customizations: ClientPluginCustomization[]): Promise<ICustomizationCaptureLease> {
		await this._ensureCacheLoaded();

		const captures: PluginCustomization[] = [];
		const leasedUris: string[] = [];
		try {
			for (const ref of customizations) {
				const revision = ref.nonce ?? randomUUID();
				const capturedUri = this._captureDirFor(ref.uri, revision).toString();
				this._addCaptureLease(capturedUri);
				let customization: PluginCustomization;
				try {
					customization = await this._sequencer.queue(this._captureKeyFor(ref.uri, revision), async () => {
						return this._capturePlugin(clientId, ref, revision);
					});
				} catch (err) {
					this._releaseCaptureLease(capturedUri);
					throw err;
				}
				captures.push(customization);
				leasedUris.push(customization.uri);
			}
		} catch (err) {
			for (const uri of leasedUris) {
				this._releaseCaptureLease(uri);
			}
			throw err;
		}

		let disposed = false;
		return {
			customizations: captures,
			dispose: () => {
				if (disposed) {
					return;
				}
				disposed = true;
				for (const uri of leasedUris) {
					this._releaseCaptureLease(uri);
				}
			},
		};
	}

	async retainCustomizationHolders(holders: ReadonlyMap<string, readonly PluginCustomization[]>): Promise<void> {
		const capturedHolders = this._captureHolderUris(holders);
		try {
			await this._cacheMutationSequencer.queue(async () => {
				await this._ensureCacheLoaded();
				const entries = this._cloneEntries();
				for (const [holder, uris] of capturedHolders) {
					for (const uri of uris) {
						this._entryForCapturedUri(entries, uri).holders?.add(holder);
					}
				}
				await this._commitCache(entries, true);
			});
		} finally {
			this._releaseCaptureHolderLeases(capturedHolders);
		}
	}

	async reconcileCustomizationHolders(holderPrefix: string, holders: ReadonlyMap<string, readonly PluginCustomization[]>): Promise<void> {
		this._validateHolderPrefix(holderPrefix, holders);
		const capturedHolders = this._captureHolderUris(holders);
		try {
			await this._cacheMutationSequencer.queue(async () => {
				await this._ensureCacheLoaded();
				const entries = this._cloneEntries();
				for (const entry of entries) {
					for (const holder of entry.holders ?? []) {
						if (holder.startsWith(holderPrefix)) {
							entry.holders?.delete(holder);
						}
					}
				}
				for (const [holder, uris] of capturedHolders) {
					for (const uri of uris) {
						this._entryForCapturedUri(entries, uri).holders?.add(holder);
					}
				}
				await this._commitCache(entries, true);
			});
		} finally {
			this._releaseCaptureHolderLeases(capturedHolders);
		}
	}

	getCapturedPluginDir(capturedUri: string): URI | undefined {
		return this._capturedDirs.has(capturedUri) ? URI.parse(capturedUri) : undefined;
	}

	private _captureHolderUris(holders: ReadonlyMap<string, readonly PluginCustomization[]>): Map<string, Set<string>> {
		const capturedHolders = new Map<string, Set<string>>();
		for (const [holder, customizations] of holders) {
			const uris = new Set(customizations.map(customization => customization.uri).filter(uri => this._isCapturedUri(uri)));
			if (uris.size === 0) {
				continue;
			}
			capturedHolders.set(holder, uris);
			for (const uri of uris) {
				this._capturedDirs.add(uri);
				this._addCaptureLease(uri);
			}
		}
		return capturedHolders;
	}

	private _validateHolderPrefix(holderPrefix: string, holders: ReadonlyMap<string, readonly PluginCustomization[]>): void {
		for (const holder of holders.keys()) {
			if (!holder.startsWith(holderPrefix)) {
				throw new Error(`Customization holder '${holder}' does not belong to '${holderPrefix}'`);
			}
		}
	}

	private _releaseCaptureHolderLeases(holders: ReadonlyMap<string, ReadonlySet<string>>): void {
		for (const uris of holders.values()) {
			for (const uri of uris) {
				this._releaseCaptureLease(uri);
			}
		}
	}

	private _cloneEntries(): ICacheEntry[] {
		return this._lru.map(entry => ({
			uri: entry.uri,
			nonce: entry.nonce,
			dir: entry.dir,
			capturedUri: entry.capturedUri,
			holders: new Set(entry.holders),
		}));
	}

	private _entryForCapturedUri(entries: ICacheEntry[], capturedUri: string): ICacheEntry {
		let entry = entries.find(entry => entry.capturedUri === capturedUri);
		if (!entry) {
			entry = { uri: capturedUri, nonce: capturedUri, dir: capturedUri, capturedUri, holders: new Set() };
			entries.push(entry);
		}
		return entry;
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
			this._logService.trace(`[AgentPluginManager] Nonce match for ${ref.uri}, skipping copy`);
			await this._cacheMutationSequencer.queue(async () => {
				this._touchLru(ref.uri, ref.nonce);
				await this._persistCache();
			});
			return destDir;
		}

		this._logService.info(`[AgentPluginManager] Syncing plugin: ${ref.uri} → ${destDir.toString()}`);

		await this._fileService.copy(pluginUri, destDir, true);

		await this._cacheMutationSequencer.queue(async () => {
			const holders = this._removeEntry(ref.uri, ref.nonce);
			this._lru.push({ uri: ref.uri, nonce: ref.nonce ?? '', holders });
			await this._cleanupStaleNoncesFor(ref.uri);
			await this._evictIfNeeded();
			await this._persistCache();
		});

		return destDir;
	}

	private async _capturePlugin(clientId: string, ref: ClientPluginCustomization, revision: string): Promise<PluginCustomization> {
		const capturedDir = this._captureDirFor(ref.uri, revision);
		const capturedUri = capturedDir.toString();
		let cacheHit = false;
		await this._cacheMutationSequencer.queue(async () => {
			const existing = this._findCaptureEntry(capturedUri);
			if (existing && await this._fileService.exists(capturedDir)) {
				this._touchEntry(existing);
				await this._persistCache(this._lru, true);
				cacheHit = true;
			}
		});
		if (!cacheHit) {
			const pluginUri = toAgentClientUri(URI.parse(ref.uri), clientId);
			if (await this._fileService.exists(capturedDir)) {
				await this._cacheMutationSequencer.queue(async () => {
					if (!this._findCaptureEntry(capturedUri)) {
						this._lru.push({ uri: ref.uri, nonce: revision, dir: capturedUri, capturedUri });
					}
					await this._persistCache(this._lru, true);
				});
			} else {
				this._logService.info(`[AgentPluginManager] Capturing plugin: ${ref.uri} → ${capturedUri}`);
				const stagingDir = URI.joinPath(this._basePath, 'automation', '.staging', randomUUID());
				try {
					await this._fileService.copy(pluginUri, stagingDir, true);
					await this._fileService.move(stagingDir, capturedDir, false);
				} catch (err) {
					await this._tryDeleteDir(stagingDir);
					throw err;
				}
				await this._cacheMutationSequencer.queue(async () => {
					const staleEntry = this._findCaptureEntry(capturedUri);
					const holders = staleEntry?.holders;
					if (staleEntry) {
						this._removeDeletedEntry(staleEntry);
					}
					this._lru.push({ uri: ref.uri, nonce: revision, dir: capturedUri, capturedUri, holders });
					await this._cleanupStaleNonces();
					await this._evictIfNeeded();
					await this._persistCache(this._lru, true);
				});
			}
		}

		this._capturedDirs.add(capturedUri);
		const customization = { ...ref, uri: capturedUri };
		delete customization.clientId;
		delete customization.nonce;
		delete customization.childEnablement;
		delete customization._meta;
		delete customization.children;
		delete customization.load;
		return customization;
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

	private _captureKeyFor(uri: string, revision: string): string {
		return `${uri}\n${revision}`;
	}

	private _captureDirFor(uri: string, revision: string): URI {
		return URI.joinPath(
			this._basePath,
			'automation',
			this._hashForPath(uri),
			this._hashForPath(revision),
		);
	}

	private _hashForPath(value: string): string {
		return createHash('sha256').update(value).digest('hex');
	}

	private _isCapturedUri(uri: string): boolean {
		const parsed = URI.parse(uri);
		return parsed.scheme === this._basePath.scheme
			&& parsed.authority === this._basePath.authority
			&& parsed.path.startsWith(`${this._basePath.path}/automation/`);
	}

	private _findEntry(uri: string, nonce: string | undefined): ICacheEntry | undefined {
		const n = nonce ?? '';
		return this._lru.find(entry => !entry.dir && entry.uri === uri && entry.nonce === n);
	}

	private _findCaptureEntry(capturedUri: string): ICacheEntry | undefined {
		return this._lru.find(entry => entry.capturedUri === capturedUri);
	}

	private _removeEntry(uri: string, nonce: string | undefined): Set<string> | undefined {
		const entry = this._findEntry(uri, nonce);
		if (entry) {
			this._removeEntryRef(entry);
			return entry.holders;
		}
		return undefined;
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
			this._touchEntry(entry);
		}
	}

	private _touchEntry(entry: ICacheEntry): void {
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
			if (this._isRetained(entry)) {
				continue;
			}
			this._logService.info(`[AgentPluginManager] Evicting stale nonce ${entry.nonce || 'default'} for plugin: ${uri}`);
			if (await this._tryDeleteDir(this._dirForEntry(entry))) {
				this._removeDeletedEntry(entry);
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
			if (this._isRetained(candidate)) {
				i++;
				continue;
			}
			this._logService.info(`[AgentPluginManager] Evicting revision ${candidate.nonce || 'default'} of plugin: ${candidate.uri}`);
			if (await this._tryDeleteDir(this._dirForEntry(candidate))) {
				this._removeDeletedEntry(candidate);
				if (!candidate.dir && !this._lru.some(entry => entry.uri === candidate.uri)) {
					await this._tryDeleteDir(this._pluginRootFor(candidate.uri));
				}
			} else {
				// Locked — keep it in the LRU and try the next candidate.
				i++;
			}
		}
	}

	private _dirForEntry(entry: ICacheEntry): URI {
		return entry.dir ? URI.parse(entry.dir) : this._dirFor(entry.uri, entry.nonce);
	}

	private _removeDeletedEntry(entry: ICacheEntry): void {
		this._removeEntryRef(entry);
		if (entry.capturedUri) {
			this._capturedDirs.delete(entry.capturedUri);
		}
	}

	private _isRetained(entry: ICacheEntry): boolean {
		const revision = entry.capturedUri ?? entry.uri;
		return this._captureLeases.has(revision) || !!entry.holders?.size;
	}

	private _addCaptureLease(uri: string): void {
		this._captureLeases.set(uri, (this._captureLeases.get(uri) ?? 0) + 1);
	}

	private _releaseCaptureLease(uri: string): void {
		const count = this._captureLeases.get(uri);
		if (count === 1) {
			this._captureLeases.delete(uri);
		} else if (count) {
			this._captureLeases.set(uri, count - 1);
		}
	}

	// ---- cache persistence --------------------------------------------------

	private _ensureCacheLoaded(): Promise<void> {
		this._cacheLoadPromise ??= this._loadCache();
		return this._cacheLoadPromise;
	}

	private async _loadCache(): Promise<void> {
		let entries: ICacheEntry[];
		try {
			const content = await this._fileService.readFile(this._cachePath);
			entries = this._parseCacheEntries(content.value.toString());
		} catch (err) {
			if (toFileOperationResult(err) === FileOperationResult.FILE_NOT_FOUND) {
				return;
			}
			this._logService.error('[AgentPluginManager] Existing cache manifest is unreadable or malformed; refusing to modify it', err);
			throw err;
		}

		// Entries are stored in LRU order (oldest first).
		for (const entry of entries) {
			this._lru.push(entry);
			if (entry.capturedUri) {
				this._capturedDirs.add(entry.capturedUri);
			}
		}
		this._logService.trace(`[AgentPluginManager] Loaded ${entries.length} cache entries from disk`);

		await this._pruneMissingEntries();
		await this._cleanupStaleNonces();
		await this._persistCache();
	}

	private _parseCacheEntries(content: string): ICacheEntry[] {
		const parsed: unknown = JSON.parse(content);
		if (!Array.isArray(parsed)) {
			throw new Error('Cache manifest must contain an array of entries');
		}

		return parsed.map((entry, index) => this._parseCacheEntry(entry, index));
	}

	private _parseCacheEntry(value: unknown, index: number): ICacheEntry {
		if (!value || typeof value !== 'object' || Array.isArray(value)) {
			throw new Error(`Cache manifest entry ${index} must be an object`);
		}
		const entry = value as Record<string, unknown>;
		if (typeof entry.uri !== 'string' || typeof entry.nonce !== 'string') {
			throw new Error(`Cache manifest entry ${index} must have string uri and nonce fields`);
		}
		const uri = entry.uri;
		const nonce = entry.nonce;
		const holdersValue = entry.holders;
		const holders = new Set<string>();
		if (holdersValue !== undefined) {
			if (!Array.isArray(holdersValue)) {
				throw new Error(`Cache manifest entry ${index} has invalid holders`);
			}
			for (const holder of holdersValue) {
				if (typeof holder !== 'string') {
					throw new Error(`Cache manifest entry ${index} has invalid holders`);
				}
				holders.add(holder);
			}
		}
		const dir = entry.dir;
		const capturedUri = entry.capturedUri;
		if ((dir === undefined) !== (capturedUri === undefined)) {
			throw new Error(`Cache manifest entry ${index} has invalid captured directory metadata`);
		}
		if (dir === undefined && capturedUri === undefined) {
			return { uri, nonce, holders };
		}
		if (typeof dir !== 'string' || typeof capturedUri !== 'string') {
			throw new Error(`Cache manifest entry ${index} has invalid captured directory metadata`);
		}
		if (!this._isCapturedUri(capturedUri)) {
			throw new Error(`Cache manifest entry ${index} has an invalid captured URI`);
		}

		const expectedCaptureUri = this._captureDirFor(uri, nonce).toString();
		const isKnownCapture = dir === expectedCaptureUri && capturedUri === expectedCaptureUri;
		const isAdoptedCapture = dir === capturedUri && uri === capturedUri && nonce === capturedUri;
		if (!isKnownCapture && !isAdoptedCapture) {
			throw new Error(`Cache manifest entry ${index} has unrecognized captured directory metadata`);
		}
		return { uri, nonce, dir, capturedUri, holders };
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
				await this._fileService.stat(this._dirForEntry(entry));
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
			if (!present[i] && !this._isRetained(this._lru[i])) {
				this._logService.trace(`[AgentPluginManager] Dropping cache entry with no directory: ${this._lru[i].uri}`);
				this._removeDeletedEntry(this._lru[i]);
			}
		}
	}

	private async _commitCache(entries: ICacheEntry[], strict = false): Promise<void> {
		await this._persistCache(entries, strict);
		this._lru.splice(0, this._lru.length, ...entries);
	}

	private async _persistCache(entries: readonly ICacheEntry[] = this._lru, strict = false): Promise<void> {
		try {
			// Write entries in LRU order (oldest first)
			const serializedEntries = entries.map(entry => ({
				uri: entry.uri,
				nonce: entry.nonce,
				...(entry.dir ? { dir: entry.dir, capturedUri: entry.capturedUri } : {}),
				...(entry.holders?.size ? { holders: [...entry.holders] } : {}),
			}));
			await this._fileService.createFolder(this._basePath);
			await this._fileService.writeFile(this._cachePath, VSBuffer.fromString(JSON.stringify(serializedEntries)), { atomic: { postfix: '.tmp' } });
		} catch (err) {
			this._logService.warn('[AgentPluginManager] Failed to persist cache to disk', err);
			if (strict) {
				throw err;
			}
		}
	}
}
