/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { IChannel } from 'vs/base/parts/ipc/common/ipc';
import { IWatcherRequest, IWatcherService } from './watcher';

export interface IWatcherChannel extends IChannel {
	call(command: 'watch', request: IWatcherRequest): TPromise<void>;
	call(command: string, arg: any): TPromise<any>;
}

export class WatcherChannel implements IWatcherChannel {

	constructor(private service: IWatcherService) { }

	call(command: string, arg: any): TPromise<any> {
		switch (command) {
			case 'watch': return this.service.watch(arg);
		}
		return undefined;
	}
}

export class WatcherChannelClient implements IWatcherService {

	constructor(private channel: IWatcherChannel) { }

	watch(request: IWatcherRequest): TPromise<void> {
		return this.channel.call('watch', request);
	}
}