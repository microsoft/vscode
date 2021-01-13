/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Client as NodeIPCClient } from 'vs/base/parts/ipc/common/ipc.net';
import { connect as nodeIPCConnect } from 'vs/base/parts/ipc/node/ipc.net';
import { IChannel, IServerChannel, getDelayedChannel } from 'vs/base/parts/ipc/common/ipc';
import { IMainProcessService } from 'vs/platform/ipc/electron-sandbox/mainProcessService';
import { ISharedProcessService } from 'vs/platform/sharedProcess/electron-browser/sharedProcessService';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { INativeWorkbenchEnvironmentService } from 'vs/workbench/services/environment/electron-sandbox/environmentService';
import { INativeHostService } from 'vs/platform/native/electron-sandbox/native';

export class SharedProcessService implements ISharedProcessService {

	declare readonly _serviceBrand: undefined;

	private withSharedProcessConnection: Promise<NodeIPCClient<string>>;
	private sharedProcessMainChannel: IChannel;

	constructor(
		@IMainProcessService mainProcessService: IMainProcessService,
		@INativeHostService nativeHostService: INativeHostService,
		@INativeWorkbenchEnvironmentService environmentService: INativeWorkbenchEnvironmentService
	) {
		this.sharedProcessMainChannel = mainProcessService.getChannel('sharedProcess');

		this.withSharedProcessConnection = (async () => {
			await this.whenReady();

			return nodeIPCConnect(environmentService.sharedIPCHandle, `window:${nativeHostService.windowId}`);
		})();
	}

	private whenReady(): Promise<void> {
		return this.sharedProcessMainChannel.call('whenReady');
	}

	getChannel(channelName: string): IChannel {
		return getDelayedChannel(this.withSharedProcessConnection.then(connection => connection.getChannel(channelName)));
	}

	registerChannel(channelName: string, channel: IServerChannel<string>): void {
		this.withSharedProcessConnection.then(connection => connection.registerChannel(channelName, channel));
	}

	toggleWindow(): Promise<void> {
		return this.sharedProcessMainChannel.call('toggleWindow');
	}
}

registerSingleton(ISharedProcessService, SharedProcessService, true);
