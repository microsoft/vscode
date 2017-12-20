/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { createDecorator as createServiceDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IDisposable } from 'vs/base/common/lifecycle';
import { isWindows } from 'vs/base/common/platform';

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

export interface ILogService extends IDisposable {
	_serviceBrand: any;

	setLevel(level: LogLevel): void;
	getLevel(): LogLevel;
	trace(message: string, ...args: any[]): void;
	debug(message: string, ...args: any[]): void;
	info(message: string, ...args: any[]): void;
	warn(message: string, ...args: any[]): void;
	error(message: string | Error, ...args: any[]): void;
	critical(message: string | Error, ...args: any[]): void;
}

export class ConsoleLogMainService implements ILogService {

	_serviceBrand: any;
	private level: LogLevel = LogLevel.Error;
	private useColors: boolean;

	constructor( @IEnvironmentService environmentService: IEnvironmentService) {
		this.setLevel(environmentService.logLevel);
		this.useColors = !isWindows;
	}

	setLevel(level: LogLevel): void {
		this.level = level;
	}

	getLevel(): LogLevel {
		return this.level;
	}

	trace(message: string, ...args: any[]): void {
		if (this.level <= LogLevel.Trace) {
			if (this.useColors) {
				console.log(`\x1b[90m[main ${new Date().toLocaleTimeString()}]\x1b[0m`, message, ...args);
			} else {
				console.log(`[main ${new Date().toLocaleTimeString()}]`, message, ...args);
			}
		}
	}

	debug(message: string, ...args: any[]): void {
		if (this.level <= LogLevel.Debug) {
			if (this.useColors) {
				console.log(`\x1b[90m[main ${new Date().toLocaleTimeString()}]\x1b[0m`, message, ...args);
			} else {
				console.log(`[main ${new Date().toLocaleTimeString()}]`, message, ...args);
			}
		}
	}

	info(message: string, ...args: any[]): void {
		if (this.level <= LogLevel.Info) {
			if (this.useColors) {
				console.log(`\x1b[90m[main ${new Date().toLocaleTimeString()}]\x1b[0m`, message, ...args);
			} else {
				console.log(`[main ${new Date().toLocaleTimeString()}]`, message, ...args);
			}
		}
	}

	warn(message: string | Error, ...args: any[]): void {
		if (this.level <= LogLevel.Warning) {
			if (this.useColors) {
				console.warn(`\x1b[93m[main ${new Date().toLocaleTimeString()}]\x1b[0m`, message, ...args);
			} else {
				console.warn(`[main ${new Date().toLocaleTimeString()}]`, message, ...args);
			}
		}
	}

	error(message: string, ...args: any[]): void {
		if (this.level <= LogLevel.Error) {
			if (this.useColors) {
				console.error(`\x1b[91m[main ${new Date().toLocaleTimeString()}]\x1b[0m`, message, ...args);
			} else {
				console.error(`[main ${new Date().toLocaleTimeString()}]`, message, ...args);
			}
		}
	}

	critical(message: string, ...args: any[]): void {
		if (this.level <= LogLevel.Critical) {
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

export class ConsoleLogService implements ILogService {

	_serviceBrand: any;
	private level: LogLevel = LogLevel.Error;

	constructor( @IEnvironmentService environmentService: IEnvironmentService) {
		this.setLevel(environmentService.logLevel);
	}

	setLevel(level: LogLevel): void {
		this.level = level;
	}

	getLevel(): LogLevel {
		return this.level;
	}

	trace(message: string, ...args: any[]): void {
		if (this.level <= LogLevel.Trace) {
			console.log('%cTRACE', 'color: #888', message, ...args);
		}
	}

	debug(message: string, ...args: any[]): void {
		if (this.level <= LogLevel.Debug) {
			console.log('%cDEBUG', 'background: #eee; color: #888', message, ...args);
		}
	}

	info(message: string, ...args: any[]): void {
		if (this.level <= LogLevel.Info) {
			console.log('%c INFO', 'color: #33f', message, ...args);
		}
	}

	warn(message: string | Error, ...args: any[]): void {
		if (this.level <= LogLevel.Warning) {
			console.log('%c WARN', 'color: #993', message, ...args);
		}
	}

	error(message: string, ...args: any[]): void {
		if (this.level <= LogLevel.Error) {
			console.log('%c  ERR', 'color: #f33', message, ...args);
		}
	}

	critical(message: string, ...args: any[]): void {
		if (this.level <= LogLevel.Critical) {
			console.log('%cCRITI', 'background: #f33; color: white', message, ...args);
		}
	}

	dispose(): void { }
}

export class MultiplexLogService implements ILogService {
	_serviceBrand: any;

	constructor(private logServices: ILogService[]) { }

	setLevel(level: LogLevel): void {
		for (const logService of this.logServices) {
			logService.setLevel(level);
		}
	}

	getLevel(): LogLevel {
		for (const logService of this.logServices) {
			return logService.getLevel();
		}
		return LogLevel.Info;
	}

	trace(message: string, ...args: any[]): void {
		for (const logService of this.logServices) {
			logService.trace(message, ...args);
		}
	}

	debug(message: string, ...args: any[]): void {
		for (const logService of this.logServices) {
			logService.debug(message, ...args);
		}
	}

	info(message: string, ...args: any[]): void {
		for (const logService of this.logServices) {
			logService.info(message, ...args);
		}
	}

	warn(message: string, ...args: any[]): void {
		for (const logService of this.logServices) {
			logService.warn(message, ...args);
		}
	}

	error(message: string | Error, ...args: any[]): void {
		for (const logService of this.logServices) {
			logService.error(message, ...args);
		}
	}

	critical(message: string | Error, ...args: any[]): void {
		for (const logService of this.logServices) {
			logService.critical(message, ...args);
		}
	}

	dispose(): void {
		for (const logService of this.logServices) {
			logService.dispose();
		}
	}
}

export class NullLogService implements ILogService {
	_serviceBrand: any;
	setLevel(level: LogLevel): void { }
	getLevel(): LogLevel { return LogLevel.Info; }
	trace(message: string, ...args: any[]): void { }
	debug(message: string, ...args: any[]): void { }
	info(message: string, ...args: any[]): void { }
	warn(message: string, ...args: any[]): void { }
	error(message: string | Error, ...args: any[]): void { }
	critical(message: string | Error, ...args: any[]): void { }
	dispose(): void { }
}
