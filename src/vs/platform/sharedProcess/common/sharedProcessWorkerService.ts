/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { hash as hashObject } from 'vs/base/common/hash';
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

export interface IOnDidTerminateSharedProcessWorkerProcess {

	/**
	 * More information around how the shared process worker
	 * process terminated. Will be `undefined` in case the
	 * worker process was terminated normally via APIs
	 * and will be defined in case the worker process
	 * terminated on its own, either unexpectedly or
	 * because it finished.
	 */
	reason?: ISharedProcessWorkerProcessExit;
}

export interface ISharedProcessWorkerProcessExit {

	/**
	 * The shared process worker process exit code if known.
	 */
	code?: number;

	/**
	 * The shared process worker process exit signal if known.
	 */
	signal?: string;
}

export interface ISharedProcessWorkerConfiguration {

	/**
	 * Configuration specific to the process to fork.
	 */
	process: ISharedProcessWorkerProcess;

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

/**
 * Converts the process configuration into a hash to
 * identify processes of the same kind by taking those
 * components that make the process and reply unique.
 */
export function hash(configuration: ISharedProcessWorkerConfiguration): number {
	return hashObject({
		moduleId: configuration.process.moduleId,
		windowId: configuration.reply.windowId
	});
}

export const ISharedProcessWorkerService = createDecorator<ISharedProcessWorkerService>('sharedProcessWorkerService');

export const ipcSharedProcessWorkerChannelName = 'sharedProcessWorker';

export interface ISharedProcessWorkerService {

	readonly _serviceBrand: undefined;

	/**
	 * Will fork a new process with the provided module identifier off the shared
	 * process and establishes a message port connection to that process. The other
	 * end of the message port connection will be sent back to the calling window
	 * as identified by the `reply` configuration.
	 *
	 * Requires the forked process to be AMD module that uses our IPC channel framework
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
	createWorker(configuration: ISharedProcessWorkerConfiguration): Promise<IOnDidTerminateSharedProcessWorkerProcess>;

	/**
	 * Terminates the process for the provided configuration if any.
	 */
	disposeWorker(configuration: ISharedProcessWorkerConfiguration): Promise<void>;
}
