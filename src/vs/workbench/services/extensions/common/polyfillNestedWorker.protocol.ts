/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
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
