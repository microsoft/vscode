/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface IUtilityProcessWorkerProcess {

	/**
	 * The module to load as child process into the worker.
	 */
	readonly moduleId: string;

	/**
	 * The type of the process appears in the arguments of the
	 * forked process to identify it easier.
	 */
	readonly type: string;

	/**
	 * A human-readable name for the utility process.
	 */
	readonly name: string;
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
	readonly reason: IUtilityProcessWorkerProcessExit;
}

export interface IUtilityProcessWorkerProcessExit {

	/**
	 * The utility process worker process exit code if known.
	 */
	readonly code?: number;

	/**
	 * The utility process worker process exit signal if known.
	 */
	readonly signal?: string;
}

export interface IUtilityProcessWorkerConfiguration {

	/**
	 * Configuration specific to the process to fork.
	 */
	readonly process: IUtilityProcessWorkerProcess;

	/**
	 * Configuration specific for how to respond with the
	 * communication message port to the receiver window.
	 */
	readonly reply: {
		readonly windowId: number;
		readonly channel?: string;
		readonly nonce?: string;
	};
}

export interface IUtilityProcessWorkerCreateConfiguration extends IUtilityProcessWorkerConfiguration {
	readonly reply: {
		readonly windowId: number;
		readonly channel: string;
		readonly nonce: string;
	};
}

export const ipcUtilityProcessWorkerChannelName = 'utilityProcessWorker';

export interface IUtilityProcessWorkerService {

	readonly _serviceBrand: undefined;

	/**
	 * Will fork a new process with the provided module identifier in a utility
	 * process and establishes a message port connection to that process. The other
	 * end of the message port connection will be sent back to the calling window
	 * as identified by the `reply` configuration.
	 *
	 * Requires the forked process to be ES module that uses our IPC channel framework
	 * to respond to the provided `channelName` as a server.
	 *
	 * The process will be automatically terminated when the receiver window closes,
	 * crashes or loads/reloads. It can also explicitly be terminated by calling
	 * `disposeWorker`.
	 *
	 * Note on affinity: repeated calls to `createWorker` with the same `moduleId` from
	 * the same window will result in any previous forked process to get terminated.
	 * In other words, it is not possible, nor intended to create multiple workers of
	 * the same process from one window. The intent of these workers is to be reused per
	 * window and the communication channel allows to dynamically update the processes
	 * after the fact.
	 *
	 * @returns a promise that resolves then the worker terminated. Provides more details
	 * about the termination that can be used to figure out if the termination was unexpected
	 * or not and whether the worker needs to be restarted.
	 */
	createWorker(configuration: IUtilityProcessWorkerCreateConfiguration): Promise<IOnDidTerminateUtilityrocessWorkerProcess>;

	/**
	 * Terminates the process for the provided configuration if any.
	 */
	disposeWorker(configuration: IUtilityProcessWorkerConfiguration): Promise<void>;
}
