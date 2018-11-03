/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TPromise } from 'vs/base/common/winjs.base';
import { IChannel } from 'vs/base/parts/ipc/node/ipc';
import { ITelemetryAppender } from 'vs/platform/telemetry/common/telemetryUtils';
import { Event } from 'vs/base/common/event';

export interface ITelemetryLog {
	eventName: string;
	data?: any;
}

export interface ITelemetryAppenderChannel extends IChannel {
	call(command: 'log', data: ITelemetryLog): Thenable<void>;
	call(command: string, arg: any): Thenable<any>;
}

export class TelemetryAppenderChannel implements ITelemetryAppenderChannel {

	constructor(private appender: ITelemetryAppender) { }

	listen<T>(event: string, arg?: any): Event<T> {
		throw new Error('No events');
	}

	call(command: string, { eventName, data }: ITelemetryLog): Thenable<any> {
		this.appender.log(eventName, data);
		return TPromise.as(null);
	}
}

export class TelemetryAppenderClient implements ITelemetryAppender {

	constructor(private channel: ITelemetryAppenderChannel) { }

	log(eventName: string, data?: any): any {
		this.channel.call('log', { eventName, data })
			.then(null, err => `Failed to log telemetry: ${console.warn(err)}`);

		return TPromise.as(null);
	}

	dispose(): any {
		// TODO
	}
}