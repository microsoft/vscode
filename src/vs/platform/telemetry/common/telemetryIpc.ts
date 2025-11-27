/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { IChannel, IServerChannel } from '../../../base/parts/ipc/common/ipc.js';
import { ITelemetryData } from './telemetry.js';
import { ITelemetryAppender } from './telemetryUtils.js';

export interface ITelemetryLog {
	eventName: string;
	data?: ITelemetryData;
}

export class TelemetryAppenderChannel implements IServerChannel {

	constructor(private appenders: ITelemetryAppender[]) { }

	listen<T>(_: unknown, event: string): Event<T> {
		throw new Error(`Event not found: ${event}`);
	}

	call<T>(_: unknown, command: string, { eventName, data }: ITelemetryLog) {
		this.appenders.forEach(a => a.log(eventName, data ?? {}));
		return Promise.resolve(null as unknown as T);
	}
}

export class TelemetryAppenderClient implements ITelemetryAppender {

	constructor(private channel: IChannel) { }

	log(eventName: string, data?: unknown): unknown {
		this.channel.call('log', { eventName, data })
			.then(undefined, err => `Failed to log telemetry: ${console.warn(err)}`);

		return Promise.resolve(null);
	}

	flush(): Promise<void> {
		// TODO
		return Promise.resolve();
	}
}
