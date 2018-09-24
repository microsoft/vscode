/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { createDecorator as createServiceDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IDisposable, Disposable } from 'vs/base/common/lifecycle';
import { isWindows } from 'vs/base/common/platform';
import { Event, Emitter } from 'vs/base/common/event';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';

export const ILogService = createServiceDecorator<ILogService>('logService');

export enum LogLevel {
	Trace,
	Debug,
	Info,
	Warning,
	Error,
	Critical,
	Off
}

export const DEFAULT_LOG_LEVEL: LogLevel = LogLevel.Info;

export interface ILogService extends IDisposable {
	_serviceBrand: any;
	onDidChangeLogLevel: Event<LogLevel>;

	getLevel(): LogLevel;
	setLevel(level: LogLevel): void;
	trace(message: string, ...args: any[]): void;
	debug(message: string, ...args: any[]): void;
	info(message: string, ...args: any[]): void;
	warn(message: string, ...args: any[]): void;
	error(message: string | Error, ...args: any[]): void;
	critical(message: string | Error, ...args: any[]): void;
}

export abstract class AbstractLogService extends Disposable {

	private level: LogLevel = DEFAULT_LOG_LEVEL;
	private readonly _onDidChangeLogLevel: Emitter<LogLevel> = this._register(new Emitter<LogLevel>());
	readonly onDidChangeLogLevel: Event<LogLevel> = this._onDidChangeLogLevel.event;

	public setLevel(level: LogLevel): void {
		if (this.level !== level) {
			this.level = level;
			this._onDidChangeLogLevel.fire(this.level);
		}
	}

	public getLevel(): LogLevel {
		return this.level;
	}
}

export class ConsoleLogMainService extends AbstractLogService implements ILogService {

	_serviceBrand: any;
	private useColors: boolean;

	constructor(logLevel: LogLevel = DEFAULT_LOG_LEVEL) {
		super();
		this.setLevel(logLevel);
		this.useColors = !isWindows;
	}

	public trace(message: string, ...args: any[]): void {
		if (this.getLevel() <= LogLevel.Trace) {
			if (this.useColors) {
				console.log(`\x1b[90m[main ${new Date().toLocaleTimeString()}]\x1b[0m`, message, ...args);
			} else {
				console.log(`[main ${new Date().toLocaleTimeString()}]`, message, ...args);
			}
		}
	}

	public debug(message: string, ...args: any[]): void {
		if (this.getLevel() <= LogLevel.Debug) {
			if (this.useColors) {
				console.log(`\x1b[90m[main ${new Date().toLocaleTimeString()}]\x1b[0m`, message, ...args);
			} else {
				console.log(`[main ${new Date().toLocaleTimeString()}]`, message, ...args);
			}
		}
	}

	public info(message: string, ...args: any[]): void {
		if (this.getLevel() <= LogLevel.Info) {
			if (this.useColors) {
				console.log(`\x1b[90m[main ${new Date().toLocaleTimeString()}]\x1b[0m`, message, ...args);
			} else {
				console.log(`[main ${new Date().toLocaleTimeString()}]`, message, ...args);
			}
		}
	}

	public warn(message: string | Error, ...args: any[]): void {
		if (this.getLevel() <= LogLevel.Warning) {
			if (this.useColors) {
				console.warn(`\x1b[93m[main ${new Date().toLocaleTimeString()}]\x1b[0m`, message, ...args);
			} else {
				console.warn(`[main ${new Date().toLocaleTimeString()}]`, message, ...args);
			}
		}
	}

	public error(message: string, ...args: any[]): void {
		if (this.getLevel() <= LogLevel.Error) {
			if (this.useColors) {
				console.error(`\x1b[91m[main ${new Date().toLocaleTimeString()}]\x1b[0m`, message, ...args);
			} else {
				console.error(`[main ${new Date().toLocaleTimeString()}]`, message, ...args);
			}
		}
	}

	public critical(message: string, ...args: any[]): void {
		if (this.getLevel() <= LogLevel.Critical) {
			if (this.useColors) {
				console.error(`\x1b[90m[main ${new Date().toLocaleTimeString()}]\x1b[0m`, message, ...args);
			} else {
				console.error(`[main ${new Date().toLocaleTimeString()}]`, message, ...args);
			}
		}
	}

	dispose(): void {
		// noop
	}
}

export class ConsoleLogService extends AbstractLogService implements ILogService {

	_serviceBrand: any;

	constructor(logLevel: LogLevel = DEFAULT_LOG_LEVEL) {
		super();
		this.setLevel(logLevel);
	}

	trace(message: string, ...args: any[]): void {
		if (this.getLevel() <= LogLevel.Trace) {
			console.log('%cTRACE', 'color: #888', message, ...args);
		}
	}

	debug(message: string, ...args: any[]): void {
		if (this.getLevel() <= LogLevel.Debug) {
			console.log('%cDEBUG', 'background: #eee; color: #888', message, ...args);
		}
	}

	info(message: string, ...args: any[]): void {
		if (this.getLevel() <= LogLevel.Info) {
			console.log('%c INFO', 'color: #33f', message, ...args);
		}
	}

	warn(message: string | Error, ...args: any[]): void {
		if (this.getLevel() <= LogLevel.Warning) {
			console.log('%c WARN', 'color: #993', message, ...args);
		}
	}

	error(message: string, ...args: any[]): void {
		if (this.getLevel() <= LogLevel.Error) {
			console.log('%c  ERR', 'color: #f33', message, ...args);
		}
	}

	critical(message: string, ...args: any[]): void {
		if (this.getLevel() <= LogLevel.Critical) {
			console.log('%cCRITI', 'background: #f33; color: white', message, ...args);
		}
	}

	dispose(): void { }
}

export class MultiplexLogService extends AbstractLogService implements ILogService {
	_serviceBrand: any;

	constructor(private logServices: ILogService[]) {
		super();
		if (logServices.length) {
			this.setLevel(logServices[0].getLevel());
		}
	}

	public setLevel(level: LogLevel): void {
		for (const logService of this.logServices) {
			logService.setLevel(level);
		}
		super.setLevel(level);
	}

	public trace(message: string, ...args: any[]): void {
		for (const logService of this.logServices) {
			logService.trace(message, ...args);
		}
	}

	public debug(message: string, ...args: any[]): void {
		for (const logService of this.logServices) {
			logService.debug(message, ...args);
		}
	}

	public info(message: string, ...args: any[]): void {
		for (const logService of this.logServices) {
			logService.info(message, ...args);
		}
	}

	public warn(message: string, ...args: any[]): void {
		for (const logService of this.logServices) {
			logService.warn(message, ...args);
		}
	}

	public error(message: string | Error, ...args: any[]): void {
		for (const logService of this.logServices) {
			logService.error(message, ...args);
		}
	}

	public critical(message: string | Error, ...args: any[]): void {
		for (const logService of this.logServices) {
			logService.critical(message, ...args);
		}
	}

	public dispose(): void {
		for (const logService of this.logServices) {
			logService.dispose();
		}
	}
}

export class DelegatedLogService extends Disposable implements ILogService {
	_serviceBrand: any;

	constructor(private logService: ILogService) {
		super();
		this._register(logService);
	}

	get onDidChangeLogLevel(): Event<LogLevel> {
		return this.logService.onDidChangeLogLevel;
	}

	public setLevel(level: LogLevel): void {
		this.logService.setLevel(level);
	}

	public getLevel(): LogLevel {
		return this.logService.getLevel();
	}

	public trace(message: string, ...args: any[]): void {
		this.logService.trace(message, ...args);
	}

	public debug(message: string, ...args: any[]): void {
		this.logService.debug(message, ...args);
	}

	public info(message: string, ...args: any[]): void {
		this.logService.info(message, ...args);
	}

	public warn(message: string, ...args: any[]): void {
		this.logService.warn(message, ...args);
	}

	public error(message: string | Error, ...args: any[]): void {
		this.logService.error(message, ...args);
	}

	public critical(message: string | Error, ...args: any[]): void {
		this.logService.critical(message, ...args);
	}
}

export class NullLogService implements ILogService {
	_serviceBrand: any;
	readonly onDidChangeLogLevel: Event<LogLevel> = new Emitter<LogLevel>().event;
	public setLevel(level: LogLevel): void { }
	public getLevel(): LogLevel { return LogLevel.Info; }
	public trace(message: string, ...args: any[]): void { }
	public debug(message: string, ...args: any[]): void { }
	public info(message: string, ...args: any[]): void { }
	public warn(message: string, ...args: any[]): void { }
	public error(message: string | Error, ...args: any[]): void { }
	public critical(message: string | Error, ...args: any[]): void { }
	public dispose(): void { }
}

export function getLogLevel(environmentService: IEnvironmentService): LogLevel {
	if (environmentService.verbose) {
		return LogLevel.Trace;
	}
	if (typeof environmentService.args.log === 'string') {
		const logLevel = environmentService.args.log.toLowerCase();
		switch (logLevel) {
			case 'trace':
				return LogLevel.Trace;
			case 'debug':
				return LogLevel.Debug;
			case 'info':
				return LogLevel.Info;
			case 'warn':
				return LogLevel.Warning;
			case 'error':
				return LogLevel.Error;
			case 'critical':
				return LogLevel.Critical;
			case 'off':
				return LogLevel.Off;
		}
	}
	return DEFAULT_LOG_LEVEL;
}