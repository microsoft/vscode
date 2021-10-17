/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ISharedProcessWorkerConfiguration } from 'vs/platform/sharedProcess/common/sharedProcessWorkerService';

export enum SharedProcessWorkerMessages {

	// Process
	WorkerSpawn = 'vscode:shared-process->shared-process-worker=spawn',
	WorkerTerminate = 'vscode:shared-process->shared-process-worker=terminate',

	// Lifecycle
	WorkerReady = 'vscode:shared-process-worker->shared-process=ready',
	WorkerAck = 'vscode:shared-process-worker->shared-process=ack',

	// Diagnostics
	WorkerTrace = 'vscode:shared-process-worker->shared-process=trace',
	WorkerInfo = 'vscode:shared-process-worker->shared-process=info',
	WorkerWarn = 'vscode:shared-process-worker->shared-process=warn',
	WorkerError = 'vscode:shared-process-worker->shared-process=error'
}

export interface ISharedProcessWorkerEnvironment {

	/**
	 * Full absolute path to our `bootstrap-fork.js` file.
	 */
	bootstrapPath: string;
}

export interface ISharedProcessToWorkerMessage {
	id: string;
	configuration: ISharedProcessWorkerConfiguration;
	environment?: ISharedProcessWorkerEnvironment;
	nonce?: string;
}

export interface IWorkerToSharedProcessMessage {
	id: string;
	message?: string;
	nonce?: string;
}
