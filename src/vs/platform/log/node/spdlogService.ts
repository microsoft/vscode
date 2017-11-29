/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as path from 'path';
import { ILogService } from 'vs/platform/log/common/log';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { RotatingLogger } from 'spdlog';

export class SpdLogService implements ILogService {

	_serviceBrand: any;

	private logger: RotatingLogger;

	constructor(
		processName: string,
		@IEnvironmentService environmentService: IEnvironmentService
	) {
		// const logfilePath = path.join(environmentService.userDataPath, 'logs', processName);
		this.logger = new RotatingLogger(processName, 'LOG', 1024 * 1024 * 5, 6);
	}

	trace(message: string, ...args: any[]): void {
		this.logger.trace(message);
	}

	debug(message: string, ...args: any[]): void {
		this.logger.debug(message);
	}

	info(message: string, ...args: any[]): void {
		this.logger.info(message);
	}

	warn(message: string, ...args: any[]): void {
		this.logger.warn(message);
	}

	error(arg: string | Error, ...args: any[]): void {
		const message = arg instanceof Error ? arg.stack : arg;
		this.logger.error(message);
	}

	critical(message: string, ...args: any[]): void {
		this.logger.critical(message);
	}
}