/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as path from 'path';
import { ILogService, LogLevel } from 'vs/platform/log/common/log';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { RotatingLogger, setAsyncMode } from 'spdlog';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { TPromise } from 'vs/base/common/winjs.base';
import { readdir, rimraf } from 'vs/base/node/pfs';

export class SpdLogService implements ILogService {

	_serviceBrand: any;

	private level: LogLevel = LogLevel.Error;
	private logger: RotatingLogger;
	private disposables: IDisposable[] = [];

	constructor(
		processName: string,
		@IEnvironmentService private environmentService: IEnvironmentService
	) {
		setAsyncMode(8192, 2000);

		const logfilePath = path.join(environmentService.logsPath, `${processName}.log`);
		this.logger = new RotatingLogger(processName, logfilePath, 1024 * 1024 * 5, 6);
		this.setLevel(environmentService.logLevel);
	}

	/**
	 * Cleans up older logs, while keeping the 10 most recent ones.
	 */
	async cleanup(): TPromise<void> {
		const currentLog = path.basename(this.environmentService.logsPath);
		const logsRoot = path.dirname(this.environmentService.logsPath);
		const children = await readdir(logsRoot);
		const allSessions = children.filter(name => /^\d{8}T\d{6}$/.test(name));
		const oldSessions = allSessions.sort().filter((d, i) => d !== currentLog);
		const toDelete = oldSessions.slice(0, Math.max(0, oldSessions.length - 9));

		await TPromise.join(toDelete.map(name => rimraf(path.join(logsRoot, name))));
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