/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toErrorMessage } from 'vs/base/common/errorMessage';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { ResourceMap } from 'vs/base/common/map';
import { isWindows } from 'vs/base/common/platform';
import { Mutable, isNumber } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const ILogService = createDecorator<ILogService>('logService');
export const ILoggerService = createDecorator<ILoggerService>('loggerService');

function now(): string {
	return new Date().toISOString();
}

export function isLogLevel(thing: unknown): thing is LogLevel {
	return isNumber(thing);
}

export enum LogLevel {
	Off,
	Trace,
	Debug,
	Info,
	Warning,
	Error
}

export const DEFAULT_LOG_LEVEL: LogLevel = LogLevel.Info;

export interface ILogger extends IDisposable {
	onDidChangeLogLevel: Event<LogLevel>;
	getLevel(): LogLevel;
	setLevel(level: LogLevel): void;

	trace(message: string, ...args: any[]): void;
	debug(message: string, ...args: any[]): void;
	info(message: string, ...args: any[]): void;
	warn(message: string, ...args: any[]): void;
	error(message: string | Error, ...args: any[]): void;

	/**
	 * An operation to flush the contents. Can be synchronous.
	 */
	flush(): void;
}

export function log(logger: ILogger, level: LogLevel, message: string): void {
	switch (level) {
		case LogLevel.Trace: logger.trace(message); break;
		case LogLevel.Debug: logger.debug(message); break;
		case LogLevel.Info: logger.info(message); break;
		case LogLevel.Warning: logger.warn(message); break;
		case LogLevel.Error: logger.error(message); break;
		case LogLevel.Off: /* do nothing */ break;
		default: throw new Error(`Invalid log level ${level}`);
	}
}

export function format(args: any): string {
	let result = '';

	for (let i = 0; i < args.length; i++) {
		let a = args[i];

		if (typeof a === 'object') {
			try {
				a = JSON.stringify(a);
			} catch (e) { }
		}

		result += (i > 0 ? ' ' : '') + a;
	}

	return result;
}

export interface ILogService extends ILogger {
	readonly _serviceBrand: undefined;
}

export interface ILoggerOptions {

	/**
	 * Id of the logger.
	 */
	id?: string;

	/**
	 * Name of the logger.
	 */
	name?: string;

	/**
	 * Do not create rotating files if max size exceeds.
	 */
	donotRotate?: boolean;

	/**
	 * Do not use formatters.
	 */
	donotUseFormatters?: boolean;

	/**
	 * When to log. Set to `always` to log always.
	 */
	logLevel?: 'always' | LogLevel;

	/**
	 * Whether the log should be hidden from the user.
	 */
	hidden?: boolean;

	/**
	 * Id of the extension that created this logger.
	 */
	extensionId?: string;
}

export interface ILoggerResource {
	readonly resource: URI;
	readonly id: string;
	readonly name?: string;
	readonly logLevel?: LogLevel;
	readonly hidden?: boolean;
	readonly extensionId?: string;
}

export type DidChangeLoggersEvent = {
	readonly added: Iterable<ILoggerResource>;
	readonly removed: Iterable<ILoggerResource>;
};

export interface ILoggerService {

	readonly _serviceBrand: undefined;

	/**
	 * Creates a logger, or gets one if it already exists.
	 *
	 * This will also register the logger with the logger service.
	 */
	createLogger(resource: URI, options?: ILoggerOptions): ILogger;

	/**
	 * Gets an existing logger, if any.
	 */
	getLogger(resource: URI): ILogger | undefined;

	/**
	 * An event which fires when the log level of a logger has changed
	 */
	readonly onDidChangeLogLevel: Event<LogLevel | [URI, LogLevel]>;

	/**
	 * Set default log level.
	 */
	setLogLevel(level: LogLevel): void;

	/**
	 * Set log level for a logger.
	 */
	setLogLevel(resource: URI, level: LogLevel): void;

	/**
	 * Get log level for a logger or the default log level.
	 */
	getLogLevel(resource?: URI): LogLevel;

	/**
	 * An event which fires when the visibility of a logger has changed
	 */
	readonly onDidChangeVisibility: Event<[URI, boolean]>;

	/**
	 * Set the visibility of a logger.
	 */
	setVisibility(resource: URI, visible: boolean): void;

	/**
	 * An event which fires when the logger resources are changed
	 */
	readonly onDidChangeLoggers: Event<DidChangeLoggersEvent>;

	/**
	 * Register a logger with the logger service.
	 *
	 * Note that this will not create a logger, but only register it.
	 *
	 * Use `createLogger` to create a logger and register it.
	 *
	 * Use it when you want to register a logger that is not created by the logger service.
	 */
	registerLogger(resource: ILoggerResource): void;

	/**
	 * Deregister the logger for the given resource.
	 */
	deregisterLogger(resource: URI): void;

	/**
	 * Get all registered loggers
	 */
	getRegisteredLoggers(): Iterable<ILoggerResource>;

	/**
	 * Get the registered logger for the given resource.
	 */
	getRegisteredLogger(resource: URI): ILoggerResource | undefined;
}

export abstract class AbstractLogger extends Disposable implements ILogger {

	private level: LogLevel = DEFAULT_LOG_LEVEL;
	private readonly _onDidChangeLogLevel: Emitter<LogLevel> = this._register(new Emitter<LogLevel>());
	readonly onDidChangeLogLevel: Event<LogLevel> = this._onDidChangeLogLevel.event;

	setLevel(level: LogLevel): void {
		if (this.level !== level) {
			this.level = level;
			this._onDidChangeLogLevel.fire(this.level);
		}
	}

	getLevel(): LogLevel {
		return this.level;
	}

	protected checkLogLevel(level: LogLevel): boolean {
		return this.level !== LogLevel.Off && this.level <= level;
	}

	abstract trace(message: string, ...args: any[]): void;
	abstract debug(message: string, ...args: any[]): void;
	abstract info(message: string, ...args: any[]): void;
	abstract warn(message: string, ...args: any[]): void;
	abstract error(message: string | Error, ...args: any[]): void;
	abstract flush(): void;
}

export abstract class AbstractMessageLogger extends AbstractLogger implements ILogger {

	protected abstract log(level: LogLevel, message: string): void;

	constructor(private readonly logAlways?: boolean) {
		super();
	}

	protected override checkLogLevel(level: LogLevel): boolean {
		return this.logAlways || super.checkLogLevel(level);
	}

	trace(message: string, ...args: any[]): void {
		if (this.checkLogLevel(LogLevel.Trace)) {
			this.log(LogLevel.Trace, format([message, ...args]));
		}
	}

	debug(message: string, ...args: any[]): void {
		if (this.checkLogLevel(LogLevel.Debug)) {
			this.log(LogLevel.Debug, format([message, ...args]));
		}
	}

	info(message: string, ...args: any[]): void {
		if (this.checkLogLevel(LogLevel.Info)) {
			this.log(LogLevel.Info, format([message, ...args]));
		}
	}

	warn(message: string, ...args: any[]): void {
		if (this.checkLogLevel(LogLevel.Warning)) {
			this.log(LogLevel.Warning, format([message, ...args]));
		}
	}

	error(message: string | Error, ...args: any[]): void {
		if (this.checkLogLevel(LogLevel.Error)) {

			if (message instanceof Error) {
				const array = Array.prototype.slice.call(arguments) as any[];
				array[0] = message.stack;
				this.log(LogLevel.Error, format(array));
			} else {
				this.log(LogLevel.Error, format([message, ...args]));
			}
		}
	}

	flush(): void { }
}


export class ConsoleMainLogger extends AbstractLogger implements ILogger {

	private useColors: boolean;

	constructor(logLevel: LogLevel = DEFAULT_LOG_LEVEL) {
		super();
		this.setLevel(logLevel);
		this.useColors = !isWindows;
	}

	trace(message: string, ...args: any[]): void {
		if (this.checkLogLevel(LogLevel.Trace)) {
			if (this.useColors) {
				console.log(`\x1b[90m[main ${now()}]\x1b[0m`, message, ...args);
			} else {
				console.log(`[main ${now()}]`, message, ...args);
			}
		}
	}

	debug(message: string, ...args: any[]): void {
		if (this.checkLogLevel(LogLevel.Debug)) {
			if (this.useColors) {
				console.log(`\x1b[90m[main ${now()}]\x1b[0m`, message, ...args);
			} else {
				console.log(`[main ${now()}]`, message, ...args);
			}
		}
	}

	info(message: string, ...args: any[]): void {
		if (this.checkLogLevel(LogLevel.Info)) {
			if (this.useColors) {
				console.log(`\x1b[90m[main ${now()}]\x1b[0m`, message, ...args);
			} else {
				console.log(`[main ${now()}]`, message, ...args);
			}
		}
	}

	warn(message: string | Error, ...args: any[]): void {
		if (this.checkLogLevel(LogLevel.Warning)) {
			if (this.useColors) {
				console.warn(`\x1b[93m[main ${now()}]\x1b[0m`, message, ...args);
			} else {
				console.warn(`[main ${now()}]`, message, ...args);
			}
		}
	}

	error(message: string, ...args: any[]): void {
		if (this.checkLogLevel(LogLevel.Error)) {
			if (this.useColors) {
				console.error(`\x1b[91m[main ${now()}]\x1b[0m`, message, ...args);
			} else {
				console.error(`[main ${now()}]`, message, ...args);
			}
		}
	}

	override dispose(): void {
		// noop
	}

	flush(): void {
		// noop
	}

}

export class ConsoleLogger extends AbstractLogger implements ILogger {

	constructor(logLevel: LogLevel = DEFAULT_LOG_LEVEL) {
		super();
		this.setLevel(logLevel);
	}

	trace(message: string, ...args: any[]): void {
		if (this.checkLogLevel(LogLevel.Trace)) {
			console.log('%cTRACE', 'color: #888', message, ...args);
		}
	}

	debug(message: string, ...args: any[]): void {
		if (this.checkLogLevel(LogLevel.Debug)) {
			console.log('%cDEBUG', 'background: #eee; color: #888', message, ...args);
		}
	}

	info(message: string, ...args: any[]): void {
		if (this.checkLogLevel(LogLevel.Info)) {
			console.log('%c INFO', 'color: #33f', message, ...args);
		}
	}

	warn(message: string | Error, ...args: any[]): void {
		if (this.checkLogLevel(LogLevel.Warning)) {
			console.log('%c WARN', 'color: #993', message, ...args);
		}
	}

	error(message: string, ...args: any[]): void {
		if (this.checkLogLevel(LogLevel.Error)) {
			console.log('%c  ERR', 'color: #f33', message, ...args);
		}
	}

	override dispose(): void {
		// noop
	}

	flush(): void {
		// noop
	}
}

export class AdapterLogger extends AbstractLogger implements ILogger {

	constructor(private readonly adapter: { log: (logLevel: LogLevel, args: any[]) => void }, logLevel: LogLevel = DEFAULT_LOG_LEVEL) {
		super();
		this.setLevel(logLevel);
	}

	trace(message: string, ...args: any[]): void {
		if (this.checkLogLevel(LogLevel.Trace)) {
			this.adapter.log(LogLevel.Trace, [this.extractMessage(message), ...args]);
		}
	}

	debug(message: string, ...args: any[]): void {
		if (this.checkLogLevel(LogLevel.Debug)) {
			this.adapter.log(LogLevel.Debug, [this.extractMessage(message), ...args]);
		}
	}

	info(message: string, ...args: any[]): void {
		if (this.checkLogLevel(LogLevel.Info)) {
			this.adapter.log(LogLevel.Info, [this.extractMessage(message), ...args]);
		}
	}

	warn(message: string | Error, ...args: any[]): void {
		if (this.checkLogLevel(LogLevel.Warning)) {
			this.adapter.log(LogLevel.Warning, [this.extractMessage(message), ...args]);
		}
	}

	error(message: string | Error, ...args: any[]): void {
		if (this.checkLogLevel(LogLevel.Error)) {
			this.adapter.log(LogLevel.Error, [this.extractMessage(message), ...args]);
		}
	}

	private extractMessage(msg: string | Error): string {
		if (typeof msg === 'string') {
			return msg;
		}

		return toErrorMessage(msg, this.checkLogLevel(LogLevel.Trace));
	}

	override dispose(): void {
		// noop
	}

	flush(): void {
		// noop
	}
}

export class MultiplexLogger extends AbstractLogger implements ILogger {

	constructor(private readonly loggers: ReadonlyArray<ILogger>) {
		super();
		if (loggers.length) {
			this.setLevel(loggers[0].getLevel());
		}
	}

	override setLevel(level: LogLevel): void {
		for (const logger of this.loggers) {
			logger.setLevel(level);
		}
		super.setLevel(level);
	}

	trace(message: string, ...args: any[]): void {
		for (const logger of this.loggers) {
			logger.trace(message, ...args);
		}
	}

	debug(message: string, ...args: any[]): void {
		for (const logger of this.loggers) {
			logger.debug(message, ...args);
		}
	}

	info(message: string, ...args: any[]): void {
		for (const logger of this.loggers) {
			logger.info(message, ...args);
		}
	}

	warn(message: string, ...args: any[]): void {
		for (const logger of this.loggers) {
			logger.warn(message, ...args);
		}
	}

	error(message: string | Error, ...args: any[]): void {
		for (const logger of this.loggers) {
			logger.error(message, ...args);
		}
	}

	flush(): void {
		for (const logger of this.loggers) {
			logger.flush();
		}
	}

	override dispose(): void {
		for (const logger of this.loggers) {
			logger.dispose();
		}
	}
}

export abstract class AbstractLoggerService extends Disposable implements ILoggerService {

	declare readonly _serviceBrand: undefined;

	private readonly _loggers = new ResourceMap<ILogger>();

	private readonly _loggerResources = new ResourceMap<Mutable<ILoggerResource>>();

	private _onDidChangeLoggers = this._register(new Emitter<{ added: ILoggerResource[]; removed: ILoggerResource[] }>);
	readonly onDidChangeLoggers = this._onDidChangeLoggers.event;

	private _onDidChangeLogLevel = this._register(new Emitter<LogLevel | [URI, LogLevel]>);
	readonly onDidChangeLogLevel = this._onDidChangeLogLevel.event;

	private _onDidChangeVisibility = this._register(new Emitter<[URI, boolean]>);
	readonly onDidChangeVisibility = this._onDidChangeVisibility.event;

	constructor(
		protected logLevel: LogLevel,
		loggerResources?: Iterable<ILoggerResource>,
	) {
		super();
		if (loggerResources) {
			for (const loggerResource of loggerResources) {
				this._loggerResources.set(loggerResource.resource, loggerResource);
			}
		}
	}

	getLogger(resource: URI): ILogger | undefined {
		return this._loggers.get(resource);
	}

	createLogger(resource: URI, options?: ILoggerOptions, donotRegister?: boolean): ILogger {
		let logger = this._loggers.get(resource);
		if (!logger) {
			const logLevel = options?.logLevel === 'always' ? LogLevel.Trace : options?.logLevel;
			logger = this.doCreateLogger(resource, logLevel ?? this.getLogLevel(resource) ?? this.logLevel, options);
			this._loggers.set(resource, logger);
			if (!donotRegister) {
				this.registerLogger({ resource, id: options?.id ?? resource.toString(), logLevel, name: options?.name, hidden: options?.hidden, extensionId: options?.extensionId });
			}
		}
		return logger;
	}

	setLogLevel(logLevel: LogLevel): void;
	setLogLevel(resource: URI, logLevel: LogLevel): void;
	setLogLevel(arg1: any, arg2?: any): void {
		if (URI.isUri(arg1)) {
			const resource = arg1;
			const logLevel = arg2;
			const loggerResource = this._loggerResources.get(resource);
			if (loggerResource && logLevel !== loggerResource.logLevel) {
				loggerResource.logLevel = logLevel === this.logLevel ? undefined : logLevel;
				this._loggers.get(resource)?.setLevel(logLevel);
				this._loggerResources.set(loggerResource.resource, loggerResource);
				this._onDidChangeLogLevel.fire([resource, logLevel]);
			}
		} else {
			this.logLevel = arg1;
			for (const [resource, logger] of this._loggers.entries()) {
				if (this._loggerResources.get(resource)?.logLevel === undefined) {
					logger.setLevel(this.logLevel);
				}
			}
			this._onDidChangeLogLevel.fire(this.logLevel);
		}
	}

	setVisibility(resource: URI, visibility: boolean): void {
		const loggerResource = this._loggerResources.get(resource);
		if (loggerResource && visibility !== !loggerResource.hidden) {
			loggerResource.hidden = !visibility;
			this._loggerResources.set(loggerResource.resource, loggerResource);
			this._onDidChangeVisibility.fire([resource, visibility]);
		}
	}

	getLogLevel(resource?: URI): LogLevel {
		let logLevel;
		if (resource) {
			logLevel = this._loggerResources.get(resource)?.logLevel;
		}
		return logLevel ?? this.logLevel;
	}

	registerLogger(resource: ILoggerResource): void {
		const existing = this._loggerResources.get(resource.resource);
		if (existing) {
			if (existing.hidden !== resource.hidden) {
				this.setVisibility(resource.resource, !resource.hidden);
			}
		} else {
			this._loggerResources.set(resource.resource, resource);
			this._onDidChangeLoggers.fire({ added: [resource], removed: [] });
		}
	}

	deregisterLogger(resource: URI): void {
		const existing = this._loggerResources.get(resource);
		if (existing) {
			this._loggerResources.delete(resource);
			const logger = this._loggers.get(resource);
			if (logger) {
				this._loggers.delete(resource);
				logger.dispose();
			}
			this._onDidChangeLoggers.fire({ added: [], removed: [existing] });
		}
	}

	getRegisteredLoggers(): Iterable<ILoggerResource> {
		return this._loggerResources.values();
	}

	getRegisteredLogger(resource: URI): ILoggerResource | undefined {
		return this._loggerResources.get(resource);
	}

	override dispose(): void {
		this._loggers.forEach(logger => logger.dispose());
		this._loggers.clear();
		this._loggerResources.clear();
		super.dispose();
	}

	protected abstract doCreateLogger(resource: URI, logLevel: LogLevel, options?: ILoggerOptions): ILogger;
}

export class NullLogger implements ILogger {
	readonly onDidChangeLogLevel: Event<LogLevel> = new Emitter<LogLevel>().event;
	setLevel(level: LogLevel): void { }
	getLevel(): LogLevel { return LogLevel.Info; }
	trace(message: string, ...args: any[]): void { }
	debug(message: string, ...args: any[]): void { }
	info(message: string, ...args: any[]): void { }
	warn(message: string, ...args: any[]): void { }
	error(message: string | Error, ...args: any[]): void { }
	critical(message: string | Error, ...args: any[]): void { }
	dispose(): void { }
	flush(): void { }
}

export class NullLogService extends NullLogger implements ILogService {
	declare readonly _serviceBrand: undefined;
}

export class NullLoggerService extends AbstractLoggerService {

	constructor() { super(LogLevel.Info); }

	protected doCreateLogger(resource: URI, logLevel: LogLevel, options?: ILoggerOptions | undefined): ILogger {
		return new NullLogger();
	}
}

export function getLogLevel(environmentService: IEnvironmentService): LogLevel {
	if (environmentService.verbose) {
		return LogLevel.Trace;
	}
	if (typeof environmentService.logLevel === 'string') {
		const logLevel = parseLogLevel(environmentService.logLevel.toLowerCase());
		if (logLevel !== undefined) {
			return logLevel;
		}
	}
	return DEFAULT_LOG_LEVEL;
}

export function LogLevelToString(logLevel: LogLevel): string {
	switch (logLevel) {
		case LogLevel.Trace: return 'trace';
		case LogLevel.Debug: return 'debug';
		case LogLevel.Info: return 'info';
		case LogLevel.Warning: return 'warn';
		case LogLevel.Error: return 'error';
		case LogLevel.Off: return 'off';
	}
}

export function parseLogLevel(logLevel: string): LogLevel | undefined {
	switch (logLevel) {
		case 'trace':
			return LogLevel.Trace;
		case 'debug':
			return LogLevel.Debug;
		case 'info':
			return LogLevel.Info;
		case 'warn':
			return LogLevel.Warning;
		case 'error':
			return LogLevel.Error;
		case 'critical':
			return LogLevel.Error;
		case 'off':
			return LogLevel.Off;
	}
	return undefined;
}

export function setLogLevel(loggerService: ILoggerService, logLevel: LogLevel | [URI, LogLevel]): void {
	if (isLogLevel(logLevel)) {
		loggerService.setLogLevel(logLevel);
	} else {
		loggerService.setLogLevel(logLevel[0], logLevel[1]);
	}
}
