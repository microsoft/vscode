/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { ResourceMap } from 'vs/base/common/map';
import { URI } from 'vs/base/common/uri';
import { IServerChannel } from 'vs/base/parts/ipc/common/ipc';
import { ILogger, ILoggerOptions, isLogLevel, log, LogLevel } from 'vs/platform/log/common/log';
import { ILoggerMainService } from 'vs/platform/log/electron-main/loggerService';

export class LoggerChannel implements IServerChannel {

	private readonly loggers = new ResourceMap<ILogger>();

	constructor(private readonly loggerService: ILoggerMainService) { }

	listen(_: unknown, event: string, windowId?: number): Event<any> {
		switch (event) {
			case 'onDidChangeLoggers': return windowId ? this.loggerService.getOnDidChangeLoggersEvent(windowId) : this.loggerService.onDidChangeLoggers;
			case 'onDidChangeLogLevel': return windowId ? this.loggerService.getOnDidChangeLogLevelEvent(windowId) : this.loggerService.onDidChangeLogLevel;
			case 'onDidChangeVisibility': return windowId ? this.loggerService.getOnDidChangeVisibilityEvent(windowId) : this.loggerService.onDidChangeVisibility;
		}
		throw new Error(`Event not found: ${event}`);
	}

	async call(_: unknown, command: string, arg?: any): Promise<any> {
		switch (command) {
			case 'createLogger': this.createLogger(URI.revive(arg[0]), arg[1], arg[2]); return;
			case 'log': return this.log(URI.revive(arg[0]), arg[1]);
			case 'consoleLog': return this.consoleLog(arg[0], arg[1]);
			case 'setLogLevel': return isLogLevel(arg[0]) ? this.loggerService.setLogLevel(arg[0]) : this.loggerService.setLogLevel(URI.revive(arg[0]), arg[1]);
			case 'setVisibility': return this.loggerService.setVisibility(URI.revive(arg[0]), arg[1]);
			case 'registerLogger': return this.loggerService.registerLogger({ ...arg[0], resource: URI.revive(arg[0].resource) }, arg[1]);
			case 'deregisterLogger': return this.loggerService.deregisterLogger(URI.revive(arg[0]));
		}

		throw new Error(`Call not found: ${command}`);
	}

	private createLogger(file: URI, options: ILoggerOptions, windowId: number | undefined): void {
		this.loggers.set(file, this.loggerService.createLogger(file, options, windowId));
	}

	private consoleLog(level: LogLevel, args: any[]): void {
		let consoleFn = console.log;

		switch (level) {
			case LogLevel.Error:
				consoleFn = console.error;
				break;
			case LogLevel.Warning:
				consoleFn = console.warn;
				break;
			case LogLevel.Info:
				consoleFn = console.info;
				break;
		}

		consoleFn.call(console, ...args);
	}

	private log(file: URI, messages: [LogLevel, string][]): void {
		const logger = this.loggers.get(file);
		if (!logger) {
			throw new Error('Create the logger before logging');
		}
		for (const [level, message] of messages) {
			log(logger, level, message);
		}
	}
}

