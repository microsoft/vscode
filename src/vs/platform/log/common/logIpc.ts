/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChannel, eventToCall, eventFromCall } from 'vs/base/parts/ipc/common/ipc';
import { TPromise } from 'vs/base/common/winjs.base';
import { LogLevel, ILogService, DelegatedLogService } from 'vs/platform/log/common/log';
import { Event, buffer } from 'vs/base/common/event';

export interface ILogLevelSetterChannel extends IChannel {
	call(command: 'event:onDidChangeLogLevel'): TPromise<LogLevel>;
	call(command: 'setLevel', logLevel: LogLevel): TPromise<void>;
}

export class LogLevelSetterChannel implements ILogLevelSetterChannel {

	onDidChangeLogLevel: Event<LogLevel>;

	constructor(private service: ILogService) {
		this.onDidChangeLogLevel = buffer(service.onDidChangeLogLevel, true);
	}

	call(command: string, arg?: any): TPromise<any> {
		switch (command) {
			case 'event:onDidChangeLogLevel': return eventToCall(this.onDidChangeLogLevel);
			case 'setLevel': this.service.setLevel(arg); return TPromise.as(null);
		}
		return undefined;
	}
}

export class LogLevelSetterChannelClient {

	constructor(private channel: ILogLevelSetterChannel) { }

	private _onDidChangeLogLevel = eventFromCall<LogLevel>(this.channel, 'event:onDidChangeLogLevel');
	get onDidChangeLogLevel(): Event<LogLevel> { return this._onDidChangeLogLevel; }

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