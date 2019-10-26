/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { join } from 'vs/base/common/path';
import { ILogService, DelegatedLogService, LogLevel } from 'vs/platform/log/common/log';
import { ExtHostLogServiceShape } from 'vs/workbench/api/common/extHost.protocol';
import { ExtensionHostLogFileName } from 'vs/workbench/services/extensions/common/extensions';
import { URI } from 'vs/base/common/uri';
import { IExtHostInitDataService } from 'vs/workbench/api/common/extHostInitDataService';
import { Schemas } from 'vs/base/common/network';
import { SpdLogService } from 'vs/platform/log/node/spdlogService';
import { IExtHostOutputService } from 'vs/workbench/api/common/extHostOutput';

export class ExtHostLogService extends DelegatedLogService implements ILogService, ExtHostLogServiceShape {

	constructor(
		@IExtHostInitDataService initData: IExtHostInitDataService,
		@IExtHostOutputService extHostOutputService: IExtHostOutputService
	) {
		if (initData.logsLocation.scheme !== Schemas.file) { throw new Error('Only file-logging supported'); }
		super(new SpdLogService(ExtensionHostLogFileName, initData.logsLocation.fsPath, initData.logLevel));

		// Register an output channel for exthost log
		extHostOutputService.createOutputChannelFromLogFile(
			initData.remote.isRemote ? localize('remote extension host Log', "Remote Extension Host") : localize('extension host Log', "Extension Host"),
			URI.file(join(initData.logsLocation.fsPath, `${ExtensionHostLogFileName}.log`))
		);
	}

	$setLevel(level: LogLevel): void {
		this.setLevel(level);
	}
}
