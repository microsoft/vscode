/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ISharedProcessWorkerConfiguration } from 'vs/platform/sharedProcess/common/sharedProcessWorkerService';

export const SHARED_PROCESS_WORKER_REQUEST = 'vscode:receiveSharedProcessWorkerMessageChannelPort';
export const SHARED_PROCESS_WORKER_RESPONSE = 'vscode:receiveSharedProcessWorkerMessageChannelPortResult';

export interface ISharedProcessWorkerEnvironment {

	/**
	 * Full absolute path to our `bootstrap-fork.js` file.
	 */
	bootstrapPath: string;
}

export interface ISharedProcessWorkerMessage {
	id: string;
	configuration: ISharedProcessWorkerConfiguration;
	environment: ISharedProcessWorkerEnvironment;
}
