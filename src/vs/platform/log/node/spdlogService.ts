/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as path from 'path';
import { ILogService } from 'vs/platform/log/common/log';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { RotatingLogger, setAsyncMode } from 'spdlog';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { fromNodeEventEmitter } from 'vs/base/common/event';

export class SpdLogService implements ILogService {

	_serviceBrand: any;

	private logger: RotatingLogger;
	private disposables: IDisposable[] = [];

	constructor(
		processName: string,
		@IEnvironmentService environmentService: IEnvironmentService
	) {
		setAsyncMode(8192, 2000);

		const logfilePath = path.join(environmentService.logsPath, `${processName}.log`);
		this.logger = new RotatingLogger(processName, logfilePath, 1024 * 1024 * 5, 6);

		fromNodeEventEmitter(process, 'exit')(() => this.logger.flush(), null, this.disposables);
	}

	// TODO, what about ARGS?
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

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}