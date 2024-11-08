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
import { isEqual } from '../../../../../base/common/extpath.js';

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

	readonly watchers = new Set<INodeJSWatcherInstance>();

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
			const watcher = this.findWatcher(request);
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

		// Stop watching as instructed
		for (const watcher of watchersToStop) {
			this.stopWatching(watcher);
		}

		// Start watching as instructed
		for (const request of requestsToStart) {
			this.startWatching(request);
		}
	}

	private findWatcher(request: INonRecursiveWatchRequest): INodeJSWatcherInstance | undefined {
		for (const watcher of this.watchers) {

			// Requests or watchers with correlation always match on that
			if (typeof request.correlationId === 'number' || typeof watcher.request.correlationId === 'number') {
				if (watcher.request.correlationId === request.correlationId) {
					return watcher;
				}
			}

			// Non-correlated requests or watchers match on path
			else {
				if (isEqual(watcher.request.path, request.path, !isLinux /* ignorecase */)) {
					return watcher;
				}
			}
		}

		return undefined;
	}

	private startWatching(request: INonRecursiveWatchRequest): void {

		// Start via node.js lib
		const instance = new NodeJSFileWatcherLibrary(request, this.recursiveWatcher, changes => this._onDidChangeFile.fire(changes), () => this._onDidWatchFail.fire(request), msg => this._onDidLogMessage.fire(msg), this.verboseLogging);

		// Remember as watcher instance
		const watcher: INodeJSWatcherInstance = { request, instance };
		this.watchers.add(watcher);
	}

	override async stop(): Promise<void> {
		await super.stop();

		for (const watcher of this.watchers) {
			this.stopWatching(watcher);
		}
	}

	private stopWatching(watcher: INodeJSWatcherInstance): void {
		this.trace(`stopping file watcher`, watcher);

		this.watchers.delete(watcher);

		watcher.instance.dispose();
	}

	private removeDuplicateRequests(requests: INonRecursiveWatchRequest[]): INonRecursiveWatchRequest[] {
		const mapCorrelationtoRequests = new Map<number | undefined /* correlation */, Map<string, INonRecursiveWatchRequest>>();

		// Ignore requests for the same paths that have the same correlation
		for (const request of requests) {
			const path = isLinux ? request.path : request.path.toLowerCase(); // adjust for case sensitivity

			let requestsForCorrelation = mapCorrelationtoRequests.get(request.correlationId);
			if (!requestsForCorrelation) {
				requestsForCorrelation = new Map<string, INonRecursiveWatchRequest>();
				mapCorrelationtoRequests.set(request.correlationId, requestsForCorrelation);
			}

			if (requestsForCorrelation.has(path)) {
				this.trace(`ignoring a request for watching who's path is already watched: ${this.requestToString(request)}`);
			}

			requestsForCorrelation.set(path, request);
		}

		return Array.from(mapCorrelationtoRequests.values()).map(requests => Array.from(requests.values())).flat();
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
