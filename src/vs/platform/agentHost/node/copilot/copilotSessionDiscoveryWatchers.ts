/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Limiter } from '../../../../base/common/async.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { basename, dirname, isEqual } from '../../../../base/common/resources.js';
import { StopWatch } from '../../../../base/common/stopwatch.js';
import { URI } from '../../../../base/common/uri.js';
import { FileChangeFilter, FileChangesEvent, FileChangeType, FileOperationResult, IFileService, IFileStatWithPartialMetadata, toFileOperationResult } from '../../../files/common/files.js';
import { ILogService } from '../../../log/common/log.js';

const readinessFiles = ['events.jsonl', 'workspace.yaml', 'vscode.metadata.json'];
export const copilotDiscoveryRetryDelays = [250, 1_000, 5_000, 60_000];
export type CopilotDiscoveryReason = 'startup' | 'directoryAdded' | 'rootReconcile' | 'journalCreated' | 'metadataChanged' | 'readinessProbe' | 'retry';

interface IDirectoryChanges {
	readonly added: { id: string; resource: URI; reason: CopilotDiscoveryReason }[];
	removed: string[];
	reset: boolean;
}

interface IDirectoryChange {
	readonly type: FileChangeType;
	readonly removed: boolean;
}

async function statIfExists(fileService: IFileService, resource: URI): Promise<IFileStatWithPartialMetadata | undefined> {
	try {
		return await fileService.stat(resource);
	} catch (error) {
		if (error instanceof Error && toFileOperationResult(error) === FileOperationResult.FILE_NOT_FOUND) {
			return undefined;
		}
		throw error;
	}
}

/** Tracks directory membership without enumerating history for ordinary file events. */
export class CopilotSessionDirectoryWatcher extends Disposable {
	private readonly _known = new Set<string>();
	private readonly _changes = new Map<string, IDirectoryChange>();
	private readonly _stats = this._register(new Limiter<void>(4));
	private readonly _watch = this._register(new MutableDisposable());
	private _rootStat: Pick<IFileStatWithPartialMetadata, 'ctime' | 'mtime'> | undefined;
	private _reconcile = true;
	private _generation = 0;
	private _ignoredEvents = 0;

	get generation(): number { return this._generation; }
	get hasChanges(): boolean { return this._reconcile || this._changes.size > 0; }
	get ignoredEvents(): number { return this._ignoredEvents; }
	get size(): number { return this._known.size; }

	constructor(
		private readonly _root: URI,
		private readonly _isHostSession: (id: string) => boolean,
		private readonly _onChange: () => void,
		private readonly _fileService: IFileService,
		private readonly _logService: ILogService,
	) {
		super();
	}

	start(): void {
		const store = new DisposableStore();
		this._watch.value = store;
		const watcher = store.add(this._fileService.createWatcher(this._root, {
			recursive: false, excludes: [], filter: FileChangeFilter.ADDED | FileChangeFilter.DELETED,
		}));
		store.add(watcher.onDidChange(event => this._handleChanges(event)));
	}

	isCurrent(id: string): boolean {
		return !this._changes.has(id) && !this._isHostSession(id);
	}

	private _handleChanges(event: FileChangesEvent): void {
		for (const [resources, type] of [[event.rawDeleted, FileChangeType.DELETED], [event.rawAdded, FileChangeType.ADDED]] as const) {
			for (const resource of resources) {
				if (isEqual(resource, this._root)) {
					this._generation++;
					this._rootStat = undefined;
					this._reconcile = true;
				} else if (isEqual(dirname(resource), this._root) && !basename(resource).startsWith('.')) {
					const id = basename(resource);
					if (this._isHostSession(id)) {
						this._ignoredEvents++;
						continue;
					}
					this._changes.set(id, {
						type,
						removed: type === FileChangeType.DELETED || this._changes.get(id)?.removed === true,
					});
				}
			}
		}
		if (this.hasChanges) {
			this._onChange();
		}
	}

	async readChanges(maintenance: boolean): Promise<IDirectoryChanges> {
		const result: IDirectoryChanges = { added: [], removed: [], reset: false };
		const changes = new Map(this._changes);
		this._changes.clear();
		for (const [id, change] of changes) {
			if (change.removed) {
				this._known.delete(id);
				result.removed.push(id);
			}
		}
		const reconcile = this._reconcile;
		this._reconcile = false;
		const generation = this._generation;
		const timer = StopWatch.create();
		let enumerated = false;
		try {
			if (reconcile || maintenance) {
				const stat = await statIfExists(this._fileService, this._root);
				if (generation !== this._generation || this._store.isDisposed) {
					return result;
				}
				if (reconcile || stat?.ctime !== this._rootStat?.ctime || stat?.mtime !== this._rootStat?.mtime) {
					result.reset = reconcile || stat?.ctime !== this._rootStat?.ctime;
					if (result.reset) {
						this._generation++;
						this._known.clear();
					}
					// Capture before enumeration so concurrent additions are not absorbed into its fingerprint.
					this._rootStat = stat;
					const readGeneration = this._generation;
					const children = stat ? (await this._fileService.resolve(this._root)).children ?? [] : [];
					enumerated = !!stat;
					if (readGeneration !== this._generation || this._store.isDisposed) {
						return { added: [], removed: [], reset: true };
					}
					const present = new Set<string>();
					for (const child of children) {
						if (!child.isDirectory || child.isSymbolicLink || child.name.startsWith('.')) {
							continue;
						}
						present.add(child.name);
						if (!this._known.has(child.name) && !this._isHostSession(child.name)) {
							result.added.push({ id: child.name, resource: child.resource, reason: reconcile ? 'startup' : 'rootReconcile' });
						}
					}
					result.removed.push(...[...this._known].filter(id => !present.has(id)));
					this._known.clear();
					for (const id of present) {
						this._known.add(id);
					}
					changes.clear();
				}
			}
			const incrementalGeneration = this._generation;
			await Promise.all([...changes].map(([id, { type }]) => this._stats.queue(async () => {
				if (this._isHostSession(id) || this._store.isDisposed) {
					return;
				}
				if (type === FileChangeType.ADDED && !this._known.has(id)) {
					const resource = URI.joinPath(this._root, id);
					const stat = await statIfExists(this._fileService, resource);
					if (stat?.isDirectory && !stat.isSymbolicLink && !this._isHostSession(id)
						&& incrementalGeneration === this._generation && !this._store.isDisposed) {
						this._known.add(id);
						result.added.push({ id, resource, reason: 'directoryAdded' });
					}
				}
			})));
		} catch (error) {
			this._rootStat = undefined;
			this._logService.warn('[CopilotDiscovery] Failed to read session directories; retrying on maintenance', error);
		}
		if (enumerated || changes.size > 0) {
			this._logService.debug(`[CopilotDiscovery] Directories: enumerated=${enumerated}, entries=${this._known.size}, events=${changes.size}, added=${result.added.length}, removed=${result.removed.length}, ignoredHostEvents=${this._ignoredEvents}, elapsedMs=${Math.round(timer.elapsed())}`);
		}
		if (timer.elapsed() >= 2_000) {
			this._logService.warn(`[CopilotDiscovery] Slow directory check: enumerated=${enumerated}, entries=${this._known.size}, elapsedMs=${Math.round(timer.elapsed())}`);
		}
		return result;
	}
}

/** Owns one unresolved session's readiness, revision, retry deadline, and optional shallow watcher. */
export class CopilotSessionDiscoveryCandidate extends Disposable {
	private readonly _watch = this._register(new MutableDisposable());
	private _fingerprint: string | undefined;
	private _hasJournal = false;
	private _attempt = 0;
	private _revision = 0;
	private _nextScanAt = Infinity;
	private _reason: CopilotDiscoveryReason;
	readonly observedAt = Date.now();
	deleted = false;

	get revision(): number { return this._revision; }
	get nextScanAt(): number { return this._nextScanAt; }
	get reason(): CopilotDiscoveryReason { return this._reason; }
	get watching(): boolean { return !!this._watch.value; }

	constructor(
		readonly id: string,
		private readonly _resource: URI,
		reason: CopilotDiscoveryReason,
		private readonly _onChange: () => void,
		private readonly _fileService: IFileService,
		private readonly _logService: ILogService,
	) {
		super();
		this._reason = reason;
	}

	watch(): void {
		const store = new DisposableStore();
		this._watch.value = store;
		const watcher = store.add(this._fileService.createWatcher(this._resource, {
			recursive: false, excludes: [], includes: [...readinessFiles],
		}));
		store.add(watcher.onDidChange(event => {
			if (event.contains(this._resource, FileChangeType.DELETED)) {
				this.deleted = true;
				this._changed('metadataChanged');
				return;
			}
			const journal = URI.joinPath(this._resource, 'events.jsonl');
			if (event.contains(journal, FileChangeType.ADDED, FileChangeType.DELETED)) {
				this._hasJournal = event.contains(journal, FileChangeType.ADDED);
				this._changed('journalCreated');
			} else if ([...event.rawAdded, ...event.rawUpdated, ...event.rawDeleted].some(resource =>
				isEqual(dirname(resource), this._resource) && readinessFiles.slice(1).includes(basename(resource)))) {
				this._changed('metadataChanged');
			}
		}));
	}

	private _changed(reason: CopilotDiscoveryReason): void {
		this._revision++;
		this._reason = reason;
		this._attempt = 0;
		this._nextScanAt = this._hasJournal ? Date.now() : Infinity;
		this._logService.trace(`[CopilotDiscovery] Candidate ${this.id}: reason=${reason}, hasJournal=${this._hasJournal}, revision=${this._revision}`);
		this._onChange();
	}

	async probe(limiter: Limiter<IFileStatWithPartialMetadata | undefined>): Promise<boolean> {
		const revision = this._revision;
		try {
			const stats = await Promise.all(readinessFiles.map(name =>
				limiter.queue(() => statIfExists(this._fileService, URI.joinPath(this._resource, name)))));
			if (this._store.isDisposed || revision !== this._revision) {
				return false;
			}
			this._hasJournal = stats[0]?.isFile === true;
			const fingerprint = stats.map((stat, index) => index === 0 ? String(this._hasJournal) : stat ? `${stat.ctime}:${stat.mtime}:${stat.size}` : '').join('|');
			if (this._fingerprint === undefined ? this._hasJournal : this._fingerprint !== fingerprint) {
				this._changed(this._fingerprint === undefined ? this._reason : 'readinessProbe');
			}
			this._fingerprint = fingerprint;
			return true;
		} catch (error) {
			this._logService.warn(`[CopilotDiscovery] Failed to probe candidate ${this.id}`, error);
			return false;
		}
	}

	retry(): void {
		this._reason = 'retry';
		this._nextScanAt = this._hasJournal ? Date.now() + copilotDiscoveryRetryDelays[Math.min(this._attempt++, copilotDiscoveryRetryDelays.length - 1)] : Infinity;
	}
}
