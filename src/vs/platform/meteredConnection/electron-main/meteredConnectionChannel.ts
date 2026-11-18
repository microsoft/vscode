/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { IServerChannel } from '../../../base/parts/ipc/common/ipc.js';
import { MeteredConnectionCommand } from '../common/meteredConnectionIpc.js';
import { MeteredConnectionMainService } from './meteredConnectionMainService.js';

/**
 * IPC channel implementation for the metered connection service.
 */
export class MeteredConnectionChannel implements IServerChannel {
	constructor(private readonly service: MeteredConnectionMainService) { }

	public listen(_: unknown, event: any): Event<any> {
		switch (event) {
			case MeteredConnectionCommand.OnDidChangeIsConnectionMetered:
				return this.service.onDidChangeIsConnectionMetered;
			default:
				throw new Error(`Event not found: ${event}`);
		}
	}

	public async call(_: unknown, command: string, arg?: any): Promise<any> {
		switch (command) {
			case MeteredConnectionCommand.IsConnectionMetered:
				return this.service.isConnectionMetered;
			case MeteredConnectionCommand.SetIsBrowserConnectionMetered:
				this.service.setIsBrowserConnectionMetered(arg);
				break;
			default:
				throw new Error(`Call not found: ${command}`);
		}
	}
}
