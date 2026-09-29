/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILogService } from '../../../../platform/log/common/logService';

export function getCopilotLogger(logService: ILogService) {
	return {
		isDebug: () => false,
		debug: (msg: string) => logService.debug(msg),
		log: (msg: string) => logService.trace(msg),
		info: (msg: string) => logService.info(msg),
		notice: (msg: string | Error) => logService.info(typeof msg === 'string' ? msg : msg.message),
		warning: (msg: string | Error) => logService.warn(typeof msg === 'string' ? msg : msg.message),
		error: (msg: string | Error) => logService.error(typeof msg === 'string' ? msg : msg.message),
		startGroup: () => { },
		endGroup: () => { }
	};
}
