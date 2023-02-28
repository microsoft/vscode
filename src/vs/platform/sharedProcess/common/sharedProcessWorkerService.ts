/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { hash as hashObject } from 'vs/base/common/hash';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IUtilityProcessWorkerConfiguration, IUtilityProcessWorkerService } from 'vs/platform/utilityProcess/common/utilityProcessWorkerService';

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

export interface ISharedProcessWorkerService extends IUtilityProcessWorkerService {
	readonly _serviceBrand: undefined;
}
