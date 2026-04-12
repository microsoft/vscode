/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as nls from '../../../nls.js';
import { toErrorMessage } from '../../../base/common/errorMessage.js';
import { Emitter } from '../../../base/common/event.js';
import { hash } from '../../../base/common/hash.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../base/common/map.js';
import { isWindows } from '../../../base/common/platform.js';
import { joinPath } from '../../../base/common/resources.js';
import { isNumber, isString } from '../../../base/common/types.js';
import { URI } from '../../../base/common/uri.js';
import { RawContextKey } from '../../contextkey/common/contextkey.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
export const ILogService = createDecorator('logService');
export const ILoggerService = createDecorator('loggerService');
function now() {
    return new Date().toISOString();
}
export function isLogLevel(thing) {
    return isNumber(thing);
}
export var LogLevel;
(function (LogLevel) {
    LogLevel[LogLevel["Off"] = 0] = "Off";
    LogLevel[LogLevel["Trace"] = 1] = "Trace";
    LogLevel[LogLevel["Debug"] = 2] = "Debug";
    LogLevel[LogLevel["Info"] = 3] = "Info";
    LogLevel[LogLevel["Warning"] = 4] = "Warning";
    LogLevel[LogLevel["Error"] = 5] = "Error";
})(LogLevel || (LogLevel = {}));
export const DEFAULT_LOG_LEVEL = LogLevel.Info;
export function canLog(loggerLevel, messageLevel) {
    return loggerLevel !== LogLevel.Off && loggerLevel <= messageLevel;
}
export function log(logger, level, message) {
    switch (level) {
        case LogLevel.Trace:
            logger.trace(message);
            break;
        case LogLevel.Debug:
            logger.debug(message);
            break;
        case LogLevel.Info:
            logger.info(message);
            break;
        case LogLevel.Warning:
            logger.warn(message);
            break;
        case LogLevel.Error:
            logger.error(message);
            break;
        case LogLevel.Off: /* do nothing */ break;
        default: throw new Error(`Invalid log level ${level}`);
    }
}
function format(args, verbose = false) {
    let result = '';
    for (let i = 0; i < args.length; i++) {
        let a = args[i];
        if (a instanceof Error) {
            a = toErrorMessage(a, verbose);
        }
        if (typeof a === 'object') {
            try {
                a = JSON.stringify(a);
            }
            catch (e) { }
        }
        result += (i > 0 ? ' ' : '') + a;
    }
    return result;
}
export class AbstractLogger extends Disposable {
    constructor() {
        super(...arguments);
        this.level = DEFAULT_LOG_LEVEL;
        this._onDidChangeLogLevel = this._register(new Emitter());
    }
    get onDidChangeLogLevel() { return this._onDidChangeLogLevel.event; }
    setLevel(level) {
        if (this.level !== level) {
            this.level = level;
            this._onDidChangeLogLevel.fire(this.level);
        }
    }
    getLevel() {
        return this.level;
    }
    checkLogLevel(level) {
        return canLog(this.level, level);
    }
    canLog(level) {
        if (this._store.isDisposed) {
            return false;
        }
        return this.checkLogLevel(level);
    }
}
export class AbstractMessageLogger extends AbstractLogger {
    constructor(logAlways) {
        super();
        this.logAlways = logAlways;
    }
    checkLogLevel(level) {
        return this.logAlways || super.checkLogLevel(level);
    }
    trace(message, ...args) {
        if (this.canLog(LogLevel.Trace)) {
            this.log(LogLevel.Trace, format([message, ...args], true));
        }
    }
    debug(message, ...args) {
        if (this.canLog(LogLevel.Debug)) {
            this.log(LogLevel.Debug, format([message, ...args]));
        }
    }
    info(message, ...args) {
        if (this.canLog(LogLevel.Info)) {
            this.log(LogLevel.Info, format([message, ...args]));
        }
    }
    warn(message, ...args) {
        if (this.canLog(LogLevel.Warning)) {
            this.log(LogLevel.Warning, format([message, ...args]));
        }
    }
    error(message, ...args) {
        if (this.canLog(LogLevel.Error)) {
            if (message instanceof Error) {
                const array = Array.prototype.slice.call(arguments);
                array[0] = message.stack;
                this.log(LogLevel.Error, format(array));
            }
            else {
                this.log(LogLevel.Error, format([message, ...args]));
            }
        }
    }
    flush() { }
}
export class ConsoleMainLogger extends AbstractLogger {
    constructor(logLevel = DEFAULT_LOG_LEVEL) {
        super();
        this.setLevel(logLevel);
        this.useColors = !isWindows;
    }
    trace(message, ...args) {
        if (this.canLog(LogLevel.Trace)) {
            if (this.useColors) {
                console.log(`\x1b[90m[main ${now()}]\x1b[0m`, message, ...args);
            }
            else {
                console.log(`[main ${now()}]`, message, ...args);
            }
        }
    }
    debug(message, ...args) {
        if (this.canLog(LogLevel.Debug)) {
            if (this.useColors) {
                console.log(`\x1b[90m[main ${now()}]\x1b[0m`, message, ...args);
            }
            else {
                console.log(`[main ${now()}]`, message, ...args);
            }
        }
    }
    info(message, ...args) {
        if (this.canLog(LogLevel.Info)) {
            if (this.useColors) {
                console.log(`\x1b[90m[main ${now()}]\x1b[0m`, message, ...args);
            }
            else {
                console.log(`[main ${now()}]`, message, ...args);
            }
        }
    }
    warn(message, ...args) {
        if (this.canLog(LogLevel.Warning)) {
            if (this.useColors) {
                console.warn(`\x1b[93m[main ${now()}]\x1b[0m`, message, ...args);
            }
            else {
                console.warn(`[main ${now()}]`, message, ...args);
            }
        }
    }
    error(message, ...args) {
        if (this.canLog(LogLevel.Error)) {
            if (this.useColors) {
                console.error(`\x1b[91m[main ${now()}]\x1b[0m`, message, ...args);
            }
            else {
                console.error(`[main ${now()}]`, message, ...args);
            }
        }
    }
    flush() {
        // noop
    }
}
export class ConsoleLogger extends AbstractLogger {
    constructor(logLevel = DEFAULT_LOG_LEVEL, useColors = true) {
        super();
        this.useColors = useColors;
        this.setLevel(logLevel);
    }
    trace(message, ...args) {
        if (this.canLog(LogLevel.Trace)) {
            if (this.useColors) {
                console.log('%cTRACE', 'color: #888', message, ...args);
            }
            else {
                console.log(message, ...args);
            }
        }
    }
    debug(message, ...args) {
        if (this.canLog(LogLevel.Debug)) {
            if (this.useColors) {
                console.log('%cDEBUG', 'background: #eee; color: #888', message, ...args);
            }
            else {
                console.log(message, ...args);
            }
        }
    }
    info(message, ...args) {
        if (this.canLog(LogLevel.Info)) {
            if (this.useColors) {
                console.log('%c INFO', 'color: #33f', message, ...args);
            }
            else {
                console.log(message, ...args);
            }
        }
    }
    warn(message, ...args) {
        if (this.canLog(LogLevel.Warning)) {
            if (this.useColors) {
                console.warn('%c WARN', 'color: #993', message, ...args);
            }
            else {
                console.log(message, ...args);
            }
        }
    }
    error(message, ...args) {
        if (this.canLog(LogLevel.Error)) {
            if (this.useColors) {
                console.error('%c  ERR', 'color: #f33', message, ...args);
            }
            else {
                console.error(message, ...args);
            }
        }
    }
    flush() {
        // noop
    }
}
export class AdapterLogger extends AbstractLogger {
    constructor(adapter, logLevel = DEFAULT_LOG_LEVEL) {
        super();
        this.adapter = adapter;
        this.setLevel(logLevel);
    }
    trace(message, ...args) {
        if (this.canLog(LogLevel.Trace)) {
            this.adapter.log(LogLevel.Trace, [this.extractMessage(message), ...args]);
        }
    }
    debug(message, ...args) {
        if (this.canLog(LogLevel.Debug)) {
            this.adapter.log(LogLevel.Debug, [this.extractMessage(message), ...args]);
        }
    }
    info(message, ...args) {
        if (this.canLog(LogLevel.Info)) {
            this.adapter.log(LogLevel.Info, [this.extractMessage(message), ...args]);
        }
    }
    warn(message, ...args) {
        if (this.canLog(LogLevel.Warning)) {
            this.adapter.log(LogLevel.Warning, [this.extractMessage(message), ...args]);
        }
    }
    error(message, ...args) {
        if (this.canLog(LogLevel.Error)) {
            this.adapter.log(LogLevel.Error, [this.extractMessage(message), ...args]);
        }
    }
    extractMessage(msg) {
        if (typeof msg === 'string') {
            return msg;
        }
        return toErrorMessage(msg, this.canLog(LogLevel.Trace));
    }
    flush() {
        // noop
    }
}
export class MultiplexLogger extends AbstractLogger {
    constructor(loggers) {
        super();
        this.loggers = loggers;
        if (loggers.length) {
            this.setLevel(loggers[0].getLevel());
        }
    }
    setLevel(level) {
        for (const logger of this.loggers) {
            logger.setLevel(level);
        }
        super.setLevel(level);
    }
    trace(message, ...args) {
        for (const logger of this.loggers) {
            logger.trace(message, ...args);
        }
    }
    debug(message, ...args) {
        for (const logger of this.loggers) {
            logger.debug(message, ...args);
        }
    }
    info(message, ...args) {
        for (const logger of this.loggers) {
            logger.info(message, ...args);
        }
    }
    warn(message, ...args) {
        for (const logger of this.loggers) {
            logger.warn(message, ...args);
        }
    }
    error(message, ...args) {
        for (const logger of this.loggers) {
            logger.error(message, ...args);
        }
    }
    flush() {
        for (const logger of this.loggers) {
            logger.flush();
        }
    }
    dispose() {
        for (const logger of this.loggers) {
            logger.dispose();
        }
        super.dispose();
    }
}
export class AbstractLoggerService extends Disposable {
    constructor(logLevel, logsHome, loggerResources) {
        super();
        this.logLevel = logLevel;
        this.logsHome = logsHome;
        this._loggers = new ResourceMap();
        this._onDidChangeLoggers = this._register(new Emitter);
        this.onDidChangeLoggers = this._onDidChangeLoggers.event;
        this._onDidChangeLogLevel = this._register(new Emitter);
        this.onDidChangeLogLevel = this._onDidChangeLogLevel.event;
        this._onDidChangeVisibility = this._register(new Emitter);
        this.onDidChangeVisibility = this._onDidChangeVisibility.event;
        if (loggerResources) {
            for (const loggerResource of loggerResources) {
                this._loggers.set(loggerResource.resource, { logger: undefined, info: loggerResource });
            }
        }
    }
    getLoggerEntry(resourceOrId) {
        if (isString(resourceOrId)) {
            return [...this._loggers.values()].find(logger => logger.info.id === resourceOrId);
        }
        return this._loggers.get(resourceOrId);
    }
    getLogger(resourceOrId) {
        return this.getLoggerEntry(resourceOrId)?.logger;
    }
    createLogger(idOrResource, options) {
        const resource = this.toResource(idOrResource);
        const id = isString(idOrResource) ? idOrResource : (options?.id ?? hash(resource.toString()).toString(16));
        let logger = this._loggers.get(resource)?.logger;
        const logLevel = options?.logLevel === 'always' ? LogLevel.Trace : options?.logLevel;
        if (!logger) {
            logger = this.doCreateLogger(resource, logLevel ?? this.getLogLevel(resource) ?? this.logLevel, { ...options, id });
        }
        const loggerEntry = {
            logger,
            info: {
                resource,
                id,
                logLevel,
                name: options?.name,
                hidden: options?.hidden,
                group: options?.group,
                extensionId: options?.extensionId,
                when: options?.when
            }
        };
        this.registerLogger(loggerEntry.info);
        // TODO: @sandy081 Remove this once registerLogger can take ILogger
        this._loggers.set(resource, loggerEntry);
        return logger;
    }
    toResource(idOrResource) {
        return isString(idOrResource) ? joinPath(this.logsHome, `${idOrResource.replace(/[\\/:\*\?"<>\|]/g, '')}.log`) : idOrResource;
    }
    setLogLevel(arg1, arg2) {
        if (URI.isUri(arg1)) {
            const resource = arg1;
            const logLevel = arg2;
            const logger = this._loggers.get(resource);
            if (logger && logLevel !== logger.info.logLevel) {
                logger.info.logLevel = logLevel === this.logLevel ? undefined : logLevel;
                logger.logger?.setLevel(logLevel);
                this._loggers.set(logger.info.resource, logger);
                this._onDidChangeLogLevel.fire([resource, logLevel]);
            }
        }
        else {
            this.logLevel = arg1;
            for (const [resource, logger] of this._loggers.entries()) {
                if (this._loggers.get(resource)?.info.logLevel === undefined) {
                    logger.logger?.setLevel(this.logLevel);
                }
            }
            this._onDidChangeLogLevel.fire(this.logLevel);
        }
    }
    setVisibility(resourceOrId, visibility) {
        const logger = this.getLoggerEntry(resourceOrId);
        if (logger && visibility !== !logger.info.hidden) {
            logger.info.hidden = !visibility;
            this._loggers.set(logger.info.resource, logger);
            this._onDidChangeVisibility.fire([logger.info.resource, visibility]);
        }
    }
    getLogLevel(resource) {
        let logLevel;
        if (resource) {
            logLevel = this._loggers.get(resource)?.info.logLevel;
        }
        return logLevel ?? this.logLevel;
    }
    registerLogger(resource) {
        const existing = this._loggers.get(resource.resource);
        if (existing) {
            if (existing.info.hidden !== resource.hidden) {
                this.setVisibility(resource.resource, !resource.hidden);
            }
        }
        else {
            this._loggers.set(resource.resource, { info: resource, logger: undefined });
            this._onDidChangeLoggers.fire({ added: [resource], removed: [] });
        }
    }
    deregisterLogger(idOrResource) {
        const resource = this.toResource(idOrResource);
        const existing = this._loggers.get(resource);
        if (existing) {
            if (existing.logger) {
                existing.logger.dispose();
            }
            this._loggers.delete(resource);
            this._onDidChangeLoggers.fire({ added: [], removed: [existing.info] });
        }
    }
    *getRegisteredLoggers() {
        for (const entry of this._loggers.values()) {
            yield entry.info;
        }
    }
    getRegisteredLogger(resource) {
        return this._loggers.get(resource)?.info;
    }
    dispose() {
        this._loggers.forEach(logger => logger.logger?.dispose());
        this._loggers.clear();
        super.dispose();
    }
}
export class NullLogger {
    constructor() {
        this.onDidChangeLogLevel = new Emitter().event;
    }
    setLevel(level) { }
    getLevel() { return LogLevel.Info; }
    trace(message, ...args) { }
    debug(message, ...args) { }
    info(message, ...args) { }
    warn(message, ...args) { }
    error(message, ...args) { }
    critical(message, ...args) { }
    dispose() { }
    flush() { }
}
export class NullLogService extends NullLogger {
}
export class NullLoggerService extends AbstractLoggerService {
    constructor() {
        super(LogLevel.Off, URI.parse('log:///log'));
    }
    doCreateLogger(resource, logLevel, options) {
        return new NullLogger();
    }
}
export function getLogLevel(environmentService) {
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
export function LogLevelToString(logLevel) {
    switch (logLevel) {
        case LogLevel.Trace: return 'trace';
        case LogLevel.Debug: return 'debug';
        case LogLevel.Info: return 'info';
        case LogLevel.Warning: return 'warn';
        case LogLevel.Error: return 'error';
        case LogLevel.Off: return 'off';
    }
}
export function LogLevelToLocalizedString(logLevel) {
    switch (logLevel) {
        case LogLevel.Trace: return { original: 'Trace', value: nls.localize('trace', "Trace") };
        case LogLevel.Debug: return { original: 'Debug', value: nls.localize('debug', "Debug") };
        case LogLevel.Info: return { original: 'Info', value: nls.localize('info', "Info") };
        case LogLevel.Warning: return { original: 'Warning', value: nls.localize('warn', "Warning") };
        case LogLevel.Error: return { original: 'Error', value: nls.localize('error', "Error") };
        case LogLevel.Off: return { original: 'Off', value: nls.localize('off', "Off") };
    }
}
export function parseLogLevel(logLevel) {
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
// Contexts
export const CONTEXT_LOG_LEVEL = new RawContextKey('logLevel', LogLevelToString(LogLevel.Info));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibG9nLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxpQkFBaUIsQ0FBQztBQUN2QyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDdEUsT0FBTyxFQUFFLE9BQU8sRUFBUyxNQUFNLCtCQUErQixDQUFDO0FBQy9ELE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUNwRCxPQUFPLEVBQUUsVUFBVSxFQUFlLE1BQU0sbUNBQW1DLENBQUM7QUFDNUUsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBQzFELE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUM3RCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDN0QsT0FBTyxFQUFXLFFBQVEsRUFBRSxRQUFRLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUM1RSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFFbEQsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBRXRFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUU5RSxNQUFNLENBQUMsTUFBTSxXQUFXLEdBQUcsZUFBZSxDQUFjLFlBQVksQ0FBQyxDQUFDO0FBQ3RFLE1BQU0sQ0FBQyxNQUFNLGNBQWMsR0FBRyxlQUFlLENBQWlCLGVBQWUsQ0FBQyxDQUFDO0FBRS9FLFNBQVMsR0FBRztJQUNYLE9BQU8sSUFBSSxJQUFJLEVBQUUsQ0FBQyxXQUFXLEVBQUUsQ0FBQztBQUNqQyxDQUFDO0FBRUQsTUFBTSxVQUFVLFVBQVUsQ0FBQyxLQUFj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