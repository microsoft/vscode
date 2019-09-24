/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Client } from 'vs/base/parts/ipc/common/ipc.net';
import { connect } from 'vs/base/parts/ipc/node/ipc.net';
import { IWindowService } from 'vs/platform/windows/common/windows';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IChannel, IServerChannel, getDelayedChannel } from 'vs/base/parts/ipc/common/ipc';
import { IMainProcessService } from 'vs/platform/ipc/electron-browser/mainProcessService';

export const ISharedProcessService = createDecorator<ISharedProcessService>('sharedProcessService');

export interface ISharedProcessService {

	_serviceBrand: undefined;

	getChannel(channelName: string): IChannel;
	registerChannel(channelName: string, channel: IServerChannel<string>): void;

	whenSharedProcessReady(): Promise<void>;
	toggleSharedProcessWindow(): Promise<void>;
}

export class SharedProcessService implements ISharedProcessService {

	_serviceBrand: undefined;

	private withSharedProcessConnection: Promise<Client<string>>;
	private sharedProcessMainChannel: IChannel;

	constructor(
		@IMainProcessService mainProcessService: IMainProcessService,
		@IWindowService windowService: IWindowService,
		@IEnvironmentService environmentService: IEnvironmentService
	) {
		this.sharedProcessMainChannel = mainProcessService.getChannel('sharedProcess');

		this.withSharedProcessConnection = this.whenSharedProcessReady()
			.then(() => connect(environmentService.sharedIPCHandle, `window:${windowService.windowId}`));
	}

	whenSharedProcessReady(): Promise<void> {
		return this.sharedProcessMainChannel.call('whenSharedProcessReady');
	}

	getChannel(channelName: string): IChannel {
		return getDelayedChannel(this.withSharedProcessConnection.then(connection => connection.getChannel(channelName)));
	}

	registerChannel(channelName: string, channel: IServerChannel<string>): void {
		this.withSharedProcessConnection.then(connection => connection.registerChannel(channelName, channel));
	}

	toggleSharedProcessWindow(): Promise<void> {
		return this.sharedProcessMainChannel.call('toggleSharedProcessWindow');
	}
}
