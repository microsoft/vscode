/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { watchFile, unwatchFile, Stats } from 'fs';
import { Disposable, DisposableMap, toDisposable } from 'vs/base/common/lifecycle';
import { ILogMessage, IUniversalWatchRequest, IWatcher } from 'vs/platform/files/common/watcher';
import { Event } from 'vs/base/common/event';
import { IFileChange } from 'vs/platform/files/common/files';

export abstract class BaseWatcher extends Disposable implements IWatcher {

	private mapWatchRequestToCorrelationId = this._register(new DisposableMap<number>());

	private watchRequests: IUniversalWatchRequest[] = [];

	async watch(requests: IUniversalWatchRequest[]): Promise<void> {
		this.watchRequests = requests;

		const correlationIds = new Set<number>();
		for (const request of requests) {

			// Request with correlation: watch file to support
			// watching paths that do not exist yet or are
			// potentially being deleted and recreated.

			if (typeof request.correlationId === 'number') {
				correlationIds.add(request.correlationId);

				if (!this.mapWatchRequestToCorrelationId.has(request.correlationId)) {
					let disposed = false;
					let requestPathEnoent = false;

					const watchRequestCallback: (curr: Stats, prev: Stats) => void = (curr, prev) => {
						if (disposed) {
							return; // return early if already disposed
						}

						const currentEnoent = this.isEnoent(curr);
						const previousEnoent = this.isEnoent(prev);

						const oldRequestPathEnoent = requestPathEnoent;
						requestPathEnoent = currentEnoent;

						// Watch path created
						if (
							(previousEnoent && !currentEnoent) ||						// file was created
							(oldRequestPathEnoent && !currentEnoent && !previousEnoent)	// file was created from a rename
						) {
							this.trace(`fs.watchFile() detected CREATE on ${request.path} (correlationId: ${request.correlationId})`);

							this.doWatch(this.watchRequests);
						}

						// Watch path deleted or non-existent
						else if (currentEnoent) {
							this.trace(`fs.watchFile() detected ENOENT on ${request.path} (correlationId: ${request.correlationId})`);

							this.doWatch(this.watchRequests.filter(watchRequest => watchRequest.correlationId !== request.correlationId));
						}
					};

					this.trace(`starting fs.watchFile() on ${request.path} (correlationId: ${request.correlationId})`);
					watchFile(request.path, { persistent: false }, watchRequestCallback);

					this.mapWatchRequestToCorrelationId.set(request.correlationId, toDisposable(() => {
						this.trace(`stopping fs.watchFile() on ${request.path} (correlationId: ${request.correlationId})`);

						disposed = true;
						unwatchFile(request.path, watchRequestCallback);
					}));
				}
			}
		}

		// Remove all correlation ids that are no longer
		// needed because the request is no longer there
		for (const [correlationId] of this.mapWatchRequestToCorrelationId) {
			if (!correlationIds.has(correlationId)) {
				this.mapWatchRequestToCorrelationId.deleteAndDispose(correlationId);
			}
		}

		return this.doWatch(requests);
	}

	private isEnoent(stats: Stats): boolean {
		return stats.ctimeMs === 0 && stats.ino === 0;
	}

	protected shouldRestartWatching(request: IUniversalWatchRequest): boolean {
		return typeof request.correlationId !== 'number';
	}

	protected abstract doWatch(requests: IUniversalWatchRequest[]): Promise<void>;

	protected abstract warn(message: string): void;
	protected abstract trace(message: string): void;

	abstract onDidChangeFile: Event<IFileChange[]>;
	abstract onDidLogMessage: Event<ILogMessage>;
	abstract onDidError: Event<string>;
	abstract setVerboseLogging(enabled: boolean): Promise<void>;
	abstract stop(): Promise<void>;
}
