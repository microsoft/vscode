/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { join } from 'vs/base/common/paths';
import { LogLevel } from 'vs/workbench/api/node/extHostTypes';
import { ILogService, DelegatedLogService } from 'vs/platform/log/common/log';
import { createSpdLogService } from 'vs/platform/log/node/spdlogService';
import { ExtHostLogServiceShape } from 'vs/workbench/api/node/extHost.protocol';


export class ExtHostLogService extends DelegatedLogService implements ILogService, ExtHostLogServiceShape {

	constructor(
		private _windowId: number,
		logLevel: LogLevel,
		private _logsPath: string
	) {
		super(createSpdLogService(`exthost${_windowId}`, logLevel, _logsPath));
	}

	$setLevel(level: LogLevel): void {
		this.setLevel(level);
	}

	getLogDirectory(extensionID: string): string {
		return join(this._logsPath, `${extensionID}_${this._windowId}`);
	}
}
