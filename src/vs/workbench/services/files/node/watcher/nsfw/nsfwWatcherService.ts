/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as glob from 'vs/base/common/glob';
import * as path from 'path';
import * as watcher from 'vs/workbench/services/files/node/watcher/common';
import * as nsfw from 'nsfw';
import { IWatcherService, IWatcherRequest } from 'vs/workbench/services/files/node/watcher/nsfw/watcher';
import { TPromise } from 'vs/base/common/winjs.base';
import { ThrottledDelayer } from 'vs/base/common/async';
import { FileChangeType } from 'vs/platform/files/common/files';

const nsfwActionToRawChangeType: { [key: number]: number } = [];
nsfwActionToRawChangeType[nsfw.actions.CREATED] = FileChangeType.ADDED;
nsfwActionToRawChangeType[nsfw.actions.MODIFIED] = FileChangeType.UPDATED;
nsfwActionToRawChangeType[nsfw.actions.DELETED] = FileChangeType.DELETED;


interface IPathWatcher {
	watcher?: {
		start(): void;
		stop(): void;
	};
}

export class NsfwWatcherService implements IWatcherService {
	private static FS_EVENT_DELAY = 50; // aggregate and only emit events when changes have stopped for this duration (in ms)

	private _pathWatchers: { [watchPath: string]: IPathWatcher } = {};

	public watch(request: IWatcherRequest): TPromise<void> {
		if (request.verboseLogging) {
			console.log('request', request);
		}

		let undeliveredFileEvents: watcher.IRawFileChange[] = [];
		const fileEventDelayer = new ThrottledDelayer(NsfwWatcherService.FS_EVENT_DELAY);

		console.log('starting to watch ' + request.basePath);
		this._pathWatchers[request.basePath] = {};

		const promise = new TPromise<void>((c, e, p) => {
			nsfw(request.basePath, events => {
				for (let i = 0; i < events.length; i++) {
					const e = events[i];

					// Logging
					if (request.verboseLogging) {
						const logPath = e.action === nsfw.actions.RENAMED ? path.join(e.directory, e.oldFile) + ' -> ' + e.newFile : path.join(e.directory, e.file);
						console.log(e.action === nsfw.actions.CREATED ? '[CREATED]' : e.action === nsfw.actions.DELETED ? '[DELETED]' : e.action === nsfw.actions.MODIFIED ? '[CHANGED]' : '[RENAMED]', logPath);
					}

					// Convert nsfw event to IRawFileChange and add to queue
					let absolutePath: string;
					if (e.action === nsfw.actions.RENAMED) {
						// Rename fires when a file's name changes within a single directory
						absolutePath = path.join(e.directory, e.oldFile);
						if (!this._isPathIgnored(absolutePath, request.ignored)) {
							undeliveredFileEvents.push({ type: FileChangeType.DELETED, path: absolutePath });
						}
						absolutePath = path.join(e.directory, e.newFile);
						if (!this._isPathIgnored(absolutePath, request.ignored)) {
							undeliveredFileEvents.push({ type: FileChangeType.ADDED, path: absolutePath });
						}
					} else {
						absolutePath = path.join(e.directory, e.file);
						if (!this._isPathIgnored(absolutePath, request.ignored)) {
							undeliveredFileEvents.push({
								type: nsfwActionToRawChangeType[e.action],
								path: absolutePath
							});
						}
					}
				}

				// Delay and send buffer
				fileEventDelayer.trigger(() => {
					const events = undeliveredFileEvents;
					undeliveredFileEvents = [];

					// Broadcast to clients normalized
					const res = watcher.normalize(events);
					p(res);

					// Logging
					if (request.verboseLogging) {
						res.forEach(r => {
							console.log(' >> normalized', r.type === FileChangeType.ADDED ? '[ADDED]' : r.type === FileChangeType.DELETED ? '[DELETED]' : '[CHANGED]', r.path);
						});
					}

					return TPromise.as(null);
				});
			}).then(watcher => {
				console.log('watcher ready ' + request.basePath);
				this._pathWatchers[request.basePath].watcher = watcher;
				return watcher.start();
			});
		});

		return promise;
	}

	public setRoots(roots: string[]): TPromise<void> {
		const rootsToStartWatching = roots.filter(r => !(r in this._pathWatchers));
		const rootsToStopWatching = Object.keys(this._pathWatchers).filter(r => roots.indexOf(r) === -1);

		// TODO: Don't watch inner folders
		// TODO: Move verboseLogging to constructor
		// Logging
		if (true) {
			console.log(`Set watch roots: start: [${rootsToStartWatching.join(',')}], stop: [${rootsToStopWatching.join(',')}]`);
		}

		const promises: TPromise<void>[] = [];
		if (rootsToStartWatching.length) {
			rootsToStartWatching.forEach(root => {
				promises.push(this.watch({
					basePath: root,
					ignored: [],
					// TODO: Inherit from initial request
					verboseLogging: true
				}));
			});
		}

		if (rootsToStopWatching.length) {
			rootsToStopWatching.forEach(root => {
				this._pathWatchers[root].watcher.stop();
				delete this._pathWatchers[root];
			});
		}

		// TODO: Don't watch sub-folders of folders
		return TPromise.join(promises).then(() => void 0);
	}

	private _isPathIgnored(absolutePath: string, ignored: string[]): boolean {
		return ignored && ignored.some(ignore => glob.match(ignore, absolutePath));
	}
}
