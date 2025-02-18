/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../base/common/lifecycle.js';
import { Event } from '../../../base/common/event.js';
import { ILogger, ILogService, LogLevel, MultiplexLogger } from './log.js';

export class LogService extends Disposable implements ILogService {

	declare readonly _serviceBrand: undefined;

	private readonly logger: ILogger;

	constructor(primaryLogger: ILogger, otherLoggers: ILogger[] = []) {
		super();
		this.logger = new MultiplexLogger([primaryLogger, ...otherLoggers]);
		this._register(primaryLogger.onDidChangeLogLevel(level => this.setLevel(level)));
	}

	get onDidChangeLogLevel(): Event<LogLevel> {
		return this.logger.onDidChangeLogLevel;
	}

	setLevel(level: LogLevel): void {
		this.logger.setLevel(level);
	}

	getLevel(): LogLevel {
		return this.logger.getLevel();
	}

	trace(message: string, ...args: any[]): void {
		this.logger.trace(message, ...args);
	}

	debug(message: string, ...args: any[]): void {
		this.logger.debug(message, ...args);
	}

	info(message: string, ...args: any[]): void {
		this.logger.info(message, ...args);
	}

	warn(message: string, ...args: any[]): void {
		this.logger.warn(message, ...args);
	}

	error(message: string | Error, ...args: any[]): void {
		this.logger.error(message, ...args);
	}

	flush(): void {
		this.logger.flush();
	}
}
