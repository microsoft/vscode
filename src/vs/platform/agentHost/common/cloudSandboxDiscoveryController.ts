/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../base/common/async.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { isCancellationError } from '../../../base/common/errors.js';
import { Disposable, MutableDisposable } from '../../../base/common/lifecycle.js';
import { IObservable, observableValue } from '../../../base/common/observable.js';
import { ILogService } from '../../log/common/log.js';
import { CloudSandboxAuthenticationRequiredError, type CloudSandboxDiscoveryTrigger, type ICloudSandboxDiscoveryOptions, type ICloudSandboxDiscoveryResult, type ICloudSandboxDiscoveryDiagnostics } from './cloudSandboxAgentHost.js';
import { CloudSandboxSessionFeed, CloudSandboxSessionFeedRefresh } from './cloudSandboxSessionFeed.js';

const LOG_PREFIX = '[CloudSandboxAgentHost]';

const DISCOVERY_POLL_INTERVAL_MS = 5 * 60_000;

const FULL_DISCOVERY_INTERVAL_MS = 15 * 60_000;

const MAX_DISCOVERY_RETRY_INTERVAL_MS = 15 * 60_000;

const SESSION_FEED_INACTIVITY_GRACE_MS = 60_000;

export interface ICloudSandboxDiscoveryRequest extends ICloudSandboxDiscoveryOptions {
	readonly retry?: boolean;
}
export type CloudSandboxArchiveDiscoveryState = 'idle' | 'loading' | 'loaded' | 'error';

/** Window-independent inputs and projections for one discovery owner. */
export interface ICloudSandboxDiscoveryContext {
	readonly token: CancellationToken;
	readonly enabled: boolean;
	readonly discoveryEnabled: boolean;
	readonly active: boolean;
	readonly focused: boolean;
	readonly feedEnabled: boolean;
	readonly hasTasks: boolean;
	getAccountKey(): Promise<string | undefined>;
	listSessions(token: CancellationToken, options?: ICloudSandboxDiscoveryOptions): Promise<ICloudSandboxDiscoveryResult>;
	restoreAccount(accountKey: string | undefined): boolean;
	acceptResult(result: Exclude<ICloudSandboxDiscoveryResult, { kind: 'failed' }>): void;
	pruneTasks(): void;
	pollJitter(): number;
	createFeed(onInvalidate: (refresh: CloudSandboxSessionFeedRefresh) => void, canConnect: () => boolean): CloudSandboxSessionFeed;
}

/** Owns discovery scheduling and feed lifecycle independently of any window's provider projection. */
export class CloudSandboxDiscoveryController extends Disposable {

	/** Serializes discovery so overlapping triggers can't interleave reconciliation. */
	private _discoveryInFlight: Promise<void> | undefined;

	private _discoveryQueued: Promise<void> | undefined;

	private _discoveryDiagnostics: { coalescedRequestCount: number; coalescedTrigger?: CloudSandboxDiscoveryTrigger | 'multiple' } | undefined;

	private _queuedDiscoveryRequest: ICloudSandboxDiscoveryRequest | undefined;

	private _taskRefreshInFlight: Promise<void> | undefined;

	private _taskRefreshQueued: Promise<void> | undefined;

	private readonly _pendingTaskIds = new Set<string>();

	private _discoveryToken: CancellationToken | undefined;

	private _discoveryTrigger: CloudSandboxDiscoveryTrigger | undefined;

	private _lastDiscoveryFailed = false;

	private _discoveryDeferred = false;

	private _inactiveSince: number | undefined;

	private _discoveryIncremental = false;

	private _lastDiscoveryAttempt: number | undefined;

	private _lastFullDiscovery: number | undefined;

	private _discoveryRetryInterval = DISCOVERY_POLL_INTERVAL_MS;

	private readonly _sessionFeed = this._register(new MutableDisposable<CloudSandboxSessionFeed>());

	private readonly _archiveState = observableValue<CloudSandboxArchiveDiscoveryState>(this, 'idle');

	private _archivesRequested = false;

	private _archivesLoaded = false;

	private _discoveryIncludesArchived = false;

	private _sessionMutationVersion = 0;

	private readonly _discoveryPoll = this._register(new RunOnceScheduler(() => {
		this._context.pruneTasks();
		void this.refreshIfStale();
		this._discoveryPoll.schedule(this._nextPollDelay());
	}, DISCOVERY_POLL_INTERVAL_MS));


	async refreshIfStale(trigger: 'poll' | 'focus' | 'selection' | 'automatic' = 'poll'): Promise<void> {
		if (!this._context.discoveryEnabled || !this._context.active) {
			return;
		}
		if (this._discoveryInFlight) {
			await (this._discoveryQueued ?? this._discoveryInFlight);
			if (this._discoveryDeferred || this._sessionFeed.value?.deferred || this._pendingTaskIds.size) {
				await this.refreshIfStale(trigger);
			}
			return;
		}
		if (this._discoveryDeferred || this._sessionFeed.value?.deferred) {
			await this.refresh({ incremental: true, trigger });
			if (this._pendingTaskIds.size) {
				await this._refreshPendingTasks();
			}
			return;
		}
		if (this._pendingTaskIds.size) {
			await this._refreshPendingTasks();
		}
		// A connected feed supplies updates; explicit refreshes and feed catch-up use discovery directly.
		if (this._sessionFeed.value?.connected) {
			return;
		}
		if (!this._context.focused || (this._lastDiscoveryAttempt !== undefined && Date.now() - this._lastDiscoveryAttempt < this._pollInterval())) {
			return;
		}
		await this.refresh({ incremental: true, trigger });
	}


	/** An account without any known sandbox only needs the periodic full reconciliation. */
	private _pollInterval(): number {
		return !this._context.hasTasks && this._lastFullDiscovery !== undefined
			? Math.max(this._discoveryRetryInterval, FULL_DISCOVERY_INTERVAL_MS)
			: this._discoveryRetryInterval;
	}


	/** Time until the current interval elapses since the latest inventory pass, spread so windows do not poll in lockstep. */
	private _nextPollDelay(): number {
		const interval = this._pollInterval();
		const due = this._lastDiscoveryAttempt === undefined ? 0 : this._lastDiscoveryAttempt + interval - Date.now();
		return (due > 0 ? due : interval) + this._context.pollJitter();
	}


	updateActivity(): void {
		this._inactiveSince = this._context.active ? undefined : this._inactiveSince ?? Date.now();
	}


	/** Inventory scans are serialized; feed task reads use an independent coalescing lane. */
	refresh(request: ICloudSandboxDiscoveryRequest = {}): Promise<void> {
		const { incremental = false, retry = false, taskIds, trigger = 'manual' } = request;
		if (!this._context.enabled || this._store.isDisposed) {
			return Promise.resolve();
		}
		if (taskIds) {
			return this._refreshTasks(taskIds);
		}
		if (this._discoveryInFlight) {
			if (!retry && this._discoveryToken === this._context.token && (incremental || !this._discoveryIncremental)
				&& (!this._archivesRequested || this._discoveryIncludesArchived)) {
				if (this._discoveryDiagnostics) {
					this._discoveryDiagnostics.coalescedRequestCount++;
					const previous = this._discoveryDiagnostics.coalescedTrigger;
					this._discoveryDiagnostics.coalescedTrigger = previous === undefined || previous === trigger ? trigger : 'multiple';
				}
				const pending = this._discoveryQueued ?? this._discoveryInFlight;
				return trigger === 'manual' && this._discoveryTrigger !== 'manual'
					? pending.then(() => this._lastDiscoveryFailed || this._discoveryDeferred ? this.refresh(request) : undefined)
					: pending;
			}
			const coalescedRequestCount = this._queuedDiscoveryRequest ? (this._queuedDiscoveryRequest.diagnostics?.coalescedRequestCount ?? 0) + 1 : 0;
			const previousTrigger = this._queuedDiscoveryRequest?.diagnostics?.coalescedTrigger;
			const mergedTrigger = this._queuedDiscoveryRequest ? incremental ? trigger : this._queuedDiscoveryRequest.trigger ?? 'manual' : undefined;
			const coalescedTrigger = previousTrigger === undefined || previousTrigger === mergedTrigger ? mergedTrigger : 'multiple';
			if (!this._queuedDiscoveryRequest || !incremental) {
				this._queuedDiscoveryRequest = request;
			}
			this._queuedDiscoveryRequest = {
				...this._queuedDiscoveryRequest,
				diagnostics: { queued: true, coalescedRequestCount, coalescedTrigger },
			};
			this._discoveryQueued ??= this._discoveryInFlight.then(() => {
				const queued = this._queuedDiscoveryRequest;
				this._discoveryQueued = undefined;
				this._queuedDiscoveryRequest = undefined;
				return this.refresh(queued);
			});
			return this._discoveryQueued;
		}
		const now = Date.now();
		const previousInventoryAgeMs = this._lastDiscoveryAttempt === undefined ? undefined : Math.max(0, now - this._lastDiscoveryAttempt);
		const lastFullAgeMs = this._lastFullDiscovery === undefined ? undefined : Math.max(0, now - this._lastFullDiscovery);
		if (this._context.discoveryEnabled && (this._context.active || trigger === 'manual')) {
			this._lastDiscoveryAttempt = now;
		}
		this._discoveryIncremental = incremental && this._lastFullDiscovery !== undefined
			&& now - this._lastFullDiscovery < FULL_DISCOVERY_INTERVAL_MS;
		this._discoveryToken = this._context.token;
		this._discoveryTrigger = trigger;
		this._lastDiscoveryFailed = false;
		this._discoveryIncludesArchived = this._archivesRequested;
		const diagnostics = {
			intentMode: incremental ? 'incremental' : 'full',
			fullScanReason: this._discoveryIncremental ? 'notFull'
				: incremental ? this._lastFullDiscovery === undefined ? 'initial' : 'reconciliationDue'
					: trigger === 'startup' ? 'initial' : trigger === 'feedReconnect' ? 'reconnectPolicy'
						: trigger === 'accountChange' || trigger === 'configurationChange' ? trigger : 'requestedFull',
			previousInventoryAgeMs, lastFullAgeMs,
			queued: request.diagnostics?.queued ?? false,
			coalescedRequestCount: request.diagnostics?.coalescedRequestCount ?? 0,
			coalescedTrigger: request.diagnostics?.coalescedTrigger,
		} satisfies ICloudSandboxDiscoveryDiagnostics;
		this._discoveryDiagnostics = diagnostics;
		this._discoveryInFlight = this._doDiscoverAndSeed(this._discoveryToken, this._discoveryIncremental, trigger, taskIds, diagnostics).finally(() => {
			this._discoveryInFlight = undefined;
			this._discoveryDiagnostics = undefined;
			this._discoveryToken = undefined;
			this._discoveryTrigger = undefined;
			this.rearmPoll();
		});
		return this._discoveryInFlight;
	}


	/** Reschedules an armed poll from the current interval, which a finished pass or a first sandbox may have changed. */
	rearmPoll(): void {
		if (this._discoveryPoll.isScheduled()) {
			this._discoveryPoll.schedule(this._nextPollDelay());
		}
	}


	refreshFromFeed(refresh: CloudSandboxSessionFeedRefresh): Promise<void> {
		if (!this._context.feedEnabled) {
			return Promise.resolve();
		}
		if (refresh.reason === 'change') {
			return this._refreshTasks(refresh.taskIds);
		}
		return this.refresh({
			incremental: true,
			retry: true,
			trigger: refresh.reason === 'renewal' ? 'feedRenewal' : 'feedReconnect',
		});
	}


	private _refreshTasks(taskIds: readonly string[]): Promise<void> {
		if (!this._context.discoveryEnabled || !this._context.enabled || this._store.isDisposed || !this._context.feedEnabled) {
			return Promise.resolve();
		}
		for (const id of taskIds) {
			this._pendingTaskIds.add(id);
		}
		return this._refreshPendingTasks();
	}


	/** Accepted task hints retain their access checks after the subscription stops. */
	private _refreshPendingTasks(): Promise<void> {
		if (!this._context.discoveryEnabled || !this._context.active || !this._context.enabled || this._store.isDisposed) {
			return Promise.resolve();
		}
		if (this._taskRefreshInFlight) {
			this._taskRefreshQueued ??= this._taskRefreshInFlight.then(() => {
				this._taskRefreshQueued = undefined;
				return this._refreshPendingTasks();
			});
			return this._taskRefreshQueued;
		}
		if (!this._pendingTaskIds.size) {
			return Promise.resolve();
		}
		const token = this._context.token;
		this._taskRefreshInFlight = Promise.resolve().then(() => {
			if (token.isCancellationRequested || !this._context.active) {
				return;
			}
			const pending = [...this._pendingTaskIds];
			this._pendingTaskIds.clear();
			return pending.length ? this._doDiscoverAndSeed(token, true, 'feedChange', pending) : undefined;
		}).finally(() => {
			this._taskRefreshInFlight = undefined;
		});
		return this._taskRefreshInFlight;
	}


	private async _doDiscoverAndSeed(token: CancellationToken, incremental: boolean, trigger: CloudSandboxDiscoveryTrigger, taskIds?: readonly string[], diagnostics?: ICloudSandboxDiscoveryDiagnostics): Promise<void> {
		let result: ICloudSandboxDiscoveryResult;
		// Keep the scope fixed across authentication so it matches the in-flight coalescing flag.
		const includeArchived = this._archivesRequested;
		try {
			const accountKey = await this._context.getAccountKey();
			if (token.isCancellationRequested || !this._context.enabled) {
				return;
			}
			if (this._context.restoreAccount(accountKey)) {
				if (taskIds) {
					void this.refresh({ trigger: 'accountChange', retry: true });
					return;
				}
				token = this._context.token;
				this._discoveryToken = token;
				this._discoveryIncremental = incremental = false;
				if (diagnostics && trigger !== 'startup') {
					Object.assign(diagnostics, { fullScanReason: 'accountChange' });
				}
				taskIds = undefined;
			}
			if (!this._context.discoveryEnabled || !this._context.active && trigger !== 'manual') {
				// First use must not coalesce into this completed local-only pass.
				this._discoveryToken = undefined;
				this._deferDiscovery(taskIds);
				return;
			}
			if (!taskIds) {
				this._discoveryDeferred = !this._context.active;
			}
			if (!taskIds && this._lastDiscoveryAttempt === undefined) {
				this._lastDiscoveryAttempt = Date.now();
			}
			if (includeArchived && !taskIds && !this._archivesLoaded) {
				this._archiveState.set('loading', undefined);
			}
			if (!accountKey) {
				throw new CloudSandboxAuthenticationRequiredError();
			}
			while (!token.isCancellationRequested && this._context.enabled && this._context.active && this._context.feedEnabled) {
				const feed = this._sessionFeed.value ??= this._context.createFeed(
					refresh => void this.refreshFromFeed(refresh), () => this._context.discoveryEnabled && (
						this._context.active || this._inactiveSince !== undefined && Date.now() - this._inactiveSince < SESSION_FEED_INACTIVITY_GRACE_MS));
				await feed.start();
				if (this._sessionFeed.value === feed) {
					break;
				}
			}
			if (token.isCancellationRequested || !this._context.enabled) {
				return;
			}
			if (!this._context.active && trigger !== 'manual') {
				this._deferDiscovery(taskIds);
				return;
			}
			if (!this._discoveryPoll.isScheduled()) {
				this._discoveryPoll.schedule(this._nextPollDelay());
			}
			const mutationVersion = this._sessionMutationVersion;
			result = await this._context.listSessions(token, { incremental, includeArchived, trigger, ...(taskIds ? { taskIds } : {}), ...(diagnostics ? { diagnostics } : {}) });
			const retryTaskIds = taskIds && (result.kind === 'failed' ? taskIds : result.kind === 'partial' ? result.failedTaskIds : undefined);
			if (retryTaskIds?.length && !token.isCancellationRequested && this._context.enabled && !this._context.active) {
				this._deferDiscovery(retryTaskIds);
			} else if (retryTaskIds?.length && !token.isCancellationRequested && this._context.enabled) {
				const retried = await this._context.listSessions(token, { incremental: true, trigger, taskIds: retryTaskIds });
				if (result.kind === 'failed') {
					result = retried;
				} else if (result.kind === 'partial' && retried.kind !== 'failed') {
					result = {
						kind: retried.kind === 'partial' ? 'partial' : 'incremental',
						sessions: [...result.sessions, ...retried.sessions],
						removedTaskIds: [...result.removedTaskIds ?? [], ...retried.removedTaskIds ?? []],
						...(retried.kind === 'partial' ? { failedTaskIds: retried.failedTaskIds } : {}),
					};
				}
			}
			if (mutationVersion !== this._sessionMutationVersion) {
				result = { kind: 'failed', reason: 'Sandbox discovery was invalidated by a session mutation' };
			}
		} catch (error) {
			if (token.isCancellationRequested || isCancellationError(error) || !this._context.enabled) {
				return;
			}
			result = { kind: 'failed', reason: error instanceof Error ? error.message : String(error) };
		}
		if (token.isCancellationRequested || !this._context.enabled) {
			return;
		}
		if (!taskIds) {
			this._lastDiscoveryFailed = result.kind === 'failed';
		}
		if (includeArchived && !taskIds) {
			const succeeded = result.kind === 'complete' || result.kind === 'incremental' || result.kind === 'partial' && result.inventoryComplete === true;
			this._archivesLoaded ||= succeeded;
			this._archiveState.set(this._archivesLoaded ? 'loaded' : 'error', undefined);
		}
		this._discoveryRetryInterval = result.kind === 'failed' || result.kind === 'partial'
			? Math.min(this._discoveryRetryInterval * 2, MAX_DISCOVERY_RETRY_INTERVAL_MS)
			: DISCOVERY_POLL_INTERVAL_MS;
		if (result.kind === 'failed') {
			this._logService.warn(`${LOG_PREFIX} Discovery failed: ${result.reason}`);
			return;
		}
		if (result.kind === 'complete' || result.kind === 'scoped'
			|| result.kind === 'partial' && result.inventoryComplete && !incremental && !taskIds) {
			this._lastFullDiscovery = Date.now();
		}

		this._context.acceptResult(result);
	}


	private _deferDiscovery(taskIds: readonly string[] | undefined): void {
		if (taskIds) {
			for (const taskId of taskIds) {
				this._pendingTaskIds.add(taskId);
			}
		} else {
			this._discoveryDeferred = true;
		}
	}

	constructor(
		private readonly _context: ICloudSandboxDiscoveryContext,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._inactiveSince = this._context.focused ? undefined : Date.now();
	}

	get archiveState(): IObservable<CloudSandboxArchiveDiscoveryState> { return this._archiveState; }

	setArchivedRequested(requested: boolean): void {
		this._archivesRequested = requested;
		if (requested && (!this._archivesLoaded || this._archiveState.get() === 'error')) {
			void this.refresh();
		}
	}

	invalidate(): void {
		this._sessionMutationVersion++;
	}

	resetFeed(): void {
		for (const taskId of this._sessionFeed.value?.takePendingTaskIds() ?? []) {
			this._pendingTaskIds.add(taskId);
		}
		this._sessionFeed.clear();
		void this._refreshPendingTasks();
		void this.refresh({ incremental: true, trigger: 'configurationChange', retry: true });
	}

	reset(): void {
		this._sessionFeed.clear();
		this._discoveryPoll.cancel();
		this._pendingTaskIds.clear();
		this._lastDiscoveryAttempt = undefined;
		this._discoveryDeferred = false;
		this._lastFullDiscovery = undefined;
		this._archivesLoaded = false;
		this._archiveState.set('idle', undefined);
		this._discoveryRetryInterval = DISCOVERY_POLL_INTERVAL_MS;
	}
}
