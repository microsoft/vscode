/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { createDecorator as createServiceDecorator } from 'vs/platform/instantiation/common/instantiation';
import { createDecorator } from 'vs/base/common/decorators';

export const ILogService = createServiceDecorator<ILogService>('logService');

export enum LogLevel {
	TRACE,
	DEBUG,
	INFO,
	WARN,
	ERROR,
	CRITICAL
}

export interface ILogService {
	_serviceBrand: any;

	trace(message: string, ...args: any[]): void;
	debug(message: string, ...args: any[]): void;
	info(message: string, ...args: any[]): void;
	warn(message: string, ...args: any[]): void;
	error(message: string | Error, ...args: any[]): void;
	critical(message: string | Error, ...args: any[]): void;
}

export class LegacyLogMainService implements ILogService {

	_serviceBrand: any;

	constructor(
		processName: string,
		@IEnvironmentService private environmentService: IEnvironmentService
	) { }

	trace(message: string, ...args: any[]): void {
		// console.log(`\x1b[90m[main ${new Date().toLocaleTimeString()}]\x1b[0m`, ...args);
	}

	debug(message: string, ...args: any[]): void {
		// console.log(`\x1b[90m[main ${new Date().toLocaleTimeString()}]\x1b[0m`, ...args);
	}

	info(message: string, ...args: any[]): void {
		if (this.environmentService.verbose) {
			console.log(`\x1b[90m[main ${new Date().toLocaleTimeString()}]\x1b[0m`, ...args);
		}
	}

	error(message: string, ...args: any[]): void {
		console.error(`\x1b[91m[main ${new Date().toLocaleTimeString()}]\x1b[0m`, ...args);
	}

	warn(message: string | Error, ...args: any[]): void {
		console.warn(`\x1b[93m[main ${new Date().toLocaleTimeString()}]\x1b[0m`, ...args);
	}

	critical(message: string, ...args: any[]): void {
		// console.log(`\x1b[90m[main ${new Date().toLocaleTimeString()}]\x1b[0m`, ...args);
	}
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
				case LogLevel.TRACE: this.logService.trace(message); break;
				case LogLevel.DEBUG: this.logService.debug(message); break;
				case LogLevel.INFO: this.logService.info(message); break;
				case LogLevel.WARN: this.logService.warn(message); break;
				case LogLevel.ERROR: this.logService.error(message); break;
				case LogLevel.CRITICAL: this.logService.critical(message); break;
			}

			return fn.apply(this, args);
		};
	});
}

export class NoopLogService implements ILogService {
	_serviceBrand: any;
	trace(message: string, ...args: any[]): void { }
	debug(message: string, ...args: any[]): void { }
	info(message: string, ...args: any[]): void { }
	warn(message: string, ...args: any[]): void { }
	error(message: string | Error, ...args: any[]): void { }
	critical(message: string | Error, ...args: any[]): void { }
}