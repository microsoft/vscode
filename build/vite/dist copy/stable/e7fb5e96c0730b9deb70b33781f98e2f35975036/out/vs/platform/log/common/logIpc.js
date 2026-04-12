/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { URI } from '../../../base/common/uri.js';
import { Event } from '../../../base/common/event.js';
import { AbstractLoggerService, AbstractMessageLogger, AdapterLogger, isLogLevel } from './log.js';
import { Disposable } from '../../../base/common/lifecycle.js';
export class LoggerChannelClient extends AbstractLoggerService {
    constructor(windowId, logLevel, logsHome, loggers, channel) {
        super(logLevel, logsHome, loggers);
        this.windowId = windowId;
        this.channel = channel;
        this._register(channel.listen('onDidChangeLogLevel', windowId)(arg => {
            if (isLogLevel(arg)) {
                super.setLogLevel(arg);
            }
            else {
                super.setLogLevel(URI.revive(arg[0]), arg[1]);
            }
        }));
        this._register(channel.listen('onDidChangeVisibility', windowId)(([resource, visibility]) => super.setVisibility(URI.revive(resource), visibility)));
        this._register(channel.listen('onDidChangeLoggers', windowId)(({ added, removed }) => {
            for (const loggerResource of added) {
                super.registerLogger({ ...loggerResource, resource: URI.revive(loggerResource.resource) });
            }
            for (const loggerResource of removed) {
                super.deregisterLogger(loggerResource.resource);
            }
        }));
    }
    createConsoleMainLogger() {
        return new AdapterLogger({
            log: (level, args) => {
                this.channel.call('consoleLog', [level, args]);
            }
        });
    }
    registerLogger(logger) {
        super.registerLogger(logger);
        this.channel.call('registerLogger', [logger, this.windowId]);
    }
    deregisterLogger(idOrResource) {
        const resource = this.toResource(idOrResource);
        super.deregisterLogger(resource);
        this.channel.call('deregisterLogger', [resource, this.windowId]);
    }
    setLogLevel(arg1, arg2) {
        super.setLogLevel(arg1, arg2);
        this.channel.call('setLogLevel', [arg1, arg2]);
    }
    setVisibility(resourceOrId, visibility) {
        super.setVisibility(resourceOrId, visibility);
        this.channel.call('setVisibility', [this.toResource(resourceOrId), visibility]);
    }
    doCreateLogger(file, logLevel, options) {
        return new Logger(this.channel, file, logLevel, options, this.windowId);
    }
    static setLogLevel(channel, arg1, arg2) {
        return channel.call('setLogLevel', [arg1, arg2]);
    }
}
class Logger extends AbstractMessageLogger {
    constructor(channel, file, logLevel, loggerOptions, windowId) {
        super(loggerOptions?.logLevel === 'always');
        this.channel = channel;
        this.file = file;
        this.isLoggerCreated = false;
        this.buffer = [];
        this.setLevel(logLevel);
        this.channel.call('createLogger', [file, loggerOptions, windowId])
            .then(() => {
            this.doLog(this.buffer);
            this.isLoggerCreated = true;
        });
    }
    log(level, message) {
        const messages = [[level, message]];
        if (this.isLoggerCreated) {
            this.doLog(messages);
        }
        else {
            this.buffer.push(...messages);
        }
    }
    doLog(messages) {
        this.channel.call('log', [this.file, messages]);
    }
}
export class LoggerChannel {
    constructor(loggerService, getUriTransformer) {
        this.loggerService = loggerService;
        this.getUriTransformer = getUriTransformer;
    }
    listen(context, event) {
        const uriTransformer = this.getUriTransformer(context);
        switch (event) {
            case 'onDidChangeLoggers': return Event.map(this.loggerService.onDidChangeLoggers, (e) => ({
                added: [...e.added].map(logger => this.transformLogger(logger, uriTransformer)),
                removed: [...e.removed].map(logger => this.transformLogger(logger, uriTransformer)),
            }));
            case 'onDidChangeVisibility': return Event.map(this.loggerService.onDidChangeVisibility, e => [uriTransformer.transformOutgoingURI(e[0]), e[1]]);
            case 'onDidChangeLogLevel': return Event.map(this.loggerService.onDidChangeLogLevel, e => isLogLevel(e) ? e : [uriTransformer.transformOutgoingURI(e[0]), e[1]]);
        }
        throw new Error(`Event not found: ${event}`);
    }
    async call(context, command, arg) {
        const uriTransformer = this.getUriTransformer(context);
        switch (command) {
            case 'setLogLevel': return isLogLevel(arg[0]) ? this.loggerService.setLogLevel(arg[0]) : this.loggerService.setLogLevel(URI.revive(uriTransformer.transformIncoming(arg[0][0])), arg[0][1]);
            case 'getRegisteredLoggers': return Promise.resolve([...this.loggerService.getRegisteredLoggers()].map(logger => this.transformLogger(logger, uriTransformer)));
        }
        throw new Error(`Call not found: ${command}`);
    }
    transformLogger(logger, transformer) {
        return {
            ...logger,
            resource: transformer.transformOutgoingURI(logger.resource)
        };
    }
}
export class RemoteLoggerChannelClient extends Disposable {
    constructor(loggerService, channel) {
        super();
        channel.call('setLogLevel', [loggerService.getLogLevel()]);
        this._register(loggerService.onDidChangeLogLevel(arg => channel.call('setLogLevel', [arg])));
        channel.call('getRegisteredLoggers').then(loggers => {
            for (const loggerResource of loggers) {
                loggerService.registerLogger({ ...loggerResource, resource: URI.revive(loggerResource.resource) });
            }
        });
        this._register(channel.listen('onDidChangeVisibility')(([resource, visibility]) => loggerService.setVisibility(URI.revive(resource), visibility)));
        this._register(channel.listen('onDidChangeLoggers')(({ added, removed }) => {
            for (const loggerResource of added) {
                loggerService.registerLogger({ ...loggerResource, resource: URI.revive(loggerResource.resource) });
            }
            for (const loggerResource of removed) {
                loggerService.deregisterLogger(loggerResource.resource);
            }
        }));
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibG9nSXBjLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2dJcGMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBQ2xELE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUV0RCxPQUFPLEVBQUUscUJBQXFCLEVBQUUscUJBQXFCLEVBQUUsYUFBYSxFQUFtRixVQUFVLEVBQVksTUFBTSxVQUFVLENBQUM7QUFDOUwsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBRy9ELE1BQU0sT0FBTyxtQkFBb0IsU0FBUSxxQkFBcUI7SUFFN0QsWUFBNkIsUUFBNEIsRUFBRSxRQUFrQixFQUFFLFFBQWEsRUFBRSxPQUEwQixFQUFtQixPQUFpQjtRQUMzSixLQUFLLENBQUMsUUFBUSxFQUFFLFFBQVEsRUFBRSxPQUFPLENBQUMsQ0FBQztRQURQLGFBQVEsR0FBUixRQUFRLENBQW9CO1FBQWtGLFlBQU8sR0FBUCxPQUFPLENBQVU7UUFFM0osSUFBSSxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUE2QixxQkFBcUIsRUFBRSxRQUFRLENBQUMsQ0FBQyxHQUFHLENBQUMsRUFBRTtZQUNoRyxJQUFJLFVBQVUsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDO2dCQUNyQixLQUFLLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQ3hCLENBQUM7aUJBQU0sQ0FBQztnQkFDUCxLQUFLLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDL0MsQ0FBQztRQUNGLENBQUMsQ0FB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