/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { URI, UriDto } from 'vs/base/common/uri';
import { IChannel, IServerChannel } from 'vs/base/parts/ipc/common/ipc';
import { AbstractLoggerService, AbstractMessageLogger, AdapterLogger, DidChangeLoggerResourceEvent, ILogger, ILoggerOptions, ILoggerResource, ILoggerService, ILogService, LogLevel, LogService } from 'vs/platform/log/common/log';

export class LogLevelChannel implements IServerChannel {

	onDidChangeLogLevel: Event<LogLevel>;

	constructor(
		private readonly logService: ILogService,
		private readonly loggerService: ILoggerService
	) {
		this.onDidChangeLogLevel = Event.buffer(logService.onDidChangeLogLevel, true);
	}

	listen(_: unknown, event: string): Event<any> {
		switch (event) {
			case 'onDidChangeLogLevel': return this.onDidChangeLogLevel;
		}

		throw new Error(`Event not found: ${event}`);
	}

	async call(_: unknown, command: string, arg?: any): Promise<any> {
		switch (command) {
			case 'setLevel': return arg[1] ? this.loggerService.setLogLevel(URI.revive(arg[1]), arg[0]) : this.logService.setLevel(arg[0]);
		}

		throw new Error(`Call not found: ${command}`);
	}

}

export class LogLevelChannelClient {

	constructor(private channel: IChannel) { }

	get onDidChangeLogLevel(): Event<LogLevel> {
		return this.channel.listen('onDidChangeLogLevel');
	}

	setLevel(level: LogLevel, resource?: URI): void {
		LogLevelChannelClient.setLevel(this.channel, level, resource);
	}

	public static setLevel(channel: IChannel, level: LogLevel, resource?: URI): Promise<void> {
		return channel.call('setLevel', [level, resource]);
	}

}

export class LoggerChannelClient extends AbstractLoggerService implements ILoggerService {

	constructor(private readonly windowId: number | undefined, logLevel: LogLevel, onDidChangeLogLevel: Event<LogLevel>, loggers: UriDto<ILoggerResource>[], private readonly channel: IChannel) {
		super(logLevel, onDidChangeLogLevel, loggers.map(loggerResource => ({ ...loggerResource, resource: URI.revive(loggerResource.resource) })));
		this._register(channel.listen<ILoggerResource>('onDidChangeLogLevel', windowId)((loggerResource) => super.setLogLevel(URI.revive(loggerResource.resource), loggerResource.logLevel ?? this.logLevel)));
		this._register(channel.listen<DidChangeLoggerResourceEvent>('onDidChangeLoggerResources', windowId)(({ added, removed }) => {
			for (const loggerResource of added) {
				super.registerLoggerResource({ ...loggerResource, resource: URI.revive(loggerResource.resource) });
			}
			for (const loggerResource of removed) {
				super.deregisterLoggerResource(loggerResource.resource);
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

	override registerLoggerResource(resource: ILoggerResource): void {
		this.channel.call('registerLoggerResource', [resource, this.windowId]);
	}

	override deregisterLoggerResource(resource: URI): void {
		this.channel.call('deregisterLoggerResource', [resource, this.windowId]);
	}

	override setLogLevel(resource: URI, logLevel: LogLevel): void {
		this.channel.call('setLogLevel', [resource, logLevel]);
	}

	protected doCreateLogger(file: URI, logLevel: LogLevel, options?: ILoggerOptions): ILogger {
		return new Logger(this.channel, file, logLevel, options);
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
	) {
		super(loggerOptions?.always);
		this.setLevel(logLevel);
		this.channel.call('createLogger', [file, loggerOptions])
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

export class FollowerLogService extends LogService implements ILogService {

	constructor(private parent: LogLevelChannelClient, logService: ILogService) {
		super(logService);
		this._register(parent.onDidChangeLogLevel(level => logService.setLevel(level)));
	}

	override setLevel(level: LogLevel): void {
		super.setLevel(level);

		this.parent.setLevel(level);
	}
}
