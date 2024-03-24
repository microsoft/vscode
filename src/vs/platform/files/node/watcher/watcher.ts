/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { ILogMessage, IUniversalWatcher, IUniversalWatchRequest } from 'vs/platform/files/common/watcher';
import { Emitter, Event } from 'vs/base/common/event';
import { ParcelWatcher } from 'vs/platform/files/node/watcher/parcel/parcelWatcher';
import { NodeJSWatcher } from 'vs/platform/files/node/watcher/nodejs/nodejsWatcher';
import { Promises } from 'vs/base/common/async';

export class UniversalWatcher extends Disposable implements IUniversalWatcher {

	private readonly recursiveWatcher = this._register(new ParcelWatcher());
	private readonly nonRecursiveWatcher = this._register(new NodeJSWatcher(this.recursiveWatcher));

	readonly onDidChangeFile = Event.any(this.recursiveWatcher.onDidChangeFile, this.nonRecursiveWatcher.onDidChangeFile);
	readonly onDidError = Event.any(this.recursiveWatcher.onDidError, this.nonRecursiveWatcher.onDidError);

	private readonly _onDidLogMessage = this._register(new Emitter<ILogMessage>());
	readonly onDidLogMessage = Event.any(this._onDidLogMessage.event, this.recursiveWatcher.onDidLogMessage, this.nonRecursiveWatcher.onDidLogMessage);

	private requests: IUniversalWatchRequest[] = [];

	async watch(requests: IUniversalWatchRequest[]): Promise<void> {
		this.requests = requests;

		// Watch recursively first to give recursive watchers a chance
		// to step in for non-recursive watch requests, thus reducing
		// watcher duplication.

		await this.recursiveWatcher.watch(requests.filter(request => request.recursive));
		await this.nonRecursiveWatcher.watch(requests.filter(request => !request.recursive));
	}

	async setVerboseLogging(enabled: boolean): Promise<void> {
		this.logRequestStats();

		await Promises.settled([
			this.recursiveWatcher.setVerboseLogging(enabled),
			this.nonRecursiveWatcher.setVerboseLogging(enabled)
		]);
	}

	private logRequestStats(): void {
		const recursiveRequests = this.requests.filter(request => request.recursive);
		recursiveRequests.sort((r1, r2) => r1.path.length - r2.path.length);
		const nonRecursiveRequests = this.requests.filter(request => !request.recursive);
		nonRecursiveRequests.sort((r1, r2) => r1.path.length - r2.path.length);

		const lines: string[] = [];

		lines.push(`[Recursive Requests (${recursiveRequests.length})]:`);
		for (const request of recursiveRequests) {
			this.fillRequestStats(lines, request, this.recursiveWatcher);
		}

		lines.push(`\n[Non-Recursive Requests (${nonRecursiveRequests.length})]:`);
		for (const request of nonRecursiveRequests) {
			this.fillRequestStats(lines, request, this.nonRecursiveWatcher);
		}

		this.recursiveWatcher.fillRequestStats(lines);
		this.nonRecursiveWatcher.fillRequestStats(lines);

		let maxLength = 0;
		for (const line of lines) {
			maxLength = Math.max(maxLength, line.split('\t')[0].length);
		}

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const parts = line.split('\t');
			if (parts.length === 2) {
				const padding = ' '.repeat(maxLength - parts[0].length);
				lines[i] = `${parts[0]}${padding}\t${parts[1]}`;
			}
		}

		this._onDidLogMessage.fire({ type: 'trace', message: `\n\n[File Watcher] request stats:\n\n${lines.join('\n')}\n\n` });
	}

	private fillRequestStats(lines: string[], request: IUniversalWatchRequest, watcher: ParcelWatcher | NodeJSWatcher): void {
		const decorations = [];
		const suspended = watcher.isSuspended(request);
		if (suspended !== false) {
			decorations.push('[SUSPENDED]');
		}
		if (suspended === 'polling') {
			decorations.push('[POLLING]');
		}
		lines.push(`- ${request.path}\t${decorations.length > 0 ? decorations.join(' ') + ' ' : ''}(${this.requestDetailsToString(request)})`);
	}

	protected requestDetailsToString(request: IUniversalWatchRequest): string {
		return `excludes: ${request.excludes.length > 0 ? request.excludes : '<none>'}, includes: ${request.includes && request.includes.length > 0 ? JSON.stringify(request.includes) : '<all>'}, correlationId: ${typeof request.correlationId === 'number' ? request.correlationId : '<none>'})`;
	}

	async stop(): Promise<void> {
		await Promises.settled([
			this.recursiveWatcher.stop(),
			this.nonRecursiveWatcher.stop()
		]);
	}
}
