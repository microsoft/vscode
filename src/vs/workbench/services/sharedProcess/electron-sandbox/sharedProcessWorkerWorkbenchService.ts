/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILogService } from 'vs/platform/log/common/log';
import { Disposable, DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { ISharedProcessService } from 'vs/platform/ipc/electron-sandbox/services';
import { Client as MessagePortClient } from 'vs/base/parts/ipc/common/ipc.mp';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IOnDidTerminateSharedProcessWorkerProcess, ipcSharedProcessWorkerChannelName, ISharedProcessWorkerProcess, ISharedProcessWorkerService } from 'vs/platform/sharedProcess/common/sharedProcessWorkerService';
import { IPCClient, ProxyChannel } from 'vs/base/parts/ipc/common/ipc';
import { generateUuid } from 'vs/base/common/uuid';
import { acquirePort } from 'vs/base/parts/ipc/electron-sandbox/ipc.mp';

export const ISharedProcessWorkerWorkbenchService = createDecorator<ISharedProcessWorkerWorkbenchService>('sharedProcessWorkerWorkbenchService');

export interface ISharedProcessWorker extends IDisposable {

	/**
	 * A IPC client to communicate to the worker process.
	 */
	client: IPCClient<string>;

	/**
	 * A promise that resolves to an object once the
	 * worker process terminates, giving information
	 * how the process terminated.
	 *
	 * This can be used to figure out whether the worker
	 * should be restarted in case of an unexpected
	 * termination.
	 */
	onDidTerminate: Promise<IOnDidTerminateSharedProcessWorkerProcess>;
}

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
	 * Note on affinity: repeated calls to `createWorkerChannel` with the same `moduleId`
	 * from the same window will result in any previous forked process to get terminated.
	 * In other words, it is not possible, nor intended to create multiple workers of
	 * the same process from one window. The intent of these workers is to be reused per
	 * window and the communication channel allows to dynamically update the processes
	 * after the fact.
	 *
	 * @param process information around the process to fork as worker
	 *
	 * @returns the worker IPC client to communicate with. Provides a `dispose` method that
	 * allows to terminate the worker if needed.
	 */
	createWorker(process: ISharedProcessWorkerProcess): Promise<ISharedProcessWorker>;
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

	async createWorker(process: ISharedProcessWorkerProcess): Promise<ISharedProcessWorker> {
		this.logService.trace('Renderer->SharedProcess#createWorker');

		// Get ready to acquire the message port from the shared process worker
		const nonce = generateUuid();
		const responseChannel = 'vscode:createSharedProcessWorkerMessageChannelResult';
		const portPromise = acquirePort(undefined /* we trigger the request via service call! */, responseChannel, nonce);

		// Actually talk with the shared process service
		// to create a new process from a worker
		const onDidTerminate = this.sharedProcessWorkerService.createWorker({
			process,
			reply: { windowId: this.windowId, channel: responseChannel, nonce }
		});

		// Dispose worker upon disposal via shared process service
		const disposables = new DisposableStore();
		disposables.add(toDisposable(() => {
			this.logService.trace('Renderer->SharedProcess#disposeWorker', process);

			this.sharedProcessWorkerService.disposeWorker({
				process,
				reply: { windowId: this.windowId }
			});
		}));

		const port = await portPromise;
		const client = disposables.add(new MessagePortClient(port, `window:${this.windowId},module:${process.moduleId}`));
		this.logService.trace('Renderer->SharedProcess#createWorkerChannel: connection established');

		return { client, onDidTerminate, dispose: () => disposables.dispose() };
	}
}
