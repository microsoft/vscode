/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';
import { Event } from '../../../base/common/event.js';
import { IChannel, IServerChannel } from '../../../base/parts/ipc/common/ipc.js';
import { AbstractLoggerService, AbstractMessageLogger, AdapterLogger, DidChangeLoggersEvent, ILogger, ILoggerOptions, ILoggerResource, ILoggerService, isLogLevel, LogLevel } from './log.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { IURITransformer } from '../../../base/common/uriIpc.js';
import { ResourceMap, ResourceSet } from '../../../base/common/map.js';

export class LoggerChannelClient extends AbstractLoggerService implements ILoggerService {

	private readonly localLoggerResources = new ResourceSet();
	private readonly pendingRegistrations = new ResourceMap<{ logger: ILoggerResource }>();

	constructor(private readonly windowId: number | undefined, logLevel: LogLevel, logsHome: URI, loggers: ILoggerResource[], private readonly channel: IChannel) {
		super(logLevel, logsHome, loggers);
		this._register(channel.listen<LogLevel | [URI, LogLevel]>('onDidChangeLogLevel', windowId)(arg => {
			if (isLogLevel(arg)) {
				super.setLogLevel(arg);
			} else {
				super.setLogLevel(URI.revive(arg[0]), arg[1]);
			}
		}));
		this._register(channel.listen<[URI, boolean]>('onDidChangeVisibility', windowId)(([resource, visibility]) => {
			resource = URI.revive(resource);
			if (!this.pendingRegistrations.has(resource)) {
				super.setVisibility(resource, visibility);
			}
		}));
		this._register(channel.listen<DidChangeLoggersEvent>('onDidChangeLoggers', windowId)(({ added, removed }) => {
			for (const loggerResource of added) {
				const resource = URI.revive(loggerResource.resource);
				if (!this.localLoggerResources.has(resource)) {
					super.registerLogger({ ...loggerResource, resource });
				}
			}
			for (const loggerResource of removed) {
				if (!this.localLoggerResources.has(URI.revive(loggerResource.resource))) {
					super.deregisterLogger(URI.revive(loggerResource.resource));
				}
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
		this.localLoggerResources.add(logger.resource);
		super.registerLogger(logger);
		const registration = { logger };
		this.pendingRegistrations.set(logger.resource, registration);
		this.channel.call<ILoggerResource | undefined>('registerLogger', [logger, this.windowId]).then(registered => {
			if (this.pendingRegistrations.get(logger.resource) === registration) {
				this.pendingRegistrations.delete(logger.resource);
				if (!registered) {
					return;
				}
				// The response follows older notifications and describes the current registration.
				super.setVisibility(logger.resource, !registered.hidden);
			}
		}).finally(() => {
			if (this.pendingRegistrations.get(logger.resource) === registration) {
				this.pendingRegistrations.delete(logger.resource);
			}
		});
	}

	override deregisterLogger(idOrResource: URI | string): void {
		const resource = URI.revive(this.toResource(idOrResource));
		this.pendingRegistrations.delete(resource);
		const wasLocal = this.localLoggerResources.delete(resource);
		super.deregisterLogger(resource);
		if (wasLocal) {
			this.channel.call('deregisterLogger', [resource, this.windowId]);
		}
	}

	override setLogLevel(logLevel: LogLevel): void;
	override setLogLevel(resource: URI, logLevel: LogLevel): void;
	override setLogLevel(arg1: any, arg2?: any): void {
		super.setLogLevel(arg1, arg2);
		this.channel.call('setLogLevel', [arg1, arg2]);
	}

	override setVisibility(resourceOrId: URI | string, visibility: boolean): void {
		super.setVisibility(resourceOrId, visibility);
		this.channel.call('setVisibility', [this.toResource(resourceOrId), visibility]);
	}

	protected doCreateLogger(file: URI, logLevel: LogLevel, options?: ILoggerOptions): ILogger {
		return new Logger(this.channel, file, logLevel, options, this.windowId);
	}

	override dispose(): void {
		this.localLoggerResources.clear();
		this.pendingRegistrations.clear();
		super.dispose();
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

	constructor(private readonly loggerService: ILoggerService, private getUriTransformer: (requestContext: any) => IURITransformer) { }

	listen(context: any, event: string): Event<any> {
		const uriTransformer = this.getUriTransformer(context);
		switch (event) {
			case 'onDidChangeLoggers': return Event.map<DidChangeLoggersEvent, DidChangeLoggersEvent>(this.loggerService.onDidChangeLoggers, (e) =>
			({
				added: [...e.added].map(logger => this.transformLogger(logger, uriTransformer)),
				removed: [...e.removed].map(logger => this.transformLogger(logger, uriTransformer)),
			}));
			case 'onDidChangeVisibility': return Event.map<[URI, boolean], [URI, boolean]>(this.loggerService.onDidChangeVisibility, e => [uriTransformer.transformOutgoingURI(e[0]), e[1]]);
			case 'onDidChangeLogLevel': return Event.map<LogLevel | [URI, LogLevel], LogLevel | [URI, LogLevel]>(this.loggerService.onDidChangeLogLevel, e => isLogLevel(e) ? e : [uriTransformer.transformOutgoingURI(e[0]), e[1]]);
		}
		throw new Error(`Event not found: ${event}`);
	}

	async call(context: any, command: string, arg?: any): Promise<any> {
		const uriTransformer: IURITransformer | null = this.getUriTransformer(context);
		switch (command) {
			case 'setLogLevel': return isLogLevel(arg[0]) ? this.loggerService.setLogLevel(arg[0]) : this.loggerService.setLogLevel(URI.revive(uriTransformer.transformIncoming(arg[0][0])), arg[0][1]);
			case 'getRegisteredLoggers': return Promise.resolve([...this.loggerService.getRegisteredLoggers()].map(logger => this.transformLogger(logger, uriTransformer)));
		}

		throw new Error(`Call not found: ${command}`);
	}

	private transformLogger(logger: ILoggerResource, transformer: IURITransformer): ILoggerResource {
		return {
			...logger,
			resource: transformer.transformOutgoingURI(logger.resource)
		};
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
				loggerService.deregisterLogger(URI.revive(loggerResource.resource));
			}
		}));

	}
}
