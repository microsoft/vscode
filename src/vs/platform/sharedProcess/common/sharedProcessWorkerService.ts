/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { hash as hashObject } from 'vs/base/common/hash';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IOnDidTerminateUtilityrocessWorkerProcess, IUtilityProcessWorkerConfiguration, IUtilityProcessWorkerCreateConfiguration } from 'vs/platform/utilityProcess/common/utilityProcessWorkerService';

/**
 * Converts the process configuration into a hash to
 * identify processes of the same kind by taking those
 * components that make the process and reply unique.
 */
export function hash(configuration: IUtilityProcessWorkerConfiguration): number {
	return hashObject({
		moduleId: configuration.process.moduleId,
		windowId: configuration.reply.windowId
	});
}

export const ISharedProcessWorkerService = createDecorator<ISharedProcessWorkerService>('sharedProcessWorkerService');

export const ipcUtilityProcessWorkerChannelName = 'sharedProcessWorker';

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
	createWorker(configuration: IUtilityProcessWorkerCreateConfiguration): Promise<IOnDidTerminateUtilityrocessWorkerProcess>;

	/**
	 * Terminates the process for the provided configuration if any.
	 */
	disposeWorker(configuration: IUtilityProcessWorkerConfiguration): Promise<void>;
}
