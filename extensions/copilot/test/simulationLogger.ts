/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { styleText } from 'util';
import { LogLevel } from '../src/platform/log/common/logService';


class SimulationLogger {
	public logLevel: LogLevel;
	private tagPrefix: string;

	constructor(private logFn: (...args: any[]) => void, logLevel: LogLevel = LogLevel.Info, tagPrefix: string = '') {
		this.logLevel = logLevel;
		this.tagPrefix = tagPrefix;
	}

	setLogLevel(level: LogLevel): void {
		this.logLevel = level;
	}

	trace(...args: any[]): void {
		if (this.shouldLog(LogLevel.Trace)) {
			this.logFn(this.formatMessage(LogLevel.Trace, ...args));
		}
	}

	debug(...args: any[]): void {
		if (this.shouldLog(LogLevel.Debug)) {
			this.logFn(this.formatMessage(LogLevel.Debug, ...args));
		}
	}

	info(...args: any[]): void {
		if (this.shouldLog(LogLevel.Info)) {
			this.logFn(this.formatMessage(LogLevel.Info, ...args));
		}
	}

	warn(...args: any[]): void {
		if (this.shouldLog(LogLevel.Warning)) {
			this.logFn(this.formatMessage(LogLevel.Warning, ...args));
		}
	}

	error(...args: any[]): void {
		if (this.shouldLog(LogLevel.Error)) {
			this.logFn(this.formatMessage(LogLevel.Error, ...args));
		}
	}

	tag(tag: string): SimulationLogger {
		return new SimulationLogger(this.logFn, this.logLevel, `${this.tagPrefix}[${tag}] `);
	}

	shouldLog(level: LogLevel): boolean {
		const levels: LogLevel[] = [LogLevel.Debug, LogLevel.Info, LogLevel.Warning, LogLevel.Error];
		return levels.indexOf(level) >= levels.indexOf(this.logLevel);
	}

	private formatMessage(level: LogLevel, ...args: any[]): string {
		const levelColors: Record<LogLevel, string> = {
			[LogLevel.Off]: styleText('white', 'off'),
			[LogLevel.Trace]: styleText('gray', 'trace'),
			[LogLevel.Debug]: styleText('blue', 'debug'),
			[LogLevel.Info]: styleText('green', 'info '),
			[LogLevel.Warning]: styleText('yellow', 'yellow'),
			[LogLevel.Error]: styleText('red', 'error')
		};
		return `${styleText('bold', levelColors[level])} ${this.tagPrefix}${args.join(' ')}`;
	}
}

export const logger = new SimulationLogger((...args) => console.log(...args));
