/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import nsfw = require('nsfw');
import { IWatcherService, IWatcherRequest } from 'vs/workbench/services/files/node/watcher/unix/watcher';
import { TPromise } from "vs/base/common/winjs.base";
import watcher = require('vs/workbench/services/files/node/watcher/common');
import * as path from 'path';
import { ThrottledDelayer } from 'vs/base/common/async';
import { FileChangeType } from 'vs/platform/files/common/files';

const nsfwActionToRawChangeType: { [key: number]: number } = [];
nsfwActionToRawChangeType[nsfw.actions.CREATED] = FileChangeType.ADDED;
nsfwActionToRawChangeType[nsfw.actions.MODIFIED] = FileChangeType.UPDATED;
nsfwActionToRawChangeType[nsfw.actions.DELETED] = FileChangeType.DELETED;

export class NsfwWatcherService implements IWatcherService {
	private static FS_EVENT_DELAY = 50; // aggregate and only emit events when changes have stopped for this duration (in ms)

	public watch(request: IWatcherRequest): TPromise<void> {
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
					const e = events[i];
					if (e.action === nsfw.actions.RENAMED) {
						// Rename fires when a file's name changes within a single directory
						undeliveredFileEvents.push({ type: FileChangeType.DELETED, path: path.join(e.directory, e.oldFile) });
						undeliveredFileEvents.push({ type: FileChangeType.ADDED, path: path.join(e.directory, e.newFile) });
					} else {
						undeliveredFileEvents.push({
							type: nsfwActionToRawChangeType[e.action],
							path: path.join(e.directory, e.file)
						});
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
}
