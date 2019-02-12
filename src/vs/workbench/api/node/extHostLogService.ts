/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { join } from 'vs/base/common/paths';
import { ILogService, DelegatedLogService, LogLevel } from 'vs/platform/log/common/log';
import { createSpdLogService } from 'vs/platform/log/node/spdlogService';
import { ExtHostLogServiceShape } from 'vs/workbench/api/node/extHost.protocol';
import { ExtensionHostLogFileName } from 'vs/workbench/services/extensions/common/extensions';
import { URI } from 'vs/base/common/uri';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';


export class ExtHostLogService extends DelegatedLogService implements ILogService, ExtHostLogServiceShape {

	private _logsPath: string;
	readonly logFile: URI;

	constructor(
		logLevel: LogLevel,
		logsPath: string,
	) {
		super(createSpdLogService(ExtensionHostLogFileName, logLevel, logsPath));
		this._logsPath = logsPath;
		this.logFile = URI.file(join(logsPath, `${ExtensionHostLogFileName}.log`));
	}

	$setLevel(level: LogLevel): void {
		this.setLevel(level);
	}

	getLogDirectory(extensionID: ExtensionIdentifier): string {
		return join(this._logsPath, extensionID.value);
	}
}
