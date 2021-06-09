/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChannel, IServerChannel, StaticRouter } from 'vs/base/parts/ipc/common/ipc';
import { Server as MessagePortServer } from 'vs/base/parts/ipc/electron-browser/ipc.mp';
import { IMainProcessService } from 'vs/platform/ipc/electron-sandbox/services';

/**
 * An implementation of `IMainProcessService` that leverages MessagePorts.
 */
export class MessagePortMainProcessService implements IMainProcessService {

	declare readonly _serviceBrand: undefined;

	constructor(
		private server: MessagePortServer,
		private router: StaticRouter
	) { }

	getChannel(channelName: string): IChannel {
		return this.server.getChannel(channelName, this.router);
	}

	registerChannel(channelName: string, channel: IServerChannel<string>): void {
		this.server.registerChannel(channelName, channel);
	}
}
