/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { Disposable } from 'vs/base/common/lifecycle';
import { IDiskFileChange, ILogMessage, INonRecursiveWatcher, INonRecursiveWatchRequest, IRecursiveWatcher, IRecursiveWatchRequest, IUniversalWatcher, IUniversalWatcheRequest } from 'vs/platform/files/common/watcher';
import { Emitter } from 'vs/base/common/event';
import { ParcelWatcher } from 'vs/platform/files/node/watcher/parcel/parcelWatcher';
import { NodeJSWatcher } from 'vs/platform/files/node/watcher/nodejs/nodejsWatcher';
import { Promises } from 'vs/base/common/async';

export class UniversalWatcher extends Disposable implements IUniversalWatcher {

	private readonly _onDidChangeFile = this._register(new Emitter<IDiskFileChange[]>());
	readonly onDidChangeFile = this._onDidChangeFile.event;

	private readonly _onDidLogMessage = this._register(new Emitter<ILogMessage>());
	readonly onDidLogMessage = this._onDidLogMessage.event;

	private readonly _onDidError = this._register(new Emitter<string>());
	readonly onDidError = this._onDidError.event;

	private readonly recursiveWatcher: IRecursiveWatcher;
	private readonly nonRecursiveWatcher: INonRecursiveWatcher;

	constructor() {
		super();

		this.recursiveWatcher = this._register(new ParcelWatcher());
		this.nonRecursiveWatcher = this._register(new NodeJSWatcher());

		this.registerListeners();
	}

	registerListeners() {

		// Recursive watcher
		this.recursiveWatcher.onDidChangeFile(changes => this._onDidChangeFile.fire(changes));
		this.recursiveWatcher.onDidLogMessage(msg => this._onDidLogMessage.fire(msg));
		this.recursiveWatcher.onDidError(error => this._onDidError.fire(error));

		// Non-Recursive watcher
		this.nonRecursiveWatcher.onDidChangeFile(changes => this._onDidChangeFile.fire(changes));
		this.nonRecursiveWatcher.onDidLogMessage(msg => this._onDidLogMessage.fire(msg));
		this.nonRecursiveWatcher.onDidError(error => this._onDidError.fire(error));
	}

	async watch(requests: IUniversalWatcheRequest[]): Promise<void> {
		const recursiveWatcheRequests: IRecursiveWatchRequest[] = [];
		const nonRecursiveWatchRequests: INonRecursiveWatchRequest[] = [];

		for (const request of requests) {
			if (request.recursive) {
				recursiveWatcheRequests.push(request);
			} else {
				nonRecursiveWatchRequests.push(request);
			}
		}

		await Promises.settled([
			this.recursiveWatcher.watch(recursiveWatcheRequests),
			this.nonRecursiveWatcher.watch(nonRecursiveWatchRequests)
		]);
	}

	async setVerboseLogging(enabled: boolean): Promise<void> {
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
