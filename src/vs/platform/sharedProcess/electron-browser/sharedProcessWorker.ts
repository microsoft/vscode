/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ISharedProcessWorkerConfiguration } from 'vs/platform/sharedProcess/common/sharedProcessWorkerService';

export enum SharedProcessWorkerMessages {

	// Process
	Spawn = 'vscode:shared-process->shared-process-worker=spawn',
	Terminate = 'vscode:shared-process->shared-process-worker=terminate',
	SelfTerminated = 'vscode:shared-process-worker->shared-process=selfTerminated',

	// Lifecycle
	Ready = 'vscode:shared-process-worker->shared-process=ready',
	Ack = 'vscode:shared-process-worker->shared-process=ack',

	// Diagnostics
	Trace = 'vscode:shared-process-worker->shared-process=trace',
	Info = 'vscode:shared-process-worker->shared-process=info',
	Warn = 'vscode:shared-process-worker->shared-process=warn',
	Error = 'vscode:shared-process-worker->shared-process=error'
}

export interface ISharedProcessWorkerEnvironment {

	/**
	 * Full absolute path to our `bootstrap-fork.js` file.
	 */
	bootstrapPath: string;
}

interface IBaseMessage {
	id: string;
	nonce?: string;
}

export interface ISharedProcessToWorkerMessage extends IBaseMessage {
	configuration: ISharedProcessWorkerConfiguration;
	environment?: ISharedProcessWorkerEnvironment;
}

export interface IWorkerToSharedProcessMessage extends IBaseMessage {
	configuration?: ISharedProcessWorkerConfiguration;
	message?: string;
}
