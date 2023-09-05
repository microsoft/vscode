/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';

export const ITaskLogService = createDecorator<ITaskLogService>('taskLogService');
export interface ITaskLogService extends ILogService {
	/**
	 * Similar to _serviceBrand but used to differentiate this service at compile time from
	 * ILogService; ITerminalLogService is an ILogService, but ILogService is not an
	 * ITerminalLogService.
	 */
	readonly _logBrand: undefined;
}
