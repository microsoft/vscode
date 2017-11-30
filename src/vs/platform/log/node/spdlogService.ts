/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { ILogService } from 'vs/platform/log/common/log';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';

export class SpdLogService implements ILogService {

	_serviceBrand: any;

	constructor(
		processName: string,
		@IEnvironmentService environmentService: IEnvironmentService
	) {
		// TODO create logger
	}

	trace(message: string, ...args: any[]): void {
		// console.log('TRACE', message, ...args);
	}

	debug(message: string, ...args: any[]): void {
		// console.log('DEBUG', message, ...args);
	}

	info(message: string, ...args: any[]): void {
		// console.log('INFO', message, ...args);
	}

	warn(message: string, ...args: any[]): void {
		// console.warn('WARN', message, ...args);
	}

	error(message: string | Error, ...args: any[]): void {
		// console.error('ERROR', message, ...args);
	}

	critical(message: string, ...args: any[]): void {
		// console.error('CRITICAL', message, ...args);
	}
}