/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILoggerService, LogService } from 'vs/platform/log/common/log';
import { IExtHostInitDataService } from 'vs/workbench/api/common/extHostInitDataService';
import { ExtensionHostLogFileName } from 'vs/workbench/services/extensions/common/extensions';

export class ExtHostLogService extends LogService {

	declare readonly _serviceBrand: undefined;

	constructor(
		@ILoggerService loggerService: ILoggerService,
		@IExtHostInitDataService initData: IExtHostInitDataService,
	) {
		super(loggerService.createLogger(initData.logFile, { name: ExtensionHostLogFileName }));
	}

}
