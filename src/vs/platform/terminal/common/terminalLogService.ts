/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { Event } from 'vs/base/common/event';
import { localize } from 'vs/nls';
import { ILogger, ILoggerService, LogLevel } from 'vs/platform/log/common/log';
import { ITerminalLogService } from 'vs/platform/terminal/common/terminal';

export class TerminalLogService extends Disposable implements ITerminalLogService {
	declare _serviceBrand: undefined;
	declare _logBrand: undefined;

	private readonly _logger: ILogger;

	get onDidChangeLogLevel(): Event<LogLevel> { return this._logger.onDidChangeLogLevel; }

	constructor(@ILoggerService private readonly _loggerService: ILoggerService) {
		super();
		this._logger = this._loggerService.createLogger('terminal', { name: localize('terminalLoggerName', 'Terminal') });
	}

	getLevel(): LogLevel { return this._logger.getLevel(); }
	setLevel(level: LogLevel): void { this._logger.setLevel(level); }
	trace(message: string, ...args: any[]): void { this._logger.trace(message, args); }
	debug(message: string, ...args: any[]): void { this._logger.debug(message, args); }
	info(message: string, ...args: any[]): void { this._logger.info(message, args); }
	warn(message: string, ...args: any[]): void { this._logger.warn(message, args); }
	error(message: string | Error, ...args: any[]): void { this._logger.error(message, args); }
	flush(): void { this._logger.flush(); }
}
