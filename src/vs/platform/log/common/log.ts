/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';

export const ILogService = createDecorator<ILogService>('logService');

export interface ILogService {
	_serviceBrand: any;

	trace(message: string, ...args: any[]): void;
	debug(message: string, ...args: any[]): void;
	verbose(message: string, ...args: any[]): void;
	info(message: string, ...args: any[]): void;
	warn(message: string, ...args: any[]): void;
	error(message: string | Error, ...args: any[]): void;
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

	verbose(message: string, ...args: any[]): void {
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
}