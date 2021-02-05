/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChannel, IServerChannel } from 'vs/base/parts/ipc/common/ipc';
import { LogLevel, ILogService, LogService, ILoggerService, ILogger, AbstractMessageLogger } from 'vs/platform/log/common/log';
import { Event } from 'vs/base/common/event';
import { URI } from 'vs/base/common/uri';

export class LoggerChannel implements IServerChannel {

	onDidChangeLogLevel: Event<LogLevel>;

	constructor(
		private service: ILogService,
		private readonly loggerService: ILoggerService,
	) {
		this.onDidChangeLogLevel = Event.buffer(service.onDidChangeLogLevel, true);
	}

	listen(_: unknown, event: string): Event<any> {
		switch (event) {
			case 'onDidChangeLogLevel': return this.onDidChangeLogLevel;
		}

		throw new Error(`Event not found: ${event}`);
	}

	async call(_: unknown, command: string, arg?: any): Promise<any> {
		switch (command) {
			case 'setLevel': return this.service.setLevel(arg);
			case 'consoleLog': return this.consoleLog(arg[0], arg[1]);
			case 'initLogger': this.getLogger(URI.revive(arg[0])); return;
			case 'log': return this.log(URI.revive(arg[0]), arg[1], arg[2]);
		}

		throw new Error(`Call not found: ${command}`);
	}

	private consoleLog(severity: string, args: string[]): void {
		let consoleFn = console.log;

		switch (severity) {
			case 'error':
				consoleFn = console.error;
				break;
			case 'warn':
				consoleFn = console.warn;
				break;
			case 'info':
				consoleFn = console.info;
				break;
		}

		consoleFn.call(console, ...args);
	}

	private getLogger(file: URI): ILogger {
		return this.loggerService.getLogger(file);
	}

	private log(file: URI, level: LogLevel, message: string): void {
		const logger = this.getLogger(file);
		switch (level) {
			case LogLevel.Trace: logger.trace(message); break;
			case LogLevel.Debug: logger.debug(message); break;
			case LogLevel.Info: logger.info(message); break;
			case LogLevel.Warning: logger.warn(message); break;
			case LogLevel.Error: logger.error(message); break;
			case LogLevel.Critical: logger.critical(message); break;
			default: throw new Error('Invalid log level');
		}
	}
}

export class LoggerChannelClient {

	constructor(private channel: IChannel) { }

	get onDidChangeLogLevel(): Event<LogLevel> {
		return this.channel.listen('onDidChangeLogLevel');
	}

	setLevel(level: LogLevel): void {
		LoggerChannelClient.setLevel(this.channel, level);
	}

	public static setLevel(channel: IChannel, level: LogLevel): Promise<void> {
		return channel.call('setLevel', level);
	}

	consoleLog(severity: string, args: string[]): void {
		this.channel.call('consoleLog', [severity, args]);
	}

	getLogger(file: URI): ILogger {
		this.channel.call('initLogger', [file]);
		const that = this;
		return new class extends AbstractMessageLogger {
			protected log(level: LogLevel, message: string) {
				that.channel.call('log', [file, level, message]);
			}
		};
	}
}

export class FollowerLogService extends LogService implements ILogService {
	declare readonly _serviceBrand: undefined;

	constructor(private parent: LoggerChannelClient, logService: ILogService) {
		super(logService);
		this._register(parent.onDidChangeLogLevel(level => logService.setLevel(level)));
	}

	setLevel(level: LogLevel): void {
		super.setLevel(level);

		this.parent.setLevel(level);
	}
}
