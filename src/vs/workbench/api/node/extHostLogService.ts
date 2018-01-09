/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as path from 'path';
import * as vscode from 'vscode';
import { TPromise } from 'vs/base/common/winjs.base';
import { mkdirp, dirExists } from 'vs/base/node/pfs';
import Event, { Emitter } from 'vs/base/common/event';
import { LogLevel } from 'vs/workbench/api/node/extHostTypes';
import { ILogService } from 'vs/platform/log/common/log';
import { createSpdLogService } from 'vs/platform/log/node/spdlogService';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { memoize } from 'vs/base/common/decorators';

export class ExtHostLogService {
	private _loggers: Map<string, ExtHostLogger> = new Map();

	constructor(private _environmentService: IEnvironmentService) {
	}

	getExtLogger(extensionID: string): ExtHostLogger {
		if (!this._loggers.has(extensionID)) {
			const logService = createSpdLogService(extensionID, this._environmentService, extensionID);
			const logsDirPath = path.join(this._environmentService.logsPath, extensionID);
			this._loggers.set(extensionID, new ExtHostLogger(logService, logsDirPath));
		}

		return this._loggers.get(extensionID);
	}
}

export class ExtHostLogger implements vscode.Logger {
	private _currentLevel: LogLevel;
	private _onDidChangeLogLevel: Emitter<LogLevel>;

	constructor(
		private readonly _logService: ILogService,
		private readonly _logDirectory: string
	) {
		this._currentLevel = this._logService.getLevel();
		this._onDidChangeLogLevel = new Emitter<LogLevel>();
		this.onDidChangeLogLevel = this._onDidChangeLogLevel.event;
	}

	// TODO
	readonly onDidChangeLogLevel: Event<LogLevel>;

	get currentLevel(): LogLevel { return this._currentLevel; }

	@memoize
	get logDirectory(): TPromise<string> {
		return dirExists(this._logDirectory).then(exists => {
			if (exists) {
				return TPromise.wrap(null);
			} else {
				return mkdirp(this._logDirectory);
			}
		}).then(() => {
			return this._logDirectory;
		});
	}

	trace(message: string, ...args: any[]): void {
		return this._logService.trace(message, ...args);
	}

	debug(message: string, ...args: any[]): void {
		return this._logService.debug(message, ...args);
	}

	info(message: string, ...args: any[]): void {
		return this._logService.info(message, ...args);
	}

	warn(message: string, ...args: any[]): void {
		return this._logService.warn(message, ...args);
	}

	error(message: string | Error, ...args: any[]): void {
		return this._logService.error(message, ...args);
	}

	critical(message: string | Error, ...args: any[]): void {
		return this._logService.critical(message, ...args);
	}
}
