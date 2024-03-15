/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { watchFile, unwatchFile, Stats } from 'fs';
import { Disposable, DisposableMap, DisposableStore, toDisposable } from 'vs/base/common/lifecycle';
import { ILogMessage, IUniversalWatchRequest, IWatchRequestWithCorrelation, IWatcher, isWatchRequestWithCorrelation } from 'vs/platform/files/common/watcher';
import { Emitter, Event } from 'vs/base/common/event';
import { FileChangeType, IFileChange } from 'vs/platform/files/common/files';
import { URI } from 'vs/base/common/uri';

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

	protected readonly suspendedWatchRequestPollingInterval: number = 5007; // node.js default

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

			return;
		}

		this.suspendWatchRequest(request);
	}

	protected isCorrelated(request: IUniversalWatchRequest): request is IWatchRequestWithCorrelation {
		return isWatchRequestWithCorrelation(request);
	}

	async watch(requests: IUniversalWatchRequest[]): Promise<void> {
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
			}
		}

		return this.updateWatchers();
	}

	private updateWatchers(): Promise<void> {
		return this.doWatch([
			...this.allNonCorrelatedWatchRequests,
			...Array.from(this.allCorrelatedWatchRequests.values()).filter(request => !this.suspendedWatchRequests.has(request.correlationId))
		]);
	}

	private suspendWatchRequest(request: IWatchRequestWithCorrelation): void {
		if (this.suspendedWatchRequests.has(request.correlationId)) {
			return; // already suspended
		}

		const disposables = new DisposableStore();
		this.suspendedWatchRequests.set(request.correlationId, disposables);

		this.monitorSuspendedWatchRequest(request, disposables);

		this.updateWatchers();
	}

	private resumeWatchRequest(request: IWatchRequestWithCorrelation): void {
		this.suspendedWatchRequests.deleteAndDispose(request.correlationId);

		this.updateWatchers();
	}

	private monitorSuspendedWatchRequest(request: IWatchRequestWithCorrelation, disposables: DisposableStore) {
		const resource = URI.file(request.path);
		const that = this;

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
				this.trace(`fs.watchFile() detected ${request.path} exists again, resuming watcher (correlationId: ${request.correlationId})`);

				// Emit as event
				const event: IFileChange = { resource, type: FileChangeType.ADDED, cId: request.correlationId };
				that._onDidChangeFile.fire([event]);
				this.traceEvent(event, request);

				// Resume watching
				this.resumeWatchRequest(request);
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

	private isPathNotFound(stats: Stats): boolean {
		return stats.ctimeMs === 0 && stats.ino === 0;
	}

	async stop(): Promise<void> {
		this.suspendedWatchRequests.clearAndDisposeAll();
	}

	protected traceEvent(event: IFileChange, request: IUniversalWatchRequest): void {
		const traceMsg = ` >> normalized ${event.type === FileChangeType.ADDED ? '[ADDED]' : event.type === FileChangeType.DELETED ? '[DELETED]' : '[CHANGED]'} ${event.resource.fsPath}`;
		this.trace(typeof request.correlationId === 'number' ? `${traceMsg} (correlationId: ${request.correlationId})` : traceMsg);
	}

	protected requestToString(request: IUniversalWatchRequest): string {
		return `${request.path} (excludes: ${request.excludes.length > 0 ? request.excludes : '<none>'}, includes: ${request.includes && request.includes.length > 0 ? JSON.stringify(request.includes) : '<all>'}, correlationId: ${typeof request.correlationId === 'number' ? request.correlationId : '<none>'})`;
	}

	protected abstract doWatch(requests: IUniversalWatchRequest[]): Promise<void>;

	protected abstract trace(message: string): void;
	protected abstract warn(message: string): void;

	abstract onDidError: Event<string>;
	abstract setVerboseLogging(enabled: boolean): Promise<void>;
}
