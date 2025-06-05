/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChannel, IPCServer, IServerChannel, StaticRouter } from '../../../base/parts/ipc/common/ipc.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { IRemoteService } from './services.js';

export const IMainProcessService = createDecorator<IMainProcessService>('mainProcessService');

export interface IMainProcessService extends IRemoteService { }

/**
 * An implementation of `IMainProcessService` that leverages `IPCServer`.
 */
export class MainProcessService implements IMainProcessService {

	declare readonly _serviceBrand: undefined;

	constructor(
		private server: IPCServer,
		private router: StaticRouter
	) { }

	getChannel(channelName: string): IChannel {
		return this.server.getChannel(channelName, this.router);
	}

	registerChannel(channelName: string, channel: IServerChannel<string>): void {
		this.server.registerChannel(channelName, channel);
	}
}
