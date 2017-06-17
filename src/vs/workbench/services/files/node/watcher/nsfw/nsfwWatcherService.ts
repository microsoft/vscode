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

export class NsfwWatcherService implements IWatcherService {
	private static FS_EVENT_DELAY = 50; // aggregate and only emit events when changes have stopped for this duration (in ms)

	public watch(request: IWatcherRequest): TPromise<void> {
		if (request.verboseLogging) {
			console.log('request', request);
		}

		let undeliveredFileEvents: watcher.IRawFileChange[] = [];
		const fileEventDelayer = new ThrottledDelayer(NsfwWatcherService.FS_EVENT_DELAY);

		return new TPromise<void>((c, e, p) => {
			nsfw(request.basePath, events => {
				if (request.verboseLogging) {
					console.log('raw events start');
					events.forEach(e => console.log(e));
					console.log('raw events end');
				}

				for (let i = 0; i < events.length; i++) {
					let absolutePath: string;
					const e = events[i];
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
				return watcher.start();
			});
		});
	}

	public setRoots(roots: string[]): TPromise<void> {
		console.log('nsfwWatcherService, setRoots', roots);
		// TODO: Watch multiple folders
		// TODO: Don't watch sub-folders of folders
		return TPromise.as(void 0);
	}

	private _isPathIgnored(absolutePath: string, ignored: string[]): boolean {
		return ignored && ignored.some(ignore => glob.match(ignore, absolutePath));
	}
}
