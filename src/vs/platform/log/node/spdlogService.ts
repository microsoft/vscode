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
import { fromNodeEventEmitter } from 'vs/base/common/event';
import { TPromise } from 'vs/base/common/winjs.base';
import { readdir, rimraf } from 'vs/base/node/pfs';

export class SpdLogService implements ILogService {

	_serviceBrand: any;

	private logger: RotatingLogger;
	private disposables: IDisposable[] = [];
	private formatRegexp = /{(\d+)}/g;

	constructor(
		processName: string,
		@IEnvironmentService private environmentService: IEnvironmentService
	) {
		setAsyncMode(8192, 2000);

		const logfilePath = path.join(environmentService.logsPath, `${processName}.log`);
		this.logger = new RotatingLogger(processName, logfilePath, 1024 * 1024 * 5, 6);
		this.setLevel(environmentService.logLevel);

		fromNodeEventEmitter(process, 'exit')(() => this.logger.flush(), null, this.disposables);
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
		this.logger.setLevel(logLevel);
	}

	// TODO, what about ARGS?
	trace(message: string, ...args: any[]): void {
		this.logger.trace(this.format(message, args));
	}

	debug(message: string, ...args: any[]): void {
		this.logger.debug(this.format(message, args));
	}

	info(message: string, ...args: any[]): void {
		this.logger.info(this.format(message, args));
	}

	warn(message: string, ...args: any[]): void {
		this.logger.warn(this.format(message, args));
	}

	error(arg: string | Error, ...args: any[]): void {
		const message = arg instanceof Error ? arg.stack : arg;
		this.logger.error(this.format(message, args));
	}

	critical(message: string, ...args: any[]): void {
		this.logger.critical(this.format(message, args));
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}

	private format(value: string, ...args: any[]): string {
		if (args.length) {
			value = value.replace(this.formatRegexp, (match, group) => {
				let idx = parseInt(group, 10);
				return isNaN(idx) || idx < 0 || idx >= args.length ?
					match :
					this.toStringValue(args[idx]);
			});
		}
		return value;
	}

	private toStringValue(value: any): string {
		if (typeof value === 'object') {
			try {
				return JSON.stringify(value);
			} catch (e) { }
		}
		return value;
	}
}