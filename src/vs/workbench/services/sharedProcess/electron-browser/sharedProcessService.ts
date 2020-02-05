/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Client } from 'vs/base/parts/ipc/common/ipc.net';
import { connect } from 'vs/base/parts/ipc/node/ipc.net';
import { IElectronEnvironmentService } from 'vs/workbench/services/electron/electron-browser/electronEnvironmentService';
import { IChannel, IServerChannel, getDelayedChannel } from 'vs/base/parts/ipc/common/ipc';
import { IMainProcessService } from 'vs/platform/ipc/electron-browser/mainProcessService';
import { ISharedProcessService } from 'vs/platform/ipc/electron-browser/sharedProcessService';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';

export class SharedProcessService implements ISharedProcessService {

	_serviceBrand: undefined;

	private withSharedProcessConnection: Promise<Client<string>>;
	private sharedProcessMainChannel: IChannel;

	constructor(
		@IMainProcessService mainProcessService: IMainProcessService,
		@IElectronEnvironmentService environmentService: IElectronEnvironmentService
	) {
		this.sharedProcessMainChannel = mainProcessService.getChannel('sharedProcess');

		this.withSharedProcessConnection = this.whenSharedProcessReady()
			.then(() => connect(environmentService.sharedIPCHandle, `window:${environmentService.windowId}`));
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

registerSingleton(ISharedProcessService, SharedProcessService, true);
