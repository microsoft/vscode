/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { watchFile, unwatchFile, Stats } from 'fs';
import { Disposable, DisposableMap, DisposableStore, toDisposable } from 'vs/base/common/lifecycle';
import { ILogMessage, IUniversalWatchRequest, IWatcher } from 'vs/platform/files/common/watcher';
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

	private allWatchRequests = new Set<IUniversalWatchRequest>();
	private suspendedWatchRequests = this._register(new DisposableMap<IUniversalWatchRequest>());

	protected readonly failedRequestPathPollingInterval: number | undefined;

	constructor() {
		super();

		this._register(this.onDidWatchFail(request => this.handleDidWatchFail(request)));
	}

	private handleDidWatchFail(request: IUniversalWatchRequest): void {
		if (typeof request.correlationId !== 'number') {
			return; // for now limit this to correlated watch requests only (monitoring failed requests is experimental)
		}

		this.monitorSuspendedWatchRequest(request);
	}

	async watch(requests: IUniversalWatchRequest[]): Promise<void> {
		this.allWatchRequests = new Set([...requests]);

		// Remove all suspended watch requests that are no longer watched
		for (const [request] of this.suspendedWatchRequests) {
			if (!this.allWatchRequests.has(request)) {
				this.suspendedWatchRequests.deleteAndDispose(request);
			}
		}

		return this.updateWatchers();
	}

	private updateWatchers(): Promise<void> {
		return this.doWatch(Array.from(this.allWatchRequests).filter(request => !this.suspendedWatchRequests.has(request)));
	}

	private monitorSuspendedWatchRequest(request: IUniversalWatchRequest): void {
		if (this.suspendedWatchRequests.has(request)) {
			return; // already monitored
		}

		const disposables = new DisposableStore();
		this.suspendedWatchRequests.set(request, disposables);

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
			if (
				(previousPathNotFound && !currentPathNotFound) || 					// file was created
				(oldPathNotFound && !currentPathNotFound && !previousPathNotFound) 	// file was created from a rename
			) {
				this.trace(`fs.watchFile() detected ${request.path} exists again, resuming watcher (correlationId: ${request.correlationId})`);

				// Emit as event
				const event: IFileChange = { resource, type: FileChangeType.ADDED, cId: request.correlationId };
				that._onDidChangeFile.fire([event]);
				this.traceEvent(event, request);

				// Resume watching
				this.suspendedWatchRequests.deleteAndDispose(request);
				this.updateWatchers();
			}
		};

		this.trace(`starting fs.watchFile() on ${request.path} (correlationId: ${request.correlationId})`);
		try {
			watchFile(request.path, { persistent: false, interval: this.failedRequestPathPollingInterval }, watchFileCallback);
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

	protected shouldRestartWatching(request: IUniversalWatchRequest): boolean {
		return typeof request.correlationId !== 'number';
	}

	protected traceEvent(event: IFileChange, request: IUniversalWatchRequest): void {
		const traceMsg = ` >> normalized ${event.type === FileChangeType.ADDED ? '[ADDED]' : event.type === FileChangeType.DELETED ? '[DELETED]' : '[CHANGED]'} ${event.resource.fsPath}`;
		this.trace(typeof request.correlationId === 'number' ? `${traceMsg} (correlationId: ${request.correlationId})` : traceMsg);
	}

	protected abstract doWatch(requests: IUniversalWatchRequest[]): Promise<void>;

	protected abstract trace(message: string): void;
	protected abstract warn(message: string): void;

	abstract onDidError: Event<string>;
	abstract setVerboseLogging(enabled: boolean): Promise<void>;
}
