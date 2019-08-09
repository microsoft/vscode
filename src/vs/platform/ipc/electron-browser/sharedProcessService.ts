/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator, ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';
import { Client } from 'vs/base/parts/ipc/common/ipc.net';
import { connect } from 'vs/base/parts/ipc/node/ipc.net';
import { IWindowsService, IWindowService } from 'vs/platform/windows/common/windows';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IChannel, IServerChannel, getDelayedChannel } from 'vs/base/parts/ipc/common/ipc';

export const ISharedProcessService = createDecorator<ISharedProcessService>('sharedProcessService');

export interface ISharedProcessService {

	_serviceBrand: ServiceIdentifier<any>;

	getChannel(channelName: string): IChannel;

	registerChannel(channelName: string, channel: IServerChannel<string>): void;
}

export class SharedProcessService implements ISharedProcessService {

	_serviceBrand!: ServiceIdentifier<any>;

	private withSharedProcessConnection: Promise<Client<string>>;

	constructor(
		@IWindowsService windowsService: IWindowsService,
		@IWindowService windowService: IWindowService,
		@IEnvironmentService environmentService: IEnvironmentService
	) {
		this.withSharedProcessConnection = windowsService.whenSharedProcessReady()
			.then(() => connect(environmentService.sharedIPCHandle, `window:${windowService.windowId}`));
	}

	getChannel(channelName: string): IChannel {
		return getDelayedChannel(this.withSharedProcessConnection.then(connection => connection.getChannel(channelName)));
	}

	registerChannel(channelName: string, channel: IServerChannel<string>): void {
		this.withSharedProcessConnection.then(connection => connection.registerChannel(channelName, channel));
	}
}
