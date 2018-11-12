/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TPromise } from 'vs/base/common/winjs.base';
import { IChannel } from 'vs/base/parts/ipc/node/ipc';
import { IWatcherRequest, IWatcherService, IWatcherOptions, IWatchError } from './watcher';
import { Event } from 'vs/base/common/event';
import { IRawFileChange } from 'vs/workbench/services/files/node/watcher/common';

export interface IWatcherChannel extends IChannel {
	listen(event: 'watch', verboseLogging: boolean): Event<IRawFileChange[] | Error>;
	listen<T>(event: string, arg?: any): Event<T>;

	call(command: 'setRoots', request: IWatcherRequest[]): TPromise<void>;
	call(command: 'setVerboseLogging', enable: boolean): TPromise<void>;
	call(command: 'stop'): TPromise<void>;
	call<T>(command: string, arg?: any): TPromise<T>;
}

export class WatcherChannel implements IWatcherChannel {

	constructor(private service: IWatcherService) { }

	listen(event: string, arg?: any): Event<any> {
		switch (event) {
			case 'watch': return this.service.watch(arg);
		}
		throw new Error('No events');
	}

	call(command: string, arg?: any): TPromise<any> {
		switch (command) {
			case 'setRoots': return this.service.setRoots(arg);
			case 'setVerboseLogging': return this.service.setVerboseLogging(arg);
			case 'stop': return this.service.stop();
		}
		return undefined;
	}
}

export class WatcherChannelClient implements IWatcherService {

	constructor(private channel: IWatcherChannel) { }

	watch(options: IWatcherOptions): Event<IRawFileChange[] | IWatchError> {
		return this.channel.listen('watch', options);
	}

	setVerboseLogging(enable: boolean): TPromise<void> {
		return this.channel.call('setVerboseLogging', enable);
	}

	setRoots(roots: IWatcherRequest[]): TPromise<void> {
		return this.channel.call('setRoots', roots);
	}

	stop(): TPromise<void> {
		return this.channel.call('stop');
	}
}