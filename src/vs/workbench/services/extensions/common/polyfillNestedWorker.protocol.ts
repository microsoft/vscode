/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const enum WorkerMessageType {
	Ready = '_workerReady',
	NewWorker = '_newWorker',
	TerminateWorker = '_terminateWorker'
}

export interface WorkerReadyMessage {
	type: WorkerMessageType.Ready;
}

export interface NewWorkerMessage {
	type: WorkerMessageType.NewWorker;
	id: string;
	port: any /* MessagePort */;
	url: string;
	options: any /* WorkerOptions */ | undefined;
}

export interface TerminateWorkerMessage {
	type: WorkerMessageType.TerminateWorker;
	id: string;
}

export type WorkerMessage = WorkerReadyMessage | NewWorkerMessage | TerminateWorkerMessage;
