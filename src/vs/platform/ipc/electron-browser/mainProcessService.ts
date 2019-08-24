/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator, ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';
import { IChannel, IServerChannel } from 'vs/base/parts/ipc/common/ipc';
import { Client } from 'vs/base/parts/ipc/electron-browser/ipc.electron-browser';
import { Disposable } from 'vs/base/common/lifecycle';

export const IMainProcessService = createDecorator<IMainProcessService>('mainProcessService');

export interface IMainProcessService {

	_serviceBrand: ServiceIdentifier<any>;

	getChannel(channelName: string): IChannel;

	registerChannel(channelName: string, channel: IServerChannel<string>): void;
}

export class MainProcessService extends Disposable implements IMainProcessService {

	_serviceBrand!: ServiceIdentifier<any>;

	private mainProcessConnection: Client;

	constructor(
		windowId: number
	) {
		super();

		this.mainProcessConnection = this._register(new Client(`window:${windowId}`));
	}

	getChannel(channelName: string): IChannel {
		return this.mainProcessConnection.getChannel(channelName);
	}

	registerChannel(channelName: string, channel: IServerChannel<string>): void {
		this.mainProcessConnection.registerChannel(channelName, channel);
	}
}
