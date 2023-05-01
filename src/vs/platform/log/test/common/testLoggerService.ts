/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { AbstractLoggerService, ILogger, LogLevel, NullLogger } from 'vs/platform/log/common/log';

export class TestLoggerService extends AbstractLoggerService {
	constructor(logsHome?: URI) {
		super(LogLevel.Info, logsHome ?? URI.file('tests').with({ scheme: 'vscode-tests' }));
	}
	protected doCreateLogger(): ILogger { return new NullLogger(); }
}
