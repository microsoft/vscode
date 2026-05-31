/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { ILogMessage, isRecursiveWatchRequest, IUniversalWatcher, IUniversalWatchRequest } from '../../common/watcher.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { ParcelWatcher } from './parcel/parcelWatcher.js';
import { NodeJSWatcher } from './nodejs/nodejsWatcher.js';
import { Promises } from '../../../../base/common/async.js';
import { computeStats } from './watcherStats.js';

export class UniversalWatcher extends Disposable implements IUniversalWatcher {

	private readonly recursiveWatcher = this._register(new ParcelWatcher());
	private readonly nonRecursiveWatcher = this._register(new NodeJSWatcher(this.recursiveWatcher));

	readonly onDidChangeFile = Event.any(this.recursiveWatcher.onDidChangeFile, this.nonRecursiveWatcher.onDidChangeFile);
	readonly onDidError = Event.any(this.recursiveWatcher.onDidError, this.nonRecursiveWatcher.onDidError);

	private readonly _onDidLogMessage = this._register(new Emitter<ILogMessage>());
	readonly onDidLogMessage = Event.any(this._onDidLogMessage.event, this.recursiveWatcher.onDidLogMessage, this.nonRecursiveWatcher.onDidLogMessage);

	private requests: IUniversalWatchRequest[] = [];
	private failedRecursiveRequests = 0;

	constructor() {
		super();

		this._register(this.recursiveWatcher.onDidError(e => {
			if (e.request) {
				this.failedRecursiveRequests++;
			}
		}));
	}

	async watch(requests: IUniversalWatchRequest[]): Promise<void> {
		this.requests = requests;
		this.failedRecursiveRequests = 0;

		// Watch recursively first to give recursive watchers a chance
		// to step in for non-recursive watch requests, thus reducing
		// watcher duplication.

		let error: Error | undefined;
		try {
			await this.recursiveWatcher.watch(requests.filter(request => isRecursiveWatchRequest(request)));
		} catch (e) {
			error = e;
		}

		try {
			await this.nonRecursiveWatcher.watch(requests.filter(request => !isRecursiveWatchRequest(request)));
		} catch (e) {
			if (!error) {
				error = e;
			}
		}

		if (error) {
			throw error;
		}
	}

	async setVerboseLogging(enabled: boolean): Promise<void> {

		// Log stats
		if (enabled && this.requests.length > 0) {
			this._onDidLogMessage.fire({ type: 'trace', message: computeStats(this.requests, this.failedRecursiveRequests, this.recursiveWatcher, this.nonRecursiveWatcher) });
		}

		// Forward to watchers
		await Promises.settled([
			this.recursiveWatcher.setVerboseLogging(enabled),
			this.nonRecursiveWatcher.setVerboseLogging(enabled)
		]);
	}

	async stop(): Promise<void> {
		await Promises.settled([
			this.recursiveWatcher.stop(),
			this.nonRecursiveWatcher.stop()
		]);
	}
}
