/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { watchFile, unwatchFile, Stats } from 'fs';
import { Disposable, DisposableMap, DisposableStore, toDisposable } from 'vs/base/common/lifecycle';
import { ILogMessage, IRecursiveWatcherWithSubscribe, IUniversalWatchRequest, IWatchRequestWithCorrelation, IWatcher, IWatcherErrorEvent, isWatchRequestWithCorrelation, requestFilterToString } from 'vs/platform/files/common/watcher';
import { Emitter, Event } from 'vs/base/common/event';
import { FileChangeType, IFileChange } from 'vs/platform/files/common/files';
import { URI } from 'vs/base/common/uri';
import { DeferredPromise, ThrottledDelayer } from 'vs/base/common/async';

export abstract class BaseWatcher extends Disposable implements IWatcher {

	protected readonly _onDidChangeFile = this._register(new Emitter<IFileChange[]>());
	readonly onDidChangeFile = this._onDidChangeFile.event;

	protected readonly _onDidLogMessage = this._register(new Emitter<ILogMessage>());
	readonly onDidLogMessage = this._onDidLogMessage.event;

	protected readonly _onDidWatchFail = this._register(new Emitter<IUniversalWatchRequest>());
	private readonly onDidWatchFail = this._onDidWatchFail.event;

	private readonly allNonCorrelatedWatchRequests = new Set<IUniversalWatchRequest>();
	private readonly allCorrelatedWatchRequests = new Map<number /* correlation ID */, IWatchRequestWithCorrelation>();

	private readonly suspendedWatchRequests = this._register(new DisposableMap<number /* correlation ID */>());
	private readonly suspendedWatchRequestsWithPolling = new Set<number /* correlation ID */>();

	private readonly updateWatchersDelayer = this._register(new ThrottledDelayer<void>(this.getUpdateWatchersDelay()));

	protected readonly suspendedWatchRequestPollingInterval: number = 5007; // node.js default

	private joinWatch = new DeferredPromise<void>();

	constructor() {
		super();

		this._register(this.onDidWatchFail(request => this.handleDidWatchFail(request)));
	}

	private handleDidWatchFail(request: IUniversalWatchRequest): void {
		if (!this.isCorrelated(request)) {

			// For now, limit failed watch monitoring to requests with a correlationId
			// to experiment with this feature in a controlled way. Monitoring requests
			// requires us to install polling watchers (via `fs.watchFile()`) and thus
			// should be used sparingly.
			//
			// TODO@bpasero revisit this in the future to have a more general approach
			// for suspend/resume and drop the `legacyMonitorRequest` in parcel.
			// One issue is that we need to be able to uniquely identify a request and
			// without correlation that is actually harder...

			return;
		}

		this.suspendWatchRequest(request);
	}

	protected isCorrelated(request: IUniversalWatchRequest): request is IWatchRequestWithCorrelation {
		return isWatchRequestWithCorrelation(request);
	}

	async watch(requests: IUniversalWatchRequest[]): Promise<void> {
		if (!this.joinWatch.isSettled) {
			this.joinWatch.complete();
		}
		this.joinWatch = new DeferredPromise<void>();

		try {
			this.allCorrelatedWatchRequests.clear();
			this.allNonCorrelatedWatchRequests.clear();

			// Figure out correlated vs. non-correlated requests
			for (const request of requests) {
				if (this.isCorrelated(request)) {
					this.allCorrelatedWatchRequests.set(request.correlationId, request);
				} else {
					this.allNonCorrelatedWatchRequests.add(request);
				}
			}

			// Remove all suspended correlated watch requests that are no longer watched
			for (const [correlationId] of this.suspendedWatchRequests) {
				if (!this.allCorrelatedWatchRequests.has(correlationId)) {
					this.suspendedWatchRequests.deleteAndDispose(correlationId);
					this.suspendedWatchRequestsWithPolling.delete(correlationId);
				}
			}

			return await this.updateWatchers(false /* not delayed */);
		} finally {
			this.joinWatch.complete();
		}
	}

	private updateWatchers(delayed: boolean): Promise<void> {
		return this.updateWatchersDelayer.trigger(() => this.doWatch([
			...this.allNonCorrelatedWatchRequests,
			...Array.from(this.allCorrelatedWatchRequests.values()).filter(request => !this.suspendedWatchRequests.has(request.correlationId))
		]), delayed ? this.getUpdateWatchersDelay() : 0);
	}

	protected getUpdateWatchersDelay(): number {
		return 800;
	}

	isSuspended(request: IUniversalWatchRequest): 'polling' | boolean {
		if (typeof request.correlationId !== 'number') {
			return false;
		}

		return this.suspendedWatchRequestsWithPolling.has(request.correlationId) ? 'polling' : this.suspendedWatchRequests.has(request.correlationId);
	}

	private async suspendWatchRequest(request: IWatchRequestWithCorrelation): Promise<void> {
		if (this.suspendedWatchRequests.has(request.correlationId)) {
			return; // already suspended
		}

		const disposables = new DisposableStore();
		this.suspendedWatchRequests.set(request.correlationId, disposables);

		// It is possible that a watch request fails right during watch()
		// phase while other requests succeed. To increase the chance of
		// reusing another watcher for suspend/resume tracking, we await
		// all watch requests having processed.

		await this.joinWatch.p;

		if (disposables.isDisposed) {
			return;
		}

		this.monitorSuspendedWatchRequest(request, disposables);

		this.updateWatchers(true /* delay this call as we might accumulate many failing watch requests on startup */);
	}

	private resumeWatchRequest(request: IWatchRequestWithCorrelation): void {
		this.suspendedWatchRequests.deleteAndDispose(request.correlationId);
		this.suspendedWatchRequestsWithPolling.delete(request.correlationId);

		this.updateWatchers(false);
	}

	private monitorSuspendedWatchRequest(request: IWatchRequestWithCorrelation, disposables: DisposableStore): void {
		if (this.doMonitorWithExistingWatcher(request, disposables)) {
			this.trace(`reusing an existing recursive watcher to monitor ${request.path}`);
			this.suspendedWatchRequestsWithPolling.delete(request.correlationId);
		} else {
			this.doMonitorWithNodeJS(request, disposables);
			this.suspendedWatchRequestsWithPolling.add(request.correlationId);
		}
	}

	private doMonitorWithExistingWatcher(request: IWatchRequestWithCorrelation, disposables: DisposableStore): boolean {
		const subscription = this.recursiveWatcher?.subscribe(request.path, (error, change) => {
			if (disposables.isDisposed) {
				return; // return early if already disposed
			}

			if (error) {
				this.monitorSuspendedWatchRequest(request, disposables);
			} else if (change?.type === FileChangeType.ADDED) {
				this.onMonitoredPathAdded(request);
			}
		});

		if (subscription) {
			disposables.add(subscription);

			return true;
		}

		return false;
	}

	private doMonitorWithNodeJS(request: IWatchRequestWithCorrelation, disposables: DisposableStore): void {
		let pathNotFound = false;

		const watchFileCallback: (curr: Stats, prev: Stats) => void = (curr, prev) => {
			if (disposables.isDisposed) {
				return; // return early if already disposed
			}

			const currentPathNotFound = this.isPathNotFound(curr);
			const previousPathNotFound = this.isPathNotFound(prev);
			const oldPathNotFound = pathNotFound;
			pathNotFound = currentPathNotFound;

			// Watch path created: resume watching request
			if (!currentPathNotFound && (previousPathNotFound || oldPathNotFound)) {
				this.onMonitoredPathAdded(request);
			}
		};

		this.trace(`starting fs.watchFile() on ${request.path} (correlationId: ${request.correlationId})`);
		try {
			watchFile(request.path, { persistent: false, interval: this.suspendedWatchRequestPollingInterval }, watchFileCallback);
		} catch (error) {
			this.warn(`fs.watchFile() failed with error ${error} on path ${request.path} (correlationId: ${request.correlationId})`);
		}

		disposables.add(toDisposable(() => {
			this.trace(`stopping fs.watchFile() on ${request.path} (correlationId: ${request.correlationId})`);

			try {
				unwatchFile(request.path, watchFileCallback);
			} catch (error) {
				this.warn(`fs.unwatchFile() failed with error ${error} on path ${request.path} (correlationId: ${request.correlationId})`);
			}
		}));
	}

	private onMonitoredPathAdded(request: IWatchRequestWithCorrelation) {
		this.trace(`detected ${request.path} exists again, resuming watcher (correlationId: ${request.correlationId})`);

		// Emit as event
		const event: IFileChange = { resource: URI.file(request.path), type: FileChangeType.ADDED, cId: request.correlationId };
		this._onDidChangeFile.fire([event]);
		this.traceEvent(event, request);

		// Resume watching
		this.resumeWatchRequest(request);
	}

	private isPathNotFound(stats: Stats): boolean {
		return stats.ctimeMs === 0 && stats.ino === 0;
	}

	async stop(): Promise<void> {
		this.suspendedWatchRequests.clearAndDisposeAll();
		this.suspendedWatchRequestsWithPolling.clear();
	}

	protected traceEvent(event: IFileChange, request: IUniversalWatchRequest): void {
		if (this.verboseLogging) {
			const traceMsg = ` >> normalized ${event.type === FileChangeType.ADDED ? '[ADDED]' : event.type === FileChangeType.DELETED ? '[DELETED]' : '[CHANGED]'} ${event.resource.fsPath}`;
			this.traceWithCorrelation(traceMsg, request);
		}
	}

	protected traceWithCorrelation(message: string, request: IUniversalWatchRequest): void {
		if (this.verboseLogging) {
			this.trace(`${message}${typeof request.correlationId === 'number' ? ` <${request.correlationId}> ` : ``}`);
		}
	}

	protected requestToString(request: IUniversalWatchRequest): string {
		return `${request.path} (excludes: ${request.excludes.length > 0 ? request.excludes : '<none>'}, includes: ${request.includes && request.includes.length > 0 ? JSON.stringify(request.includes) : '<all>'}, filter: ${requestFilterToString(request.filter)}, correlationId: ${typeof request.correlationId === 'number' ? request.correlationId : '<none>'})`;
	}

	protected abstract doWatch(requests: IUniversalWatchRequest[]): Promise<void>;

	protected abstract readonly recursiveWatcher: IRecursiveWatcherWithSubscribe | undefined;

	protected abstract trace(message: string): void;
	protected abstract warn(message: string): void;

	abstract onDidError: Event<IWatcherErrorEvent>;

	protected verboseLogging = false;

	async setVerboseLogging(enabled: boolean): Promise<void> {
		this.verboseLogging = enabled;
	}
}
