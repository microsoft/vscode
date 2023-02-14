/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface IUtilityProcessWorkerProcess {

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

export interface IOnDidTerminateUtilityrocessWorkerProcess {

	/**
	 * More information around how the utility process worker
	 * process terminated. Will be `undefined` in case the
	 * worker process was terminated normally via APIs
	 * and will be defined in case the worker process
	 * terminated on its own, either unexpectedly or
	 * because it finished.
	 */
	reason?: IUtilityProcessWorkerProcessExit;
}

export interface IUtilityProcessWorkerProcessExit {

	/**
	 * The utility process worker process exit code if known.
	 */
	code?: number;

	/**
	 * The utility process worker process exit signal if known.
	 */
	signal?: string;
}

export interface IUtilityProcessWorkerConfiguration {

	/**
	 * Configuration specific to the process to fork.
	 */
	process: IUtilityProcessWorkerProcess;

	/**
	 * Configuration specific for how to respond with the
	 * communication message port to the receiver window.
	 */
	reply: {
		windowId: number;
		channel?: string;
		nonce?: string;
	};
}

export interface IUtilityProcessWorkerCreateConfiguration extends IUtilityProcessWorkerConfiguration {
	reply: {
		windowId: number;
		channel: string;
		nonce: string;
	};
}

export const ipcUtilityProcessWorkerChannelName = 'sharedProcessWorker';
