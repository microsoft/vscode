/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILogService } from 'vs/platform/log/common/log';
import { Disposable } from 'vs/base/common/lifecycle';
import { ISharedProcessService } from 'vs/platform/ipc/electron-sandbox/services';
import { Client as MessagePortClient } from 'vs/base/parts/ipc/common/ipc.mp';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ipcSharedProcessWorkerChannelName, ISharedProcessWorkerProcess, ISharedProcessWorkerService } from 'vs/platform/sharedProcess/common/sharedProcessWorkerService';
import { getDelayedChannel, IChannel, ProxyChannel } from 'vs/base/parts/ipc/common/ipc';
import { generateUuid } from 'vs/base/common/uuid';
import { acquirePort } from 'vs/base/parts/ipc/electron-sandbox/ipc.mp';

export const ISharedProcessWorkerWorkbenchService = createDecorator<ISharedProcessWorkerWorkbenchService>('sharedProcessWorkerWorkbenchService');

export interface ISharedProcessWorkerWorkbenchService {

	readonly _serviceBrand: undefined;

	/**
	 * Will fork a new process with the provided module identifier off the shared
	 * process and establishes a message port connection to that process.
	 *
	 * Requires the forked process to be AMD module that uses our IPC channel framework
	 * to respond to the provided `channelName` as a server.
	 *
	 * The process will be automatically terminated when the workbench window closes,
	 * crashes or loads/reloads.
	 *
	 * @param process information around the process to fork
	 * @param channelName the name of the channel the process will respond to
	 */
	createWorkerChannel(process: ISharedProcessWorkerProcess, channelName: string): IChannel;
}

export class SharedProcessWorkerWorkbenchService extends Disposable implements ISharedProcessWorkerWorkbenchService {

	declare readonly _serviceBrand: undefined;

	private _sharedProcessWorkerService: ISharedProcessWorkerService | undefined = undefined;
	private get sharedProcessWorkerService(): ISharedProcessWorkerService {
		if (!this._sharedProcessWorkerService) {
			this._sharedProcessWorkerService = ProxyChannel.toService<ISharedProcessWorkerService>(this.sharedProcessService.getChannel(ipcSharedProcessWorkerChannelName));
		}

		return this._sharedProcessWorkerService;
	}

	constructor(
		readonly windowId: number,
		@ILogService private readonly logService: ILogService,
		@ISharedProcessService private readonly sharedProcessService: ISharedProcessService
	) {
		super();
	}

	createWorkerChannel(process: ISharedProcessWorkerProcess, channelName: string): IChannel {
		return getDelayedChannel(this.doCreateWorkerChannel(process).then(connection => connection.getChannel(channelName)));
	}

	private async doCreateWorkerChannel(process: ISharedProcessWorkerProcess): Promise<MessagePortClient> {
		this.logService.trace('Renderer->SharedProcess#createWorkerChannel');

		// Get ready to acquire the message port from the shared process worker
		const nonce = generateUuid();
		const responseChannel = 'vscode:createSharedProcessWorkerMessageChannelResult';
		const portPromise = acquirePort(undefined /* we trigger the request via service call! */, responseChannel, nonce);

		// Actually talk with the shared process service
		this.sharedProcessWorkerService.createWorker({
			process,
			reply: { windowId: this.windowId, channel: responseChannel, nonce }
		});

		const port = await portPromise;

		this.logService.trace('Renderer->SharedProcess#createWorkerChannel: connection established');

		return this._register(new MessagePortClient(port, `window:${this.windowId},module:${process.moduleId}`));
	}
}
