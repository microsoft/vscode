/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChannel, IServerChannel, StaticRouter } from 'vs/base/parts/ipc/common/ipc';
import { Client as IPCElectronClient } from 'vs/base/parts/ipc/electron-sandbox/ipc.electron';
import { Disposable } from 'vs/base/common/lifecycle';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Server as MessagePortServer } from 'vs/base/parts/ipc/electron-sandbox/ipc.mp';

export const IMainProcessService = createDecorator<IMainProcessService>('mainProcessService');

export interface IMainProcessService {

	readonly _serviceBrand: undefined;

	getChannel(channelName: string): IChannel;

	registerChannel(channelName: string, channel: IServerChannel<string>): void;
}

/**
 * An implementation of `IMainProcessService` that leverages Electron's IPC.
 */
export class ElectronIPCMainProcessService extends Disposable implements IMainProcessService {

	declare readonly _serviceBrand: undefined;

	private mainProcessConnection: IPCElectronClient;

	constructor(
		windowId: number
	) {
		super();

		this.mainProcessConnection = this._register(new IPCElectronClient(`window:${windowId}`));
	}

	getChannel(channelName: string): IChannel {
		return this.mainProcessConnection.getChannel(channelName);
	}

	registerChannel(channelName: string, channel: IServerChannel<string>): void {
		this.mainProcessConnection.registerChannel(channelName, channel);
	}
}

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
