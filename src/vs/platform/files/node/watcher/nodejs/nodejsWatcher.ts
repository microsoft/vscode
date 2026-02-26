/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../base/common/event.js';
import { patternsEquals } from '../../../../../base/common/glob.js';
import { BaseWatcher } from '../baseWatcher.js';
import { isLinux } from '../../../../../base/common/platform.js';
import { INonRecursiveWatchRequest, INonRecursiveWatcher, IRecursiveWatcherWithSubscribe } from '../../../common/watcher.js';
import { NodeJSFileWatcherLibrary } from './nodejsWatcherLib.js';
import { ThrottledWorker } from '../../../../../base/common/async.js';
import { MutableDisposable } from '../../../../../base/common/lifecycle.js';

export interface INodeJSWatcherInstance {

	/**
	 * The watcher instance.
	 */
	readonly instance: NodeJSFileWatcherLibrary;

	/**
	 * The watch request associated to the watcher.
	 */
	readonly request: INonRecursiveWatchRequest;
}

export class NodeJSWatcher extends BaseWatcher implements INonRecursiveWatcher {

	readonly onDidError = Event.None;

	private readonly _watchers = new Map<string /* path */ | number /* correlation ID */, INodeJSWatcherInstance>();
	get watchers() { return this._watchers.values(); }

	private readonly worker = this._register(new MutableDisposable<ThrottledWorker<INonRecursiveWatchRequest>>());

	constructor(protected readonly recursiveWatcher: IRecursiveWatcherWithSubscribe | undefined) {
		super();
	}

	protected override async doWatch(requests: INonRecursiveWatchRequest[]): Promise<void> {

		// Figure out duplicates to remove from the requests
		requests = this.removeDuplicateRequests(requests);

		// Figure out which watchers to start and which to stop
		const requestsToStart: INonRecursiveWatchRequest[] = [];
		const watchersToStop = new Set(Array.from(this.watchers));
		for (const request of requests) {
			const watcher = this._watchers.get(this.requestToWatcherKey(request));
			if (watcher && patternsEquals(watcher.request.excludes, request.excludes) && patternsEquals(watcher.request.includes, request.includes)) {
				watchersToStop.delete(watcher); // keep watcher
			} else {
				requestsToStart.push(request); // start watching
			}
		}

		// Logging

		if (requestsToStart.length) {
			this.trace(`Request to start watching: ${requestsToStart.map(request => this.requestToString(request)).join(',')}`);
		}

		if (watchersToStop.size) {
			this.trace(`Request to stop watching: ${Array.from(watchersToStop).map(watcher => this.requestToString(watcher.request)).join(',')}`);
		}

		// Stop the worker
		this.worker.clear();

		// Stop watching as instructed
		for (const watcher of watchersToStop) {
			this.stopWatching(watcher);
		}

		// Start watching as instructed
		this.createWatchWorker().work(requestsToStart);
	}

	private createWatchWorker(): ThrottledWorker<INonRecursiveWatchRequest> {

		// We see very large amount of non-recursive file watcher requests
		// in large workspaces. To prevent the overhead of starting thousands
		// of watchers at once, we use a throttled worker to distribute this
		// work over time.

		this.worker.value = new ThrottledWorker<INonRecursiveWatchRequest>({
			maxWorkChunkSize: 100,				// only start 100 watchers at once before...
			throttleDelay: 100,	  				// ...resting for 100ms until we start watchers again...
			maxBufferedWork: Number.MAX_VALUE 	// ...and never refuse any work.
		}, requests => {
			for (const request of requests) {
				this.startWatching(request);
			}
		});

		return this.worker.value;
	}

	private requestToWatcherKey(request: INonRecursiveWatchRequest): string | number {
		return typeof request.correlationId === 'number' ? request.correlationId : this.pathToWatcherKey(request.path);
	}

	private pathToWatcherKey(path: string): string {
		return isLinux ? path : path.toLowerCase() /* ignore path casing */;
	}

	private startWatching(request: INonRecursiveWatchRequest): void {

		// Start via node.js lib
		const instance = new NodeJSFileWatcherLibrary(request, this.recursiveWatcher, changes => this._onDidChangeFile.fire(changes), () => this._onDidWatchFail.fire(request), msg => this._onDidLogMessage.fire(msg), this.verboseLogging);

		// Remember as watcher instance
		const watcher: INodeJSWatcherInstance = { request, instance };
		this._watchers.set(this.requestToWatcherKey(request), watcher);
	}

	override async stop(): Promise<void> {
		await super.stop();

		for (const watcher of this.watchers) {
			this.stopWatching(watcher);
		}
	}

	private stopWatching(watcher: INodeJSWatcherInstance): void {
		this.trace(`stopping file watcher`, watcher);

		this._watchers.delete(this.requestToWatcherKey(watcher.request));

		watcher.instance.dispose();
	}

	private removeDuplicateRequests(requests: INonRecursiveWatchRequest[]): INonRecursiveWatchRequest[] {
		const mapCorrelationtoRequests = new Map<number | undefined /* correlation */, Map<string, INonRecursiveWatchRequest>>();

		// Ignore requests for the same paths that have the same correlation
		for (const request of requests) {

			let requestsForCorrelation = mapCorrelationtoRequests.get(request.correlationId);
			if (!requestsForCorrelation) {
				requestsForCorrelation = new Map<string, INonRecursiveWatchRequest>();
				mapCorrelationtoRequests.set(request.correlationId, requestsForCorrelation);
			}

			const path = this.pathToWatcherKey(request.path);
			if (requestsForCorrelation.has(path)) {
				this.trace(`ignoring a request for watching who's path is already watched: ${this.requestToString(request)}`);
			}

			requestsForCorrelation.set(path, request);
		}

		return Array.from(mapCorrelationtoRequests.values()).flatMap(requests => Array.from(requests.values()));
	}

	override async setVerboseLogging(enabled: boolean): Promise<void> {
		super.setVerboseLogging(enabled);

		for (const watcher of this.watchers) {
			watcher.instance.setVerboseLogging(enabled);
		}
	}

	protected trace(message: string, watcher?: INodeJSWatcherInstance): void {
		if (this.verboseLogging) {
			this._onDidLogMessage.fire({ type: 'trace', message: this.toMessage(message, watcher) });
		}
	}

	protected warn(message: string): void {
		this._onDidLogMessage.fire({ type: 'warn', message: this.toMessage(message) });
	}

	private toMessage(message: string, watcher?: INodeJSWatcherInstance): string {
		return watcher ? `[File Watcher (node.js)] ${message} (${this.requestToString(watcher.request)})` : `[File Watcher (node.js)] ${message}`;
	}
}
