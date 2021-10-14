/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ipcRenderer } from 'electron';
import { FileAccess } from 'vs/base/common/network';
import { ILogService } from 'vs/platform/log/common/log';
import { ISharedProcessWorkerConfiguration, ISharedProcessWorkerService } from 'vs/platform/sharedProcess/common/sharedProcessWorkerService';
import { SharedProcessWorkerMessages, ISharedProcessWorkerMessage } from 'vs/platform/sharedProcess/electron-browser/sharedProcessWorker';

export class SharedProcessWorkerService implements ISharedProcessWorkerService {

	declare readonly _serviceBrand: undefined;

	constructor(
		@ILogService private readonly logService: ILogService
	) {
	}

	async createWorker(configuration: ISharedProcessWorkerConfiguration): Promise<void> {
		const workerLogId = `window: ${configuration.reply.windowId}, moduleId: ${configuration.process.moduleId}`;
		this.logService.trace(`SharedProcess: createWorker (${workerLogId})`);

		// Create a `MessageChannel` with 2 ports:
		// `windowPort`: send back to the requesting window
		// `workerPort`: send into a new worker to use
		const { port1: windowPort, port2: workerPort } = new MessageChannel();

		// TODO@bpasero what is the lifecycle of workers?
		// Should probably dispose on port close?
		const worker = new Worker('../../../base/worker/workerMain.js', {
			name: `Shared Process Worker (${workerLogId})`
		});

		worker.onerror = event => {
			this.logService.error(`SharedProcess: worker error (${workerLogId})`, event);
		};

		worker.onmessageerror = event => {
			this.logService.error(`SharedProcess: worker message error (${workerLogId})`, event);
		};

		worker.onmessage = event => {
			switch (event.data) {

				// Hand off configuration and port to the worker once
				// we are being asked from the worker.
				case SharedProcessWorkerMessages.RequestPort:
					const message: ISharedProcessWorkerMessage = {
						id: SharedProcessWorkerMessages.ReceivePort,
						configuration,
						environment: {
							bootstrapPath: FileAccess.asFileUri('bootstrap-fork', require).fsPath
						}
					};
					worker.postMessage(message, [workerPort]);
					break;

				// Hand off the window port back when the worker is ready
				case SharedProcessWorkerMessages.WorkerReady:
					// We cannot just send the `MessagePort` through our protocol back
					// because the port can only be sent via `postMessage`. So we need
					// to send it through the main process to back to the window.
					ipcRenderer.postMessage('vscode:relaySharedProcessWorkerMessageChannel', configuration, [windowPort]);
					break;

				default:
					this.logService.error(`SharedProcess: unexpected worker message (${workerLogId})`, event);
			}
		};

		// First message triggers the load of the worker
		worker.postMessage('vs/platform/sharedProcess/electron-browser/sharedProcessWorkerMain');
	}
}
