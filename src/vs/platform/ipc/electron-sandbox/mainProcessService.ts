/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IChannel, IServerChannel } from 'vs/base/parts/ipc/common/ipc';
import { Client } from 'vs/base/parts/ipc/electron-sandbox/ipc.electron-sandbox';
import { Disposable } from 'vs/base/common/lifecycle';

export const IMainProcessService2 = createDecorator<IMainProcessService2>('mainProcessService2');

export interface IMainProcessService2 {

	_serviceBrand: undefined;

	readonly windowId: number;

	getChannel(channelName: string): IChannel;

	registerChannel(channelName: string, channel: IServerChannel<string>): void;
}

export class MainProcessService2 extends Disposable implements IMainProcessService2 {

	_serviceBrand: undefined;

	private mainProcessConnection: Client;

	constructor(
		public readonly windowId: number
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
