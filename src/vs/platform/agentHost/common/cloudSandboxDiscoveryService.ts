/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellationError, RunOnceScheduler } from '../../../base/common/async.js';
import { cancelOnDispose, CancellationToken } from '../../../base/common/cancellation.js';
import { CancellationError, isCancellationError } from '../../../base/common/errors.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../base/common/lifecycle.js';
import { ILogService } from '../../log/common/log.js';
import { ICloudSandboxDiscoveredSession, ICloudSandboxDiscoveryOptions, ICloudSandboxDiscoveryResult } from './cloudSandboxAgentHost.js';
import { CloudSandboxDiscovery } from './cloudSandboxDiscovery.js';
import { CloudSandboxSessionFeed } from './cloudSandboxSessionFeed.js';

export interface ICloudSandboxDiscoveryUpdate {
	readonly result: ICloudSandboxDiscoveryResult;
	readonly includesArchived: boolean;
}

export type CloudSandboxDiscoveryMutation =
	| { readonly kind: 'remove'; readonly taskId: string }
	| { readonly kind: 'refresh'; readonly taskId: string }
	| { readonly kind: 'seed'; readonly session: ICloudSandboxDiscoveredSession };

/** A window-owned subscription; releasing one subscription never cancels its peers. */
export interface ICloudSandboxDiscoverySubscription extends IDisposable {
	readonly onDidChange: Event<ICloudSandboxDiscoveryUpdate>;
	readonly onDidInvalidate: Event<void>;
	refresh(options: ICloudSandboxDiscoveryOptions, token: CancellationToken): Promise<void>;
	setDemand(archived: boolean, focused: boolean): Promise<void>;
	reconcile(mutation: CloudSandboxDiscoveryMutation): Promise<void>;
}

const pollInterval = 5 * 60_000;
const fullInterval = 15 * 60_000;

/** Owns one account's feed, bounded inventory and catch-up across its live consumers. */
export class CloudSandboxDiscoveryCoordinator extends Disposable {
	private readonly _onDidChange = this._register(new Emitter<ICloudSandboxDiscoveryUpdate>());
	readonly onDidChange = this._onDidChange.event;
	private readonly _token = cancelOnDispose(this._store);
	private readonly _sessions = new Map<string, ICloudSandboxDiscoveredSession>();
	private readonly _removed = new Set<string>();
	private readonly _demands = new Map<object, { archived: boolean; focused: boolean }>();
	private readonly _poll = this._register(new RunOnceScheduler(() => {
		void this.refresh({ incremental: true, trigger: 'poll' }).finally(() => {
			if (!this._store.isDisposed) {
				this._poll.schedule(this._pollDelay());
			}
		});
	}, pollInterval));
	private _started: Promise<void> | undefined;
	private _scan: Promise<void> | undefined;
	private _queued: Promise<void> | undefined;
	private _queuedFull = false;
	private _scanArchived = false;
	private _scanFull = false;
	private _lastAttempt: number | undefined;
	private _lastFull: number | undefined;
	private _archivesLoaded = false;
	private _retryInterval = pollInterval;
	private readonly _pendingTasks = new Set<string>();
	private _taskRead: Promise<void> | undefined;

	constructor(
		private readonly _discovery: CloudSandboxDiscovery,
		private readonly _feed: CloudSandboxSessionFeed,
		private readonly _logService: ILogService,
	) {
		super();
		this._register(_feed);
	}

	get snapshot(): ICloudSandboxDiscoveryUpdate {
		return {
			result: { kind: this._lastFull === undefined ? 'partial' : this._archivesLoaded ? 'complete' : 'scoped', sessions: [...this._sessions.values()], removedTaskIds: [...this._removed] },
			includesArchived: this._archivesLoaded,
		};
	}

	setDemand(consumer: object, archived: boolean, focused: boolean): void {
		this._demands.set(consumer, { archived, focused });
	}

	removeConsumer(consumer: object): void {
		this._demands.delete(consumer);
	}

	private get _includeArchived(): boolean {
		return [...this._demands.values()].some(demand => demand.archived);
	}

	start(): Promise<void> {
		return this._started ??= (async () => {
			await this._feed.start();
			if (this._token.isCancellationRequested) {
				throw new CancellationError();
			}
			this._poll.schedule(this._pollDelay());
		})();
	}

	async refresh(options: ICloudSandboxDiscoveryOptions = {}, token = CancellationToken.None): Promise<void> {
		await raceCancellationError(this.start(), token);
		if (options.taskIds) {
			for (const id of options.taskIds) {
				if (!this._removed.has(id)) {
					this._pendingTasks.add(id);
				}
			}
			return raceCancellationError(this._refreshTasks(), token);
		}
		const passive = options.trigger === 'poll' || options.trigger === 'focus' || options.trigger === 'selection' || options.trigger === 'automatic';
		if (passive && (this._feed.connected || ![...this._demands.values()].some(demand => demand.focused)
			|| this._lastAttempt !== undefined && Date.now() - this._lastAttempt < this._pollInterval())) {
			return;
		}
		const initial = options.trigger === 'startup' || options.trigger === 'accountChange' || options.trigger === 'configurationChange';
		if (initial && this._lastFull !== undefined && (!this._includeArchived || this._archivesLoaded)
			&& (this._feed.connected || this._lastAttempt !== undefined && Date.now() - this._lastAttempt < this._pollInterval())) {
			return;
		}
		if (this._scan) {
			const requiresFull = options.incremental !== true;
			const catchup = options.trigger === 'feedRenewal' || options.trigger === 'feedReconnect';
			if (!catchup && (!requiresFull || this._scanFull) && (!this._includeArchived || this._scanArchived)) {
				return raceCancellationError(this._scan, token);
			}
			this._queuedFull ||= requiresFull;
			this._queued ??= this._scan.finally(async () => {
				const full = this._queuedFull;
				this._queued = undefined;
				this._queuedFull = false;
				await this.refresh({ ...options, incremental: !full });
			});
			return raceCancellationError(this._queued, token);
		}
		this._lastAttempt = Date.now();
		this._scanArchived = this._includeArchived;
		this._scanFull = !options.incremental || this._lastFull === undefined || Date.now() - this._lastFull >= fullInterval;
		this._scan = this._read({ ...options, incremental: !this._scanFull, includeArchived: this._scanArchived })
			.finally(() => this._scan = undefined);
		return raceCancellationError(this._scan, token);
	}

	private async _refreshTasks(): Promise<void> {
		if (this._taskRead) {
			await this._taskRead;
			return this._refreshTasks();
		}
		if (!this._pendingTasks.size) {
			return;
		}
		const ids = [...this._pendingTasks];
		this._pendingTasks.clear();
		this._taskRead = this._read({ taskIds: ids, incremental: true, trigger: 'feedChange', includeArchived: this._includeArchived })
			.finally(() => this._taskRead = undefined);
		await this._taskRead;
	}

	private async _read(options: ICloudSandboxDiscoveryOptions): Promise<void> {
		try {
			let result = await this._discovery.listSessions(this._token, options);
			const retryIds = options.taskIds && (result.kind === 'failed' ? options.taskIds : result.kind === 'partial' ? result.failedTaskIds : undefined);
			if (retryIds?.length) {
				const retried = await this._discovery.listSessions(this._token, { ...options, taskIds: retryIds });
				if (result.kind === 'failed') {
					result = retried;
				} else if (retried.kind !== 'failed') {
					result = { ...retried, sessions: [...result.sessions, ...retried.sessions], removedTaskIds: [...result.removedTaskIds ?? [], ...retried.removedTaskIds ?? []] };
				}
			}
			if (this._token.isCancellationRequested) {
				throw new CancellationError();
			}
			if (!options.taskIds) {
				this._retryInterval = result.kind === 'failed' || result.kind === 'partial' ? Math.min(fullInterval, this._retryInterval * 2) : pollInterval;
				if (result.kind === 'complete' || result.kind === 'scoped') {
					this._lastFull = Date.now();
				}
				if (options.includeArchived && (result.kind === 'complete' || result.kind === 'incremental')) {
					this._archivesLoaded = true;
				}
			}
			this._commit(result, options.includeArchived === true && options.taskIds === undefined);
		} catch (error) {
			if (!isCancellationError(error) && !this._token.isCancellationRequested) {
				this._logService.error('[CloudSandboxDiscovery] Refresh failed', error);
				this._onDidChange.fire({ result: { kind: 'failed', reason: 'Cloud sandbox discovery failed' }, includesArchived: options.includeArchived === true && options.taskIds === undefined });
			}
		}
	}

	private _commit(result: ICloudSandboxDiscoveryResult, includesArchived: boolean): void {
		if (result.kind !== 'failed') {
			const present = new Set(result.sessions.map(session => session.taskId));
			if (result.kind === 'complete' || result.kind === 'scoped') {
				for (const [id, session] of this._sessions) {
					if (!present.has(id) && (result.kind === 'complete' || !session.isArchived)) {
						this._sessions.delete(id);
					}
				}
			}
			for (const id of result.removedTaskIds ?? []) {
				this._sessions.delete(id);
			}
			for (const session of result.sessions) {
				if (!this._removed.has(session.taskId)) {
					this._sessions.set(session.taskId, session);
				}
			}
			result = { ...result, sessions: result.sessions.filter(session => !this._removed.has(session.taskId)) };
		}
		this._onDidChange.fire({ result, includesArchived });
	}

	async reconcile(mutation: CloudSandboxDiscoveryMutation): Promise<void> {
		if (mutation.kind === 'remove') {
			this._discovery.remove(mutation.taskId);
			this._pendingTasks.delete(mutation.taskId);
			this._removed.add(mutation.taskId);
			this._commit({ kind: 'incremental', sessions: [], removedTaskIds: [mutation.taskId] }, false);
		} else if (mutation.kind === 'seed') {
			this._discovery.seed(mutation.session);
			this._removed.delete(mutation.session.taskId);
			this._commit({ kind: 'incremental', sessions: [mutation.session], removedTaskIds: [] }, false);
		} else {
			this._discovery.invalidate(mutation.taskId);
			this._removed.delete(mutation.taskId);
			await this.refresh({ taskIds: [mutation.taskId], trigger: 'feedChange' });
		}
	}

	private _pollInterval(): number {
		return this._sessions.size === 0 && this._lastFull !== undefined ? Math.max(fullInterval, this._retryInterval) : this._retryInterval;
	}

	private _pollDelay(): number {
		return this._pollInterval() + Math.floor(Math.random() * 60_000);
	}
}
