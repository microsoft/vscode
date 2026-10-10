/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../base/common/async.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { basename, isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { Emitter } from '../../../../base/common/event.js';
import { FileChangeType, IFileService } from '../../../files/common/files.js';
import { ILogService } from '../../../log/common/log.js';

/** Coalesces native catalog invalidations and signals transcript changes without reading storage formats. */
export class CodexChatDiscovery extends Disposable {
	private readonly _onDidInvalidateHistory = this._register(new Emitter<void>());
	readonly onDidInvalidateHistory = this._onDidInvalidateHistory.event;
	private static readonly refreshDelay = 5000;
	private static readonly safetyRefreshDelay = 60_000;
	private readonly _refresh = this._register(new RunOnceScheduler(() => { void this._run(); }, CodexChatDiscovery.refreshDelay));
	private readonly _safetyRefresh = this._register(new RunOnceScheduler(() => this.invalidateCatalog(), CodexChatDiscovery.safetyRefreshDelay));
	private readonly _watchers = this._register(new DisposableStore());
	private _home: URI | undefined;
	private _started = false;
	private _running: Promise<void> | undefined;
	private _invalidated = false;
	private _retryDelay = CodexChatDiscovery.refreshDelay;

	constructor(
		/** `undefined` defers until explicit readiness; `false` retries; `true` succeeds. */
		private readonly _scan: () => Promise<boolean | undefined>,
		@IFileService private readonly _fileService: IFileService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	start(): Promise<void> {
		if (!this._started) {
			this._started = true;
			return this._run();
		}
		return this._running ?? Promise.resolve();
	}

	/** Coalesce catalog changes without postponing refresh forever. */
	invalidateCatalog(): void {
		if (!this._started || this._store.isDisposed) {
			return;
		}
		this._invalidated = true;
		this._onDidInvalidateHistory.fire();
		if (!this._running && !this._refresh.isScheduled()) {
			this._refresh.schedule();
		}
	}

	private _invalidateHistory(): void {
		if (!this._started || this._store.isDisposed) {
			return;
		}
		this._onDidInvalidateHistory.fire();
	}

	/** Use the resolved home from initialize, including configuration overrides. */
	watch(home: URI): void {
		if (this._store.isDisposed || isEqual(home, this._home)) {
			return;
		}
		this._watchers.clear();
		this._home = home;
		const sessions = URI.joinPath(home, 'sessions');
		// App-server fs/watch is shallow; VS Code's recursive watcher follows missing/replaced dated directories.
		this._watchers.add(this._fileService.onDidFilesChange(event => {
			// Appending to an existing rollout only changes its transcript. A rollout add/delete can change the catalog.
			if (event.affects(sessions, FileChangeType.ADDED, FileChangeType.DELETED)) {
				this.invalidateCatalog();
			} else if (event.affects(sessions, FileChangeType.UPDATED)) {
				this._invalidateHistory();
			}
		}));
		// Recursive watches do not support correlation yet.
		this._watchers.add(this._fileService.watch(sessions, { recursive: true, excludes: [] }));
		// Metadata may change without a rollout append; these paths are invalidation hints, never parsed.
		const homeWatcher = this._watchers.add(this._fileService.createWatcher(home, { recursive: false, excludes: [] }));
		this._watchers.add(homeWatcher.onDidChange(event => {
			const changes = [...event.rawAdded, ...event.rawUpdated, ...event.rawDeleted];
			const catalogChanged = changes.some(resource => {
				const name = basename(resource);
				return isEqual(resource, home) || name === 'sessions' || name === 'session_index.jsonl';
			}) || [...event.rawAdded, ...event.rawDeleted].some(resource => /^state_.*\.sqlite$/.test(basename(resource)));
			if (catalogChanged) {
				this.invalidateCatalog();
			} else if (changes.some(resource => /^state_.*\.sqlite(?:-wal)?$/.test(basename(resource)))) {
				// Existing database and WAL writes are ordinary turn persistence; new databases were handled above.
				this._invalidateHistory();
			}
		}));
	}

	private _run(): Promise<void> {
		if (this._store.isDisposed) {
			return Promise.resolve();
		}
		if (this._running) {
			this._invalidated = true;
			return this._running;
		}
		this._refresh.cancel();
		this._safetyRefresh.cancel();
		this._invalidated = false;
		this._running = Promise.resolve().then(async () => {
			let result: boolean | undefined = false;
			try {
				result = await this._scan();
			} catch (error) {
				this._logService.warn('[Codex] Chat discovery failed', error);
			} finally {
				this._running = undefined;
				if (!this._store.isDisposed) {
					// Even an SDK readiness signal during a deferred scan owes one trailing scan.
					if (result === false || this._invalidated) {
						this._refresh.schedule(result === false ? this._retryDelay : CodexChatDiscovery.refreshDelay);
					}
					this._retryDelay = result ? CodexChatDiscovery.refreshDelay : Math.min(this._retryDelay * 2, CodexChatDiscovery.safetyRefreshDelay);
					if (result !== undefined) {
						// Covers lost watcher events and alternate native catalog locations.
						this._safetyRefresh.schedule();
					}
				}
			}
		});
		return this._running;
	}
}
