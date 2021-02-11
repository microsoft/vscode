/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { ipcMessagePort } from 'vs/base/parts/sandbox/electron-sandbox/globals';
import { Client as MessagePortClient } from 'vs/base/parts/ipc/common/ipc.mp';
import { IChannel, IServerChannel, getDelayedChannel } from 'vs/base/parts/ipc/common/ipc';
import { INativeHostService } from 'vs/platform/native/electron-sandbox/native';
import { generateUuid } from 'vs/base/common/uuid';
import { ILogService } from 'vs/platform/log/common/log';
import { Disposable } from 'vs/base/common/lifecycle';
import { ISharedProcessService } from 'vs/platform/ipc/electron-sandbox/services';

export class SharedProcessService extends Disposable implements ISharedProcessService {

	declare readonly _serviceBrand: undefined;

	private readonly withSharedProcessConnection: Promise<MessagePortClient>;

	constructor(
		@INativeHostService private readonly nativeHostService: INativeHostService,
		@ILogService private readonly logService: ILogService
	) {
		super();

		this.withSharedProcessConnection = this.connect();
	}

	private async connect(): Promise<MessagePortClient> {
		this.logService.trace('Renderer->SharedProcess#connect');

		// Ask to create message channel inside the window
		// and send over a UUID to correlate the response
		const nonce = generateUuid();
		ipcMessagePort.connect('vscode:createSharedProcessMessageChannel', 'vscode:createSharedProcessMessageChannelResult', nonce);

		// Wait until the main side has returned the `MessagePort`
		// We need to filter by the `nonce` to ensure we listen
		// to the right response.
		const onMessageChannelResult = Event.fromDOMEventEmitter<{ nonce: string, port: MessagePort, source: unknown }>(window, 'message', (e: MessageEvent) => ({ nonce: e.data, port: e.ports[0], source: e.source }));
		const { port } = await Event.toPromise(Event.once(Event.filter(onMessageChannelResult, e => e.nonce === nonce && e.source === window)));

		this.logService.trace('Renderer->SharedProcess#connect: connection established');

		return this._register(new MessagePortClient(port, `window:${this.nativeHostService.windowId}`));
	}

	getChannel(channelName: string): IChannel {
		return getDelayedChannel(this.withSharedProcessConnection.then(connection => connection.getChannel(channelName)));
	}

	registerChannel(channelName: string, channel: IServerChannel<string>): void {
		this.withSharedProcessConnection.then(connection => connection.registerChannel(channelName, channel));
	}
}
