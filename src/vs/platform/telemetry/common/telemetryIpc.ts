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

const LOG = 'log';
const SET_IS_CONNECTION_METERED = 'setIsConnectionMetered';

function isTelemetryLog(arg: unknown): arg is ITelemetryLog {
	return typeof arg === 'object' && arg !== null && 'eventName' in arg && typeof arg.eventName === 'string';
}

export class TelemetryAppenderChannel implements IServerChannel {

	constructor(
		private readonly appenders: ITelemetryAppender[],
		private readonly setIsConnectionMetered?: (isMetered: boolean) => void,
	) { }

	listen<T>(_: unknown, event: string): Event<T> {
		throw new Error(`Event not found: ${event}`);
	}

	call<T>(_: unknown, command: string, arg: unknown) {
		switch (command) {
			case LOG: {
				if (!isTelemetryLog(arg)) {
					throw new Error('Invalid telemetry log argument');
				}
				this.appenders.forEach(a => a.log(arg.eventName, arg.data ?? {}));
				break;
			}
			case SET_IS_CONNECTION_METERED: {
				if (typeof arg !== 'boolean') {
					throw new Error('Invalid metered connection argument');
				}
				this.setIsConnectionMetered?.(arg);
				break;
			}
			default:
				throw new Error(`Unknown telemetry appender command: ${command}`);
		}
		return Promise.resolve(null as unknown as T);
	}
}

export class TelemetryAppenderClient implements ITelemetryAppender {

	constructor(private channel: IChannel) { }

	log(eventName: string, data?: unknown): unknown {
		this.channel.call(LOG, { eventName, data })
			.then(undefined, err => `Failed to log telemetry: ${console.warn(err)}`);

		return Promise.resolve(null);
	}

	setIsConnectionMetered(isMetered: boolean): Promise<void> {
		return this.channel.call(SET_IS_CONNECTION_METERED, isMetered)
			.then(undefined, err => console.warn(`Failed to update telemetry connection state: ${err}`));
	}

	flush(): Promise<void> {
		// TODO
		return Promise.resolve();
	}
}
