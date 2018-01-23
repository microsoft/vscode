/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChannel, eventToCall, eventFromCall } from 'vs/base/parts/ipc/common/ipc';
import { TPromise } from 'vs/base/common/winjs.base';
import { LogLevel, ILogService } from 'vs/platform/log/common/log';
import Event, { buffer } from 'vs/base/common/event';

export interface ILogLevelManagementChannel extends IChannel {
	call(command: 'event:onDidChangeLogLevel'): TPromise<LogLevel>;
	call(command: 'setLogLevel', logLevel: LogLevel): TPromise<void>;
}

export class LogLevelChannel implements ILogLevelManagementChannel {

	onDidChangeLogLevel: Event<LogLevel>;

	constructor(private service: ILogService) {
		this.onDidChangeLogLevel = buffer(service.onDidChangeLogLevel, true);
	}

	call(command: string, arg?: any): TPromise<any> {
		switch (command) {
			case 'event:onDidChangeLogLevel': return eventToCall(this.onDidChangeLogLevel);
			case 'setLogLevel': this.service.setLevel(arg); return TPromise.as(null);
		}
		return undefined;
	}
}

export class LogLevelChannelClient {

	constructor(private channel: ILogLevelManagementChannel) { }

	private _onDidChangeLogLevel = eventFromCall<LogLevel>(this.channel, 'event:onDidChangeLogLevel');
	get onDidChangeLogLevel(): Event<LogLevel> { return this._onDidChangeLogLevel; }

	setLogLevel(level: LogLevel): TPromise<void> {
		return this.channel.call('setLogLevel', level);
	}
}