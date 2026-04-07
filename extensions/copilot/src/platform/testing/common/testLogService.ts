/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILogger, ILogService, ILogTarget } from '../../log/common/logService';

export class TestLogService implements ILogService {
	_serviceBrand: undefined;
	trace(message: string): void { }
	debug(message: string): void { }
	info(message: string): void { }
	warn(message: string): void { }
	error(error: string | Error, message?: string): void { }
	show(preserveFocus?: boolean): void { }
	createSubLogger(_topic: string | readonly string[]): ILogger {
		return this;
	}
	withExtraTarget(_target: ILogTarget): ILogger {
		return this;
	}
}
