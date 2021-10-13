/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ipcRenderer } from 'electron';
import { ILogService } from 'vs/platform/log/common/log';
import { ISharedProcessWorkerConfiguration, ISharedProcessWorkerService } from 'vs/platform/sharedProcess/common/sharedProcessWorkerService';

export class SharedProcessWorkerService implements ISharedProcessWorkerService {

	declare readonly _serviceBrand: undefined;

	constructor(
		@ILogService private readonly logService: ILogService
	) {
	}

	async createWorker(configuration: ISharedProcessWorkerConfiguration): Promise<void> {
		this.logService.trace('SharedProcess: createWorker', configuration);

		const { port1: incomingPort /*, port2: outgoingPort */ } = new MessageChannel();

		// We cannot just send the `MessagePort` through our protocol back
		// because the port can only be sent via `postMessage`. So we need
		// to send it through the main process to back to the window.
		ipcRenderer.postMessage('vscode:relaySharedProcessWorkerMessageChannel', configuration, [incomingPort]);
	}
}
