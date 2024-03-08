/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { watchFile, unwatchFile, Stats } from 'fs';
import { Disposable, DisposableMap, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { ILogMessage, IUniversalWatchRequest, IWatcher } from 'vs/platform/files/common/watcher';
import { Emitter, Event } from 'vs/base/common/event';
import { FileChangeType, IFileChange } from 'vs/platform/files/common/files';
import { URI } from 'vs/base/common/uri';

export abstract class BaseWatcher extends Disposable implements IWatcher {

	protected readonly _onDidChangeFile = this._register(new Emitter<IFileChange[]>());
	readonly onDidChangeFile = this._onDidChangeFile.event;

	protected readonly _onDidLogMessage = this._register(new Emitter<ILogMessage>());
	readonly onDidLogMessage = this._onDidLogMessage.event;

	private mapWatchMissingRequestPathToCorrelationId = this._register(new DisposableMap<number>());

	private allWatchRequests = new Set<IUniversalWatchRequest>();
	private suspendedWatchRequests = new Set<IUniversalWatchRequest>();

	protected readonly missingRequestPathPollingInterval: number | undefined;

	async watch(requests: IUniversalWatchRequest[]): Promise<void> {
		this.allWatchRequests = new Set([...requests]);

		const correlationIds = new Set<number>();
		for (const request of requests) {

			// Request with correlation: watch request path to support
			// watching paths that do not exist yet or are potentially
			// being deleted and recreated.
			//
			// We are not doing this for all watch requests yet to see
			// how it goes, thus its limitd to correlated requests.

			if (typeof request.correlationId === 'number') {
				correlationIds.add(request.correlationId);

				if (!this.mapWatchMissingRequestPathToCorrelationId.has(request.correlationId)) {
					this.mapWatchMissingRequestPathToCorrelationId.set(request.correlationId, this.watchMissingRequestPath(request));
				}
			}
		}

		// Remove all watched correlated paths that are no longer
		// needed because the request is no longer there
		for (const [correlationId] of this.mapWatchMissingRequestPathToCorrelationId) {
			if (!correlationIds.has(correlationId)) {
				this.mapWatchMissingRequestPathToCorrelationId.deleteAndDispose(correlationId);
			}
		}

		// Remove all suspended requests that are no longer needed
		for (const request of this.suspendedWatchRequests) {
			if (!this.allWatchRequests.has(request)) {
				this.suspendedWatchRequests.delete(request);
			}
		}

		return this.updateWatchers();
	}

	private updateWatchers(): Promise<void> {
		return this.doWatch(Array.from(this.allWatchRequests).filter(request => !this.suspendedWatchRequests.has(request)));
	}

	private watchMissingRequestPath(request: IUniversalWatchRequest): IDisposable {
		if (typeof request.correlationId !== 'number') {
			return Disposable.None; // for now limit this to correlated watch requests only (reduces surface)
		}

		const that = this;
		const resource = URI.file(request.path);

		let disposed = false;
		let pathNotFound = false;

		const watchFileCallback: (curr: Stats, prev: Stats) => void = (curr, prev) => {
			if (disposed) {
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

				this.suspendedWatchRequests.delete(request);
				this.updateWatchers();
			}

			// Watch path deleted or never existed: suspend watching request
			else if (currentPathNotFound) {
				this.trace(`fs.watchFile() detected ${request.path} not found, suspending watcher (correlationId: ${request.correlationId})`);

				if (!previousPathNotFound) {
					const event: IFileChange = { resource, type: FileChangeType.DELETED, cId: request.correlationId };
					that._onDidChangeFile.fire([event]);
					this.traceEvent(event, request);
				}

				this.suspendedWatchRequests.add(request);
				this.updateWatchers();
			}
		};

		this.trace(`starting fs.watchFile() on ${request.path} (correlationId: ${request.correlationId})`);
		try {
			watchFile(request.path, { persistent: false, interval: this.missingRequestPathPollingInterval }, watchFileCallback);
		} catch (error) {
			this.warn(`fs.watchFile() failed with error ${error} on path ${request.path} (correlationId: ${request.correlationId})`);

			return Disposable.None;
		}

		return toDisposable(() => {
			this.trace(`stopping fs.watchFile() on ${request.path} (correlationId: ${request.correlationId})`);

			disposed = true;

			this.suspendedWatchRequests.delete(request);

			try {
				unwatchFile(request.path, watchFileCallback);
			} catch (error) {
				this.warn(`fs.unwatchFile() failed with error ${error} on path ${request.path} (correlationId: ${request.correlationId})`);
			}
		});
	}

	private isPathNotFound(stats: Stats): boolean {
		return stats.ctimeMs === 0 && stats.ino === 0;
	}

	async stop(): Promise<void> {
		this.mapWatchMissingRequestPathToCorrelationId.clearAndDisposeAll();
		this.suspendedWatchRequests.clear();
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
