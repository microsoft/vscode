/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { Event } from 'vs/base/common/event';
import { IChannel, IServerChannel } from 'vs/base/parts/ipc/common/ipc';
import { AbstractLoggerService, AbstractMessageLogger, AdapterLogger, DidChangeLoggersEvent, ILogger, ILoggerOptions, ILoggerResource, ILoggerService, isLogLevel, LogLevel } from 'vs/platform/log/common/log';
import { Disposable } from 'vs/base/common/lifecycle';

export class LoggerChannelClient extends AbstractLoggerService implements ILoggerService {

	constructor(private readonly windowId: number | undefined, logLevel: LogLevel, loggers: ILoggerResource[], private readonly channel: IChannel) {
		super(logLevel, loggers);
		this._register(channel.listen<LogLevel | [URI, LogLevel]>('onDidChangeLogLevel', windowId)(arg => {
			if (isLogLevel(arg)) {
				super.setLogLevel(arg);
			} else {
				super.setLogLevel(URI.revive(arg[0]), arg[1]);
			}
		}));
		this._register(channel.listen<[URI, boolean]>('onDidChangeVisibility', windowId)(([resource, visibility]) => super.setVisibility(URI.revive(resource), visibility)));
		this._register(channel.listen<DidChangeLoggersEvent>('onDidChangeLoggers', windowId)(({ added, removed }) => {
			for (const loggerResource of added) {
				super.registerLogger({ ...loggerResource, resource: URI.revive(loggerResource.resource) });
			}
			for (const loggerResource of removed) {
				super.deregisterLogger(loggerResource.resource);
			}
		}));
	}

	createConsoleMainLogger(): ILogger {
		return new AdapterLogger({
			log: (level: LogLevel, args: any[]) => {
				this.channel.call('consoleLog', [level, args]);
			}
		});
	}

	override registerLogger(logger: ILoggerResource): void {
		super.registerLogger(logger);
		this.channel.call('registerLogger', [logger, this.windowId]);
	}

	override deregisterLogger(resource: URI): void {
		super.deregisterLogger(resource);
		this.channel.call('deregisterLogger', [resource, this.windowId]);
	}

	override setLogLevel(logLevel: LogLevel): void;
	override setLogLevel(resource: URI, logLevel: LogLevel): void;
	override setLogLevel(arg1: any, arg2?: any): void {
		super.setLogLevel(arg1, arg2);
		this.channel.call('setLogLevel', [arg1, arg2]);
	}

	override setVisibility(resource: URI, visibility: boolean): void {
		super.setVisibility(resource, visibility);
		this.channel.call('setVisibility', [resource, visibility]);
	}

	protected doCreateLogger(file: URI, logLevel: LogLevel, options?: ILoggerOptions): ILogger {
		return new Logger(this.channel, file, logLevel, options, this.windowId);
	}

	public static setLogLevel(channel: IChannel, level: LogLevel): Promise<void>;
	public static setLogLevel(channel: IChannel, resource: URI, level: LogLevel): Promise<void>;
	public static setLogLevel(channel: IChannel, arg1: any, arg2?: any): Promise<void> {
		return channel.call('setLogLevel', [arg1, arg2]);
	}

}

class Logger extends AbstractMessageLogger {

	private isLoggerCreated: boolean = false;
	private buffer: [LogLevel, string][] = [];

	constructor(
		private readonly channel: IChannel,
		private readonly file: URI,
		logLevel: LogLevel,
		loggerOptions?: ILoggerOptions,
		windowId?: number | undefined
	) {
		super(loggerOptions?.logLevel === 'always');
		this.setLevel(logLevel);
		this.channel.call('createLogger', [file, loggerOptions, windowId])
			.then(() => {
				this.doLog(this.buffer);
				this.isLoggerCreated = true;
			});
	}

	protected log(level: LogLevel, message: string) {
		const messages: [LogLevel, string][] = [[level, message]];
		if (this.isLoggerCreated) {
			this.doLog(messages);
		} else {
			this.buffer.push(...messages);
		}
	}

	private doLog(messages: [LogLevel, string][]) {
		this.channel.call('log', [this.file, messages]);
	}
}

export class LoggerChannel implements IServerChannel {

	constructor(private readonly loggerService: ILoggerService) { }

	listen(_: unknown, event: string, windowId?: number): Event<any> {
		switch (event) {
			case 'onDidChangeLoggers': return this.loggerService.onDidChangeLoggers;
			case 'onDidChangeVisibility': return this.loggerService.onDidChangeVisibility;
			case 'onDidChangeLogLevel': return this.loggerService.onDidChangeLogLevel;
		}
		throw new Error(`Event not found: ${event}`);
	}

	async call(_: unknown, command: string, arg?: any): Promise<any> {
		switch (command) {
			case 'setLogLevel': return isLogLevel(arg[0]) ? this.loggerService.setLogLevel(arg[0]) : this.loggerService.setLogLevel(URI.revive(arg[0]), arg[1]);
			case 'getRegisteredLoggers': return Promise.resolve([...this.loggerService.getRegisteredLoggers()]);
		}

		throw new Error(`Call not found: ${command}`);
	}

}

export class RemoteLoggerChannelClient extends Disposable {

	constructor(loggerService: ILoggerService, channel: IChannel) {
		super();

		channel.call('setLogLevel', [loggerService.getLogLevel()]);
		this._register(loggerService.onDidChangeLogLevel(arg => channel.call('setLogLevel', [arg])));

		channel.call<ILoggerResource[]>('getRegisteredLoggers').then(loggers => {
			for (const loggerResource of loggers) {
				loggerService.registerLogger({ ...loggerResource, resource: URI.revive(loggerResource.resource) });
			}
		});

		this._register(channel.listen<[URI, boolean]>('onDidChangeVisibility')(([resource, visibility]) => loggerService.setVisibility(URI.revive(resource), visibility)));

		this._register(channel.listen<DidChangeLoggersEvent>('onDidChangeLoggers')(({ added, removed }) => {
			for (const loggerResource of added) {
				loggerService.registerLogger({ ...loggerResource, resource: URI.revive(loggerResource.resource) });
			}
			for (const loggerResource of removed) {
				loggerService.deregisterLogger(loggerResource.resource);
			}
		}));

	}
}
