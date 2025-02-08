/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


export interface NewWorkerMessage {
	type: '_newWorker';
	id: string;
	port: any /* MessagePort */;
	url: string;
	options: any /* WorkerOptions */ | undefined;
}

export interface TerminateWorkerMessage {
	type: '_terminateWorker';
	id: string;
}
