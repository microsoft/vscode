/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { IUniversalWatcher, IUniversalWatchRequest } from 'vs/platform/files/common/watcher';
import { Emitter, Event } from 'vs/base/common/event';
import { IParcelWatcherInstance, ParcelWatcher } from 'vs/platform/files/node/watcher/parcel/parcelWatcher';
import { NodeJSWatcher } from 'vs/platform/files/node/watcher/nodejs/nodejsWatcher';
import { Promises } from 'vs/base/common/async';
import { Promises as FSPromises } from 'vs/base/node/pfs';
import { TernarySearchTree } from 'vs/base/common/ternarySearchTree';
import { isLinux } from 'vs/base/common/platform';
import { IFileChange } from 'vs/platform/files/common/files';
import { URI } from 'vs/base/common/uri';

export class UniversalWatcher extends Disposable implements IUniversalWatcher {

	private readonly recursiveWatcher = this._register(new ParcelWatcher());

	private readonly nonRecursiveWatcher = this._register(new NodeJSWatcher());
	private readonly nonResursiveSubscriptions = this._register(new DisposableStore());

	private readonly _onDidChangeFile = this._register(new Emitter<IFileChange[]>());
	readonly onDidChangeFile = Event.any(this._onDidChangeFile.event, this.recursiveWatcher.onDidChangeFile, this.nonRecursiveWatcher.onDidChangeFile);

	readonly onDidLogMessage = Event.any(this.recursiveWatcher.onDidLogMessage, this.nonRecursiveWatcher.onDidLogMessage);
	readonly onDidError = Event.any(this.recursiveWatcher.onDidError, this.nonRecursiveWatcher.onDidError);

	async watch(requests: IUniversalWatchRequest[]): Promise<void> {
		this.nonResursiveSubscriptions.clear();

		// Recursive first
		await this.recursiveWatcher.watch(requests.filter(request => request.recursive));

		const recursiveWatchers = TernarySearchTree.forPaths<IParcelWatcherInstance>(!isLinux);
		for (const watcher of this.recursiveWatcher.watchers) {
			recursiveWatchers.set(watcher.request.path, watcher);
		}

		// Non-recursive second
		const nonRecursiveWatchers = new Set(requests.filter(request => !request.recursive));
		for (const nonRecursiveWatcher of nonRecursiveWatchers) {
			try {
				const stat = await FSPromises.stat(nonRecursiveWatcher.path);
				if (!stat.isFile()) {
					continue;
				}

				const existingWatcher = recursiveWatchers.findSubstr(nonRecursiveWatcher.path);
				if (!existingWatcher) {
					continue;
				}

				if (
					existingWatcher.excludes?.some(exclude => exclude(nonRecursiveWatcher.path)) ||
					existingWatcher.includes && !existingWatcher.includes.some(include => include(nonRecursiveWatcher.path))
				) {
					continue;
				}

				nonRecursiveWatchers.delete(nonRecursiveWatcher);


				if (typeof nonRecursiveWatcher.correlationId === 'number') {
					const resource = URI.file(nonRecursiveWatcher.path);

					this.nonResursiveSubscriptions.add(existingWatcher.subscribe(nonRecursiveWatcher.path, type => {
						this._onDidChangeFile.fire([{ type, resource, cId: nonRecursiveWatcher.correlationId }]);
					}));
				}
			} catch (error) {
				// ignore
			}
		}

		await this.recursiveWatcher.watch(Array.from(nonRecursiveWatchers));
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
