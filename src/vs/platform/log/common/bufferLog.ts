/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MutableDisposable } from '../../../base/common/lifecycle.js';
import { AbstractMessageLogger, DEFAULT_LOG_LEVEL, ILogger, log, LogLevel } from './log.js';

interface ILog {
	level: LogLevel;
	message: string;
}

export class BufferLogger extends AbstractMessageLogger {

	declare readonly _serviceBrand: undefined;
	private buffer: ILog[] = [];
	private _logger: ILogger | undefined = undefined;
	private readonly _logLevelDisposable = this._register(new MutableDisposable());

	constructor(logLevel: LogLevel = DEFAULT_LOG_LEVEL) {
		super();
		this.setLevel(logLevel);
	}

	set logger(logger: ILogger) {
		this._logger = logger;
		this.setLevel(logger.getLevel());
		this._logLevelDisposable.value = logger.onDidChangeLogLevel(this.setLevel, this);

		for (const { level, message } of this.buffer) {
			log(logger, level, message);
		}

		this.buffer = [];
	}

	protected log(level: LogLevel, message: string): void {
		if (this._logger) {
			log(this._logger, level, message);
		} else if (this.getLevel() <= level) {
			this.buffer.push({ level, message });
		}
	}

	override dispose(): void {
		this._logger?.dispose();
		super.dispose();
	}

	override flush(): void {
		this._logger?.flush();
	}
}
