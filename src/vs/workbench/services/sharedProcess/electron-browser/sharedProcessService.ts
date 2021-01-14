/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { IpcRendererEvent } from 'vs/base/parts/sandbox/electron-sandbox/electronTypes';
import { ipcRenderer } from 'vs/base/parts/sandbox/electron-sandbox/globals';
import { Client as MessagePortClient } from 'vs/base/parts/ipc/common/ipc.mp';
import { IChannel, IServerChannel, getDelayedChannel } from 'vs/base/parts/ipc/common/ipc';
import { IMainProcessService } from 'vs/platform/ipc/electron-sandbox/mainProcessService';
import { ISharedProcessService } from 'vs/platform/sharedProcess/electron-browser/sharedProcessService';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { INativeHostService } from 'vs/platform/native/electron-sandbox/native';
import { generateUuid } from 'vs/base/common/uuid';
import { ILogService } from 'vs/platform/log/common/log';
import { ILifecycleService } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { Disposable } from 'vs/base/common/lifecycle';

export class SharedProcessService extends Disposable implements ISharedProcessService {

	declare readonly _serviceBrand: undefined;

	private readonly sharedProcessMainChannel = this.mainProcessService.getChannel('sharedProcess');
	private readonly withSharedProcessConnection: Promise<MessagePortClient>;

	constructor(
		@IMainProcessService private readonly mainProcessService: IMainProcessService,
		@INativeHostService private readonly nativeHostService: INativeHostService,
		@ILogService private readonly logService: ILogService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService
	) {
		super();

		this.withSharedProcessConnection = this.connect();

		this.registerListeners();
	}

	private registerListeners(): void {

		// Lifecycle
		this.lifecycleService.onWillShutdown(() => this.dispose());
	}

	private async connect(): Promise<MessagePortClient> {
		this.logService.trace('Workbench->SharedProcess#connect');

		// await the shared process to be ready
		await this.sharedProcessMainChannel.call('whenReady');

		// Ask to create message channel inside the window
		// and send over a UUID to correlate the response
		const nonce = generateUuid();
		ipcRenderer.send('vscode:createSharedProcessMessageChannel', nonce);

		// Wait until the main side has returned the `MessagePort`
		// We need to filter by the `nonce` to ensure we listen
		// to the right response.
		const onMessageChannelResult = Event.fromNodeEventEmitter<{ nonce: string, port: MessagePort }>(ipcRenderer, 'vscode:createSharedProcessMessageChannelResult', (e: IpcRendererEvent, nonce: string) => ({ nonce, port: e.ports[0] }));
		const { port } = await Event.toPromise(Event.once(Event.filter(onMessageChannelResult, e => e.nonce === nonce)));

		this.logService.trace('Workbench->SharedProcess#connect: connection established');

		return this._register(new MessagePortClient(port, `window:${this.nativeHostService.windowId}`));
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
