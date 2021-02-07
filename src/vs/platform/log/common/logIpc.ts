/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChannel, IServerChannel } from 'vs/base/parts/ipc/common/ipc';
import { LogLevel, ILogService, LogService, ILoggerService, ILogger, AbstractMessageLogger, ILoggerOptions } from 'vs/platform/log/common/log';
import { Event } from 'vs/base/common/event';
import { URI } from 'vs/base/common/uri';

export class LogLevelChannel implements IServerChannel {

	onDidChangeLogLevel: Event<LogLevel>;

	constructor(private service: ILogService) {
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
		}

		throw new Error(`Call not found: ${command}`);
	}

}

export class LoggerChannel implements IServerChannel {

	private consoleLogger: ILogger | undefined;
	private readonly loggers = new Map<string, ILogger>();

	constructor(private readonly loggerService: ILoggerService) { }

	listen(_: unknown, event: string): Event<any> {
		throw new Error(`Event not found: ${event}`);
	}

	async call(_: unknown, command: string, arg?: any): Promise<any> {
		switch (command) {
			case 'createConsoleLogger': return this.createConsoleLogger();
			case 'createLogger': this.createLogger(URI.revive(arg[0]), arg[1]); return;
			case 'log': return this.log(URI.revive(arg[0]), arg[1]);
		}

		throw new Error(`Call not found: ${command}`);
	}

	private createConsoleLogger(): void {
		this.consoleLogger = new class extends AbstractMessageLogger {
			protected log(level: LogLevel, message: string) {
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

				consoleFn.call(console, message);
			}
		}();
	}

	private createLogger(file: URI, options: ILoggerOptions): void {
		this.loggers.set(file.toString(), this.loggerService.createLogger(file, options));
	}

	private log(file: URI | undefined, messages: [LogLevel, string][]): void {
		const logger = file ? this.loggers.get(file.toString()) : this.consoleLogger;
		if (!logger) {
			throw new Error('Create the logger before logging');
		}
		for (const [level, message] of messages) {
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
}

export class LogLevelChannelClient {

	constructor(private channel: IChannel) { }

	get onDidChangeLogLevel(): Event<LogLevel> {
		return this.channel.listen('onDidChangeLogLevel');
	}

	setLevel(level: LogLevel): void {
		LogLevelChannelClient.setLevel(this.channel, level);
	}

	public static setLevel(channel: IChannel, level: LogLevel): Promise<void> {
		return channel.call('setLevel', level);
	}

}

export class FollowerLogService extends LogService implements ILogService {
	declare readonly _serviceBrand: undefined;

	constructor(private parent: LogLevelChannelClient, logService: ILogService) {
		super(logService);
		this._register(parent.onDidChangeLogLevel(level => logService.setLevel(level)));
	}

	setLevel(level: LogLevel): void {
		super.setLevel(level);

		this.parent.setLevel(level);
	}
}
