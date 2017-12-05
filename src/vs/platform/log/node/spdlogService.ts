/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as path from 'path';
import { ILogService, LogLevel, NoopLogService } from 'vs/platform/log/common/log';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { RotatingLogger, setAsyncMode } from 'spdlog';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';

export function createLogService(processName: string, environmentService: IEnvironmentService): ILogService {
	try {
		setAsyncMode(8192, 2000);
		const logfilePath = path.join(environmentService.logsPath, `${processName}.log`);
		const logger = new RotatingLogger(processName, logfilePath, 1024 * 1024 * 5, 6);
		return new SpdLogService(logger, environmentService.logLevel);
	} catch (e) {
		console.error(e);
	}
	return new NoopLogService();
}

class SpdLogService implements ILogService {

	_serviceBrand: any;

	private disposables: IDisposable[] = [];

	constructor(
		private readonly logger: RotatingLogger,
		private level: LogLevel = LogLevel.Error
	) {
	}

	setLevel(logLevel: LogLevel): void {
		this.level = logLevel;
	}

	trace(message: string, ...args: any[]): void {
		if (this.level <= LogLevel.Trace) {
			this.logger.trace(this.format(message, args));
		}
	}

	debug(message: string, ...args: any[]): void {
		if (this.level <= LogLevel.Debug) {
			this.logger.debug(this.format(message, args));
		}
	}

	info(message: string, ...args: any[]): void {
		if (this.level <= LogLevel.Info) {
			this.logger.info(this.format(message, args));
		}
	}

	warn(message: string, ...args: any[]): void {
		if (this.level <= LogLevel.Warning) {
			this.logger.warn(this.format(message, args));
		}
	}

	error(arg: string | Error, ...args: any[]): void {
		if (this.level <= LogLevel.Error) {
			const message = arg instanceof Error ? arg.stack : arg;
			this.logger.error(this.format(message, args));
		}
	}

	critical(message: string, ...args: any[]): void {
		if (this.level <= LogLevel.Critical) {
			this.logger.critical(this.format(message, args));
		}
	}

	dispose(): void {
		this.logger.flush();
		this.logger.drop();
		this.disposables = dispose(this.disposables);
	}

	private format(value: string, args: any[] = []): string {
		const strs = args.map(a => {
			if (typeof a === 'object') {
				try {
					return JSON.stringify(a);
				} catch (e) { }
			}
			return a;
		});

		return [value, ...strs].join(' ');
	}
}