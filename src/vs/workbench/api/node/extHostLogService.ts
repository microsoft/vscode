/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILogService, LogService, LogLevel } from 'vs/platform/log/common/log';
import { ExtHostLogServiceShape } from 'vs/workbench/api/common/extHost.protocol';
import { ExtensionHostLogFileName } from 'vs/workbench/services/extensions/common/extensions';
import { IExtHostInitDataService } from 'vs/workbench/api/common/extHostInitDataService';
import { Schemas } from 'vs/base/common/network';
import { SpdLogLogger } from 'vs/platform/log/node/spdlogLog';

export class ExtHostLogService extends LogService implements ILogService, ExtHostLogServiceShape {

	constructor(
		@IExtHostInitDataService initData: IExtHostInitDataService,
	) {
		if (initData.logFile.scheme !== Schemas.file) { throw new Error('Only file-logging supported'); }
		super(new SpdLogLogger(ExtensionHostLogFileName, initData.logFile.fsPath, true, initData.logLevel));
	}

	$setLevel(level: LogLevel): void {
		this.setLevel(level);
	}
}
