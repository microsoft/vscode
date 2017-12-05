/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { createDecorator as createServiceDecorator } from 'vs/platform/instantiation/common/instantiation';
import { createDecorator } from 'vs/base/common/decorators';
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

export class MultiplexLogService implements ILogService {
	_serviceBrand: any;

	constructor(private logServices: ILogService[]) { }

	setLevel(level: LogLevel): void {
		for (const logService of this.logServices) {
			logService.setLevel(level);
		}
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

export class NoopLogService implements ILogService {
	_serviceBrand: any;
	setLevel(level: LogLevel): void { }
	trace(message: string, ...args: any[]): void { }
	debug(message: string, ...args: any[]): void { }
	info(message: string, ...args: any[]): void { }
	warn(message: string, ...args: any[]): void { }
	error(message: string | Error, ...args: any[]): void { }
	critical(message: string | Error, ...args: any[]): void { }
	dispose(): void { }
}

let globalLogService: ILogService = new NoopLogService();

export function registerGlobalLogService(logService: ILogService): void {
	globalLogService = logService;
}

export function log(level: LogLevel, prefix: string, logFn?: (message: string, ...args: any[]) => string): Function {
	return createDecorator((fn, key) => {
		// TODO@Joao: load-time log level? return fn;

		return function (this: any, ...args: any[]) {
			let message = `${prefix} - ${key}`;

			if (logFn) {
				message = logFn(message, ...args);
			}

			switch (level) {
				case LogLevel.Trace: globalLogService.trace(message); break;
				case LogLevel.Debug: globalLogService.debug(message); break;
				case LogLevel.Info: globalLogService.info(message); break;
				case LogLevel.Warning: globalLogService.warn(message); break;
				case LogLevel.Error: globalLogService.error(message); break;
				case LogLevel.Critical: globalLogService.critical(message); break;
			}

			return fn.apply(this, args);
		};
	});
}