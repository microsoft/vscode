/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AbstractMessageLogger, DEFAULT_LOG_LEVEL, ILogger, log, LogLevel } from 'vs/platform/log/common/log';

interface ILog {
	level: LogLevel;
	message: string;
}

export class BufferLogger extends AbstractMessageLogger {

	declare readonly _serviceBrand: undefined;
	private buffer: ILog[] = [];
	private _logger: ILogger | undefined = undefined;

	constructor(logLevel: LogLevel = DEFAULT_LOG_LEVEL) {
		super();
		this.setLevel(logLevel);
		this._register(this.onDidChangeLogLevel(level => {
			this._logger?.setLevel(level);
		}));
	}

	set logger(logger: ILogger) {
		this._logger = logger;

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
