/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export interface ISharedProcessWorkerProcess {

	/**
	 * The module to load as child process into the worker.
	 */
	moduleId: string;

	/**
	 * The type of the process appears in the arguments of the
	 * forked process to identify it easier.
	 */
	type: string;
}

export interface ISharedProcessWorkerConfiguration {

	/**
	 * Configuration specific to the process to fork.
	 */
	process: ISharedProcessWorkerProcess;

	/**
	 * Configuration specific for how to respond with the
	 * communication message port.
	 */
	reply: {
		windowId: number;
		channel: string;
		nonce: string;
	};
}

export const ISharedProcessWorkerService = createDecorator<ISharedProcessWorkerService>('sharedProcessWorkerService');

export const ipcSharedProcessWorkerChannelName = 'sharedProcessWorker';

export interface ISharedProcessWorkerService {

	readonly _serviceBrand: undefined;

	/**
	 * Forks the provided process from the passed in configuration inside
	 * the shared process and establishes a `MessagePort` communication
	 * channel that is being sent back to via the `reply` options of the
	 * configuration.
	 */
	createWorker(configuration: ISharedProcessWorkerConfiguration): Promise<void>;
}
