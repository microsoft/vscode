/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChannel } from 'vs/base/parts/ipc/node/ipc';
import { TPromise } from 'vs/base/common/winjs.base';
import { LogLevel, ILogService, DelegatedLogService } from 'vs/platform/log/common/log';
import { Event, buffer } from 'vs/base/common/event';

export interface ILogLevelSetterChannel extends IChannel {
	listen(event: 'onDidChangeLogLevel'): Event<LogLevel>;
	listen<T>(event: string, arg?: any): Event<T>;

	call(command: 'setLevel', logLevel: LogLevel): TPromise<void>;
	call(command: string, arg?: any): TPromise<any>;
}

export class LogLevelSetterChannel implements ILogLevelSetterChannel {

	onDidChangeLogLevel: Event<LogLevel>;

	constructor(private service: ILogService) {
		this.onDidChangeLogLevel = buffer(service.onDidChangeLogLevel, true);
	}

	listen<T>(event: string): Event<any> {
		switch (event) {
			case 'onDidChangeLogLevel': return this.onDidChangeLogLevel;
		}

		throw new Error('No event found');
	}

	call(command: string, arg?: any): TPromise<any> {
		switch (command) {
			case 'setLevel': this.service.setLevel(arg); return TPromise.as(null);
		}
		return undefined;
	}
}

export class LogLevelSetterChannelClient {

	constructor(private channel: ILogLevelSetterChannel) { }

	get onDidChangeLogLevel(): Event<LogLevel> {
		return this.channel.listen('onDidChangeLogLevel');
	}

	setLevel(level: LogLevel): TPromise<void> {
		return this.channel.call('setLevel', level);
	}
}

export class FollowerLogService extends DelegatedLogService implements ILogService {
	_serviceBrand: any;

	constructor(private master: LogLevelSetterChannelClient, logService: ILogService) {
		super(logService);
		this._register(master.onDidChangeLogLevel(level => logService.setLevel(level)));
	}

	setLevel(level: LogLevel): void {
		this.master.setLevel(level);
	}
}