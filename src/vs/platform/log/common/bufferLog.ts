/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { ILogService, LogLevel, AbstractLogService } from 'vs/platform/log/common/log';

interface ILog {
	level: LogLevel;
	args: IArguments;
}

function getLogFunction(logger: ILogService, level: LogLevel): Function {
	switch (level) {
		case LogLevel.Trace: return logger.trace;
		case LogLevel.Debug: return logger.debug;
		case LogLevel.Info: return logger.info;
		case LogLevel.Warning: return logger.warn;
		case LogLevel.Error: return logger.error;
		case LogLevel.Critical: return logger.critical;
		default: throw new Error('Invalid log level');
	}
}

export class BufferLogService extends AbstractLogService implements ILogService {

	_serviceBrand: any;
	private buffer: ILog[] = [];
	private _logger: ILogService | undefined = undefined;

	set logger(logger: ILogService) {
		this._logger = logger;

		for (const { level, args } of this.buffer) {
			const fn = getLogFunction(logger, level);
			fn.apply(logger, args);
		}

		this.buffer = [];
	}

	private _log(level: LogLevel, args: IArguments): void {
		if (this._logger) {
			const fn = getLogFunction(this._logger, level);
			fn.apply(this._logger, args);
		} else if (this.getLevel() <= level) {
			this.buffer.push({ level, args });
		}
	}

	trace(): void {
		this._log(LogLevel.Trace, arguments);
	}

	debug(): void {
		this._log(LogLevel.Debug, arguments);
	}

	info(): void {
		this._log(LogLevel.Info, arguments);
	}

	warn(): void {
		this._log(LogLevel.Warning, arguments);
	}

	error(): void {
		this._log(LogLevel.Error, arguments);
	}

	critical(): void {
		this._log(LogLevel.Critical, arguments);
	}

	dispose(): void {
		if (this._logger) {
			this._logger.dispose();
		}
	}
}