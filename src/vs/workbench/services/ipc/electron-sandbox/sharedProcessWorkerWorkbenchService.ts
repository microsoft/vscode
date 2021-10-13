/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { ILogService } from 'vs/platform/log/common/log';
import { Disposable } from 'vs/base/common/lifecycle';
import { ISharedProcessService } from 'vs/platform/ipc/electron-sandbox/services';
import { Client as MessagePortClient } from 'vs/base/parts/ipc/common/ipc.mp';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ipcSharedProcessWorkerChannelName, ISharedProcessWorkerService } from 'vs/platform/sharedProcess/common/sharedProcessWorkerService';
import { getDelayedChannel, IChannel, ProxyChannel } from 'vs/base/parts/ipc/common/ipc';
import { generateUuid } from 'vs/base/common/uuid';
import { ipcMessagePort } from 'vs/base/parts/sandbox/electron-sandbox/globals';

export const ISharedProcessWorkerWorkbenchService = createDecorator<ISharedProcessWorkerWorkbenchService>('sharedProcessWorkerWorkbenchService');

export interface ISharedProcessWorkerWorkbenchService {

	readonly _serviceBrand: undefined;

	/**
	 * Creates a worker off the shared process that spawns the provided
	 * `moduleId` as process and wires in the communication to that process
	 * via message ports and channels.
	 *
	 * @param moduleId the identifier of the module to spawn from
	 * the shared process worker.
	 */
	createWorkerChannel(moduleId: string): IChannel;
}

export class SharedProcessWorkerWorkbenchService extends Disposable implements ISharedProcessWorkerWorkbenchService {

	declare readonly _serviceBrand: undefined;

	constructor(
		readonly windowId: number,
		@ILogService private readonly logService: ILogService,
		@ISharedProcessService private readonly sharedProcessService: ISharedProcessService
	) {
		super();
	}

	createWorkerChannel(moduleId: string): IChannel {
		return getDelayedChannel(this.doCreateWorkerChannel(moduleId).then(connection => connection.getChannel('default')));
	}

	private async doCreateWorkerChannel(moduleId: string): Promise<MessagePortClient> {
		this.logService.trace('Renderer->SharedProcess#createWorkerChannel');

		// Ask to create message channel inside the shared
		// process from a new worker and send over a UUID
		// to correlate the response
		const nonce = generateUuid();
		const replyChannel = `vscode:createSharedProcessWorkerMessageChannelResult`;
		ipcMessagePort.acquire(replyChannel, nonce);

		// Wait until the main side has returned the `MessagePort`
		// We need to filter by the `nonce` to ensure we listen
		// to the right response.
		const onMessageChannelResult = Event.fromDOMEventEmitter<{ nonce: string, port: MessagePort, source: unknown }>(window, 'message', (e: MessageEvent) => ({ nonce: e.data, port: e.ports[0], source: e.source }));
		const portPromise = Event.toPromise(Event.once(Event.filter(onMessageChannelResult, e => e.nonce === nonce && e.source === window)));

		// Actually talk with the shared process service
		const sharedProcessWorkerService = ProxyChannel.toService<ISharedProcessWorkerService>(this.sharedProcessService.getChannel(ipcSharedProcessWorkerChannelName));
		sharedProcessWorkerService.createWorker({
			moduleId,
			reply: { windowId: this.windowId, channel: replyChannel, nonce }
		});

		const { port } = await portPromise;

		this.logService.trace('Renderer->SharedProcess#createWorkerChannel: connection established');

		return this._register(new MessagePortClient(port, `window:${this.windowId},module:${moduleId}`));
	}
}
