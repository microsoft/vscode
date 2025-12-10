/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILogService } from '../../../../platform/log/common/log.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';
import { Client as MessagePortClient } from '../../../../base/parts/ipc/common/ipc.mp.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IPCClient, ProxyChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { acquirePort } from '../../../../base/parts/ipc/electron-browser/ipc.mp.js';
import { IOnDidTerminateUtilityrocessWorkerProcess, ipcUtilityProcessWorkerChannelName, IUtilityProcessWorkerProcess, IUtilityProcessWorkerService } from '../../../../platform/utilityProcess/common/utilityProcessWorkerService.js';
import { Barrier, timeout } from '../../../../base/common/async.js';

export const IUtilityProcessWorkerWorkbenchService = createDecorator<IUtilityProcessWorkerWorkbenchService>('utilityProcessWorkerWorkbenchService');

export interface IUtilityProcessWorker extends IDisposable {

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
	onDidTerminate: Promise<IOnDidTerminateUtilityrocessWorkerProcess>;
}

export interface IUtilityProcessWorkerWorkbenchService {

	readonly _serviceBrand: undefined;

	/**
	 * Will fork a new process with the provided module identifier in a utility
	 * process and establishes a message port connection to that process.
	 *
	 * Requires the forked process to be ES module that uses our IPC channel framework
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
	createWorker(process: IUtilityProcessWorkerProcess): Promise<IUtilityProcessWorker>;

	/**
	 * Notifies the service that the workbench window has restored.
	 */
	notifyRestored(): void;
}

export class UtilityProcessWorkerWorkbenchService extends Disposable implements IUtilityProcessWorkerWorkbenchService {

	declare readonly _serviceBrand: undefined;

	private _utilityProcessWorkerService: IUtilityProcessWorkerService | undefined = undefined;
	private get utilityProcessWorkerService(): IUtilityProcessWorkerService {
		if (!this._utilityProcessWorkerService) {
			const channel = this.mainProcessService.getChannel(ipcUtilityProcessWorkerChannelName);
			this._utilityProcessWorkerService = ProxyChannel.toService<IUtilityProcessWorkerService>(channel);
		}

		return this._utilityProcessWorkerService;
	}

	private readonly restoredBarrier = new Barrier();

	constructor(
		readonly windowId: number,
		@ILogService private readonly logService: ILogService,
		@IMainProcessService private readonly mainProcessService: IMainProcessService
	) {
		super();
	}

	async createWorker(process: IUtilityProcessWorkerProcess): Promise<IUtilityProcessWorker> {
		this.logService.trace('Renderer->UtilityProcess#createWorker');

		// We want to avoid heavy utility process work to happen before
		// the window has restored. As such, make sure we await the
		// `Restored` phase before making a connection attempt, but also
		// add a timeout to be safe against possible deadlocks.

		await Promise.race([this.restoredBarrier.wait(), timeout(2000)]);

		// Get ready to acquire the message port from the utility process worker
		const nonce = generateUuid();
		const responseChannel = 'vscode:createUtilityProcessWorkerMessageChannelResult';
		const portPromise = acquirePort(undefined /* we trigger the request via service call! */, responseChannel, nonce);

		// Actually talk with the utility process service
		// to create a new process from a worker
		const onDidTerminate = this.utilityProcessWorkerService.createWorker({
			process,
			reply: { windowId: this.windowId, channel: responseChannel, nonce }
		});

		// Dispose worker upon disposal via utility process service
		const disposables = new DisposableStore();
		disposables.add(toDisposable(() => {
			this.logService.trace('Renderer->UtilityProcess#disposeWorker', process);

			this.utilityProcessWorkerService.disposeWorker({
				process,
				reply: { windowId: this.windowId }
			});
		}));

		const port = await portPromise;
		const client = disposables.add(new MessagePortClient(port, `window:${this.windowId},module:${process.moduleId}`));
		this.logService.trace('Renderer->UtilityProcess#createWorkerChannel: connection established');

		onDidTerminate.then(({ reason }) => {
			if (reason?.code === 0) {
				this.logService.trace(`[UtilityProcessWorker]: terminated normally with code ${reason.code}, signal: ${reason.signal}`);
			} else {
				this.logService.error(`[UtilityProcessWorker]: terminated unexpectedly with code ${reason?.code}, signal: ${reason?.signal}`);
			}
		});

		return { client, onDidTerminate, dispose: () => disposables.dispose() };
	}

	notifyRestored(): void {
		if (!this.restoredBarrier.isOpen()) {
			this.restoredBarrier.open();
		}
	}
}
