/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import nsfw = require('nsfw');
import { IWatcherService, IWatcherRequest } from 'vs/workbench/services/files/node/watcher/unix/watcher';
import { TPromise } from "vs/base/common/winjs.base";
import watcher = require('vs/workbench/services/files/node/watcher/common');
import * as path from 'path';

const nsfwEventActionToRawChangeType = {
	0: 1, // Created
	1: 2, // Deleted
	2: 0, // Modified
	// TODO: handle rename event type
	3: null // Rename
};

export class NsfwWatcherService implements IWatcherService {
	public watch(request: IWatcherRequest): TPromise<void> {
		console.log('nsfw ' + nsfw);
		console.log('basePath ' + request.basePath);
		return new TPromise<void>((c, e, p) => {
			nsfw(request.basePath, events => {
				if (request.verboseLogging) {
					console.log('raw events start');
					events.forEach(e => console.log(e));
					console.log('raw events end');
				}
				const convertedEvents = events.map(e => this._mapNsfwEventToRawFileChange(e)).filter(e => !!e);
				// TODO: Utilize fileEventDelayer and watcher.normalize
				p(convertedEvents);
			}).then(watcher => {
				return watcher.start();
			});
		});
	}

	private _mapNsfwEventToRawFileChange(nsfwEvent: any): watcher.IRawFileChange {
		// TODO: Handle other event types (directory change?)
		if (!nsfwEvent.directory || !nsfwEvent.file) {
			return null;
		}
		const event: watcher.IRawFileChange = {
			type: nsfwEventActionToRawChangeType[nsfwEvent.action],
			path: path.join(nsfwEvent.directory, nsfwEvent.file)
		};
		if (!event.type) {
			return null;
		}
		return event;
	}
}
