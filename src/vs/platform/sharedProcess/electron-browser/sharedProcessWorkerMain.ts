/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ISharedProcessWorkerConfiguration } from 'vs/platform/sharedProcess/common/sharedProcessWorkerService';
import { SHARED_PROCESS_WORKER_REQUEST, SHARED_PROCESS_WORKER_RESPONSE, ISharedProcessWorkerMessage } from 'vs/platform/sharedProcess/electron-browser/sharedProcessWorker';

/**
 * The `create` function needs to be there by convention because
 * we are loaded via the `vs/base/worker/workerMain` utility.
 */
export function create(): { onmessage: (message: ISharedProcessWorkerMessage, transfer: Transferable[]) => void } {

	// Ask to receive the message channel port & config
	postMessage(SHARED_PROCESS_WORKER_REQUEST);

	// Return a message handler that awaits port and config
	return {
		onmessage: (message, transfer) => {
			switch (message.id) {
				case SHARED_PROCESS_WORKER_RESPONSE:
					if (transfer[0] instanceof MessagePort) {
						console.info('SharedProcess [worker]: received the message port and configuration', message.configuration);

						const worker = new SharedProcessWorker(transfer[0], message.configuration);
						worker.start();
					}
					break;

				default:
					console.error('SharedProcess [worker]: unexpected message', message);
			}
		}
	};
}

class SharedProcessWorker {

	constructor(port: MessagePort, configuration: ISharedProcessWorkerConfiguration) {
	}

	start(): void {

	}
}
