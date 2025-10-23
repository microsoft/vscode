/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { IServerChannel } from '../../../base/parts/ipc/common/ipc.js';
import { TelemetryLevel } from './telemetry.js';
import { ITelemetryAppender } from './telemetryUtils.js';
import { IServerTelemetryService } from './serverTelemetryService.js';

export class ServerTelemetryChannel extends Disposable implements IServerChannel {
	constructor(
		private readonly telemetryService: IServerTelemetryService,
		private readonly telemetryAppender: ITelemetryAppender | null
	) {
		super();
	}


	async call(_: any, command: string, arg?: any): Promise<any> {
		switch (command) {
			case 'updateTelemetryLevel': {
				const { telemetryLevel } = arg;
				return this.telemetryService.updateInjectedTelemetryLevel(telemetryLevel);
			}

			case 'logTelemetry': {
				const { eventName, data } = arg;
				// Logging is done directly to the appender instead of through the telemetry service
				// as the data sent from the client has already had common properties added to it and
				// has already been sent to the telemetry output channel
				if (this.telemetryAppender) {
					return this.telemetryAppender.log(eventName, data);
				}

				return Promise.resolve();
			}

			case 'flushTelemetry': {
				if (this.telemetryAppender) {
					return this.telemetryAppender.flush();
				}

				return Promise.resolve();
			}

			case 'ping': {
				return;
			}
		}
		// Command we cannot handle so we throw an error
		throw new Error(`IPC Command ${command} not found`);
	}

	listen(_: any, event: string, arg: any): Event<any> {
		throw new Error('Not supported');
	}

	/**
	 * Disposing the channel also disables the telemetryService as there is
	 * no longer a way to control it
	 */
	public override dispose(): void {
		this.telemetryService.updateInjectedTelemetryLevel(TelemetryLevel.NONE);
		super.dispose();
	}
}
