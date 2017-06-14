/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import nsfw = require('nsfw');
import { IWatcherService, IWatcherRequest } from 'vs/workbench/services/files/node/watcher/unix/watcher';
import { TPromise } from "vs/base/common/winjs.base";

export class NsfwWatcherService implements IWatcherService {
	public watch(request: IWatcherRequest): TPromise<void> {
		console.log('nsfw ' + nsfw);
		console.log('basePath ' + request.basePath);
		return new TPromise<void>((c, e, p) => {
			nsfw(request.basePath, events => {
				console.log(events);
				p(events);
			}).then(watcher => {
				return watcher.start();
			});
		});
	}
}
