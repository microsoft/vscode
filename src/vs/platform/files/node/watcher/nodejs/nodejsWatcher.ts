/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { patternsEquals } from 'vs/base/common/glob';
import { BaseWatcher } from 'vs/platform/files/node/watcher/baseWatcher';
import { isLinux } from 'vs/base/common/platform';
import { INonRecursiveWatchRequest, INonRecursiveWatcher } from 'vs/platform/files/common/watcher';
import { NodeJSFileWatcherLibrary } from 'vs/platform/files/node/watcher/nodejs/nodejsWatcherLib';

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

	protected readonly watchers = new Map<string, INodeJSWatcherInstance>();

	private verboseLogging = false;

	protected override async doWatch(requests: INonRecursiveWatchRequest[]): Promise<void> {

		// Figure out duplicates to remove from the requests
		const normalizedRequests = this.normalizeRequests(requests);

		// Gather paths that we should start watching
		const requestsToStartWatching = normalizedRequests.filter(request => {
			const watcher = this.watchers.get(request.path);
			if (!watcher) {
				return true; // not yet watching that path
			}

			// Re-watch path if excludes or includes have changed
			return !patternsEquals(watcher.request.excludes, request.excludes) || !patternsEquals(watcher.request.includes, request.includes);
		});

		// Gather paths that we should stop watching
		const pathsToStopWatching = Array.from(this.watchers.values()).filter(({ request }) => {
			return !normalizedRequests.find(normalizedRequest => normalizedRequest.path === request.path && patternsEquals(normalizedRequest.excludes, request.excludes) && patternsEquals(normalizedRequest.includes, request.includes));
		}).map(({ request }) => request.path);

		// Logging

		if (requestsToStartWatching.length) {
			this.trace(`Request to start watching: ${requestsToStartWatching.map(request => `${request.path} (excludes: ${request.excludes.length > 0 ? request.excludes : '<none>'}, includes: ${request.includes && request.includes.length > 0 ? JSON.stringify(request.includes) : '<all>'}, correlationId: ${typeof request.correlationId === 'number' ? request.correlationId : '<none>'})`).join(',')}`);
		}

		if (pathsToStopWatching.length) {
			this.trace(`Request to stop watching: ${pathsToStopWatching.join(',')}`);
		}

		// Stop watching as instructed
		for (const pathToStopWatching of pathsToStopWatching) {
			this.stopWatching(pathToStopWatching);
		}

		// Start watching as instructed
		for (const request of requestsToStartWatching) {
			this.startWatching(request);
		}
	}

	private startWatching(request: INonRecursiveWatchRequest): void {

		// Start via node.js lib
		const instance = new NodeJSFileWatcherLibrary(request, changes => this._onDidChangeFile.fire(changes), () => this._onDidWatchFail.fire(request), msg => this._onDidLogMessage.fire(msg), this.verboseLogging);

		// Remember as watcher instance
		const watcher: INodeJSWatcherInstance = { request, instance };
		this.watchers.set(request.path, watcher);
	}

	override async stop(): Promise<void> {
		await super.stop();

		for (const [path] of this.watchers) {
			this.stopWatching(path);
		}

		this.watchers.clear();
	}

	private stopWatching(path: string): void {
		const watcher = this.watchers.get(path);
		if (watcher) {
			this.watchers.delete(path);

			watcher.instance.dispose();
		}
	}

	private normalizeRequests(requests: INonRecursiveWatchRequest[]): INonRecursiveWatchRequest[] {
		const mapCorrelationtoRequests = new Map<number | undefined /* correlation */, Map<string, INonRecursiveWatchRequest>>();

		// Ignore requests for the same paths that have the same correlation
		for (const request of requests) {
			const path = isLinux ? request.path : request.path.toLowerCase(); // adjust for case sensitivity

			let requestsForCorrelation = mapCorrelationtoRequests.get(request.correlationId);
			if (!requestsForCorrelation) {
				requestsForCorrelation = new Map<string, INonRecursiveWatchRequest>();
				mapCorrelationtoRequests.set(request.correlationId, requestsForCorrelation);
			}

			requestsForCorrelation.set(path, request);
		}

		return Array.from(mapCorrelationtoRequests.values()).map(requests => Array.from(requests.values())).flat();
	}

	async setVerboseLogging(enabled: boolean): Promise<void> {
		this.verboseLogging = enabled;

		for (const [, watcher] of this.watchers) {
			watcher.instance.setVerboseLogging(enabled);
		}
	}

	protected trace(message: string): void {
		if (this.verboseLogging) {
			this._onDidLogMessage.fire({ type: 'trace', message: this.toMessage(message) });
		}
	}

	protected warn(message: string): void {
		if (this.verboseLogging) {
			this._onDidLogMessage.fire({ type: 'warn', message: this.toMessage(message) });
		}
	}

	private toMessage(message: string): string {
		return `[File Watcher (node.js)] ${message}`;
	}
}
