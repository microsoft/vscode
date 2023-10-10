/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Client as MessagePortClient } from 'vs/base/parts/ipc/common/ipc.mp';
import { IChannel, IServerChannel, getDelayedChannel } from 'vs/base/parts/ipc/common/ipc';
import { ILogService } from 'vs/platform/log/common/log';
import { Disposable } from 'vs/base/common/lifecycle';
import { ISharedProcessService } from 'vs/platform/ipc/electron-sandbox/services';
import { SharedProcessChannelConnection, SharedProcessRawConnection } from 'vs/platform/sharedProcess/common/sharedProcess';
import { mark } from 'vs/base/common/performance';
import { Barrier, timeout } from 'vs/base/common/async';
import { acquirePort } from 'vs/base/parts/ipc/electron-sandbox/ipc.mp';

export class SharedProcessService extends Disposable implements ISharedProcessService {

	declare readonly _serviceBrand: undefined;

	private readonly withSharedProcessConnection: Promise<MessagePortClient>;

	private readonly restoredBarrier = new Barrier();

	constructor(
		readonly windowId: number,
		@ILogService private readonly logService: ILogService
	) {
		super();

		this.withSharedProcessConnection = this.connect();
	}

	private async connect(): Promise<MessagePortClient> {
		this.logService.trace('Renderer->SharedProcess#connect');

		// Our performance tests show that a connection to the shared
		// process can have significant overhead to the startup time
		// of the window because the shared process could be created
		// as a result. As such, make sure we await the `Restored`
		// phase before making a connection attempt, but also add a
		// timeout to be safe against possible deadlocks.

		await Promise.race([this.restoredBarrier.wait(), timeout(2000)]);

		// Acquire a message port connected to the shared process
		mark('code/willConnectSharedProcess');
		this.logService.trace('Renderer->SharedProcess#connect: before acquirePort');
		const port = await acquirePort(SharedProcessChannelConnection.request, SharedProcessChannelConnection.response);
		mark('code/didConnectSharedProcess');
		this.logService.trace('Renderer->SharedProcess#connect: connection established');

		return this._register(new MessagePortClient(port, `window:${this.windowId}`));
	}

	notifyRestored(): void {
		if (!this.restoredBarrier.isOpen()) {
			this.restoredBarrier.open();
		}
	}

	getChannel(channelName: string): IChannel {
		return getDelayedChannel(this.withSharedProcessConnection.then(connection => connection.getChannel(channelName)));
	}

	registerChannel(channelName: string, channel: IServerChannel<string>): void {
		this.withSharedProcessConnection.then(connection => connection.registerChannel(channelName, channel));
	}

	async createRawConnection(): Promise<MessagePort> {

		// Await initialization of the shared process
		await this.withSharedProcessConnection;

		// Create a new port to the shared process
		this.logService.trace('Renderer->SharedProcess#createRawConnection: before acquirePort');
		const port = await acquirePort(SharedProcessRawConnection.request, SharedProcessRawConnection.response);
		this.logService.trace('Renderer->SharedProcess#createRawConnection: connection established');

		return port;
	}
}
