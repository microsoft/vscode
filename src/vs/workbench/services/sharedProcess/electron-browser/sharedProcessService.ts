/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Client } from 'vs/base/parts/ipc/common/ipc.net';
import { connect } from 'vs/base/parts/ipc/node/ipc.net';
import { IChannel, IServerChannel, getDelayedChannel } from 'vs/base/parts/ipc/common/ipc';
import { IMainProcessService } from 'vs/platform/ipc/electron-sandbox/mainProcessService';
import { ISharedProcessService } from 'vs/platform/ipc/electron-browser/sharedProcessService';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { INativeWorkbenchEnvironmentService } from 'vs/workbench/services/environment/electron-sandbox/environmentService';
import { INativeHostService } from 'vs/platform/native/electron-sandbox/native';

export class SharedProcessService implements ISharedProcessService {

	declare readonly _serviceBrand: undefined;

	private withSharedProcessConnection: Promise<Client<string>>;
	private sharedProcessMainChannel: IChannel;

	constructor(
		@IMainProcessService mainProcessService: IMainProcessService,
		@INativeHostService nativeHostService: INativeHostService,
		@INativeWorkbenchEnvironmentService environmentService: INativeWorkbenchEnvironmentService
	) {
		this.sharedProcessMainChannel = mainProcessService.getChannel('sharedProcess');

		this.withSharedProcessConnection = this.whenSharedProcessReady()
			.then(() => connect(environmentService.sharedIPCHandle, `window:${nativeHostService.windowId}`));
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
