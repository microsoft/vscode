/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { MainContext } from './extHost.protocol.js';
import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';
import { IExtHostRpcService } from './extHostRpcService.js';
import { ExtensionIdentifier } from '../../../platform/extensions/common/extensions.js';
import { AbstractMessageLogger, ILoggerService, ILogService, log } from '../../../platform/log/common/log.js';
import { OutputChannelUpdateMode } from '../../services/output/common/output.js';
import { IExtHostConsumerFileSystem } from './extHostFileSystemConsumer.js';
import { IExtHostInitDataService } from './extHostInitDataService.js';
import { IExtHostFileSystemInfo } from './extHostFileSystemInfo.js';
import { toLocalISOString } from '../../../base/common/date.js';
import { VSBuffer } from '../../../base/common/buffer.js';
import { isString } from '../../../base/common/types.js';
import { FileSystemProviderErrorCode, toFileSystemProviderErrorCode } from '../../../platform/files/common/files.js';
import { Emitter } from '../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../base/common/map.js';
class ExtHostOutputChannel extends AbstractMessageLogger {
    constructor(id, name, logger, proxy, extension) {
        super();
        this.id = id;
        this.name = name;
        this.logger = logger;
        this.proxy = proxy;
        this.extension = extension;
        this.offset = 0;
        this.visible = false;
        this.setLevel(logger.getLevel());
        this._register(logger.onDidChangeLogLevel(level => this.setLevel(level)));
        this._register(toDisposable(() => this.proxy.$dispose(this.id)));
    }
    get logLevel() {
        return this.getLevel();
    }
    appendLine(value) {
        this.append(value + '\n');
    }
    append(value) {
        this.info(value);
    }
    clear() {
        const till = this.offset;
        this.logger.flush();
        this.proxy.$update(this.id, OutputChannelUpdateMode.Clear, till);
    }
    replace(value) {
        const till = this.offset;
        this.info(value);
        this.proxy.$update(this.id, OutputChannelUpdateMode.Replace, till);
        if (this.visible) {
            this.logger.flush();
        }
    }
    show(columnOrPreserveFocus, preserveFocus) {
        this.logger.flush();
        this.proxy.$reveal(this.id, !!(typeof columnOrPreserveFocus === 'boolean' ? columnOrPreserveFocus : preserveFocus));
    }
    hide() {
        this.proxy.$close(this.id);
    }
    log(level, message) {
        this.offset += VSBuffer.fromString(message).byteLength;
        log(this.logger, level, message);
        if (this.visible) {
            this.logger.flush();
            this.proxy.$update(this.id, OutputChannelUpdateMode.Append);
        }
    }
}
class ExtHostLogOutputChannel extends ExtHostOutputChannel {
    appendLine(value) {
        this.append(value);
    }
}
let ExtHostOutputService = class ExtHostOutputService {
    constructor(extHostRpc, initData, extHostFileSystem, extHostFileSystemInfo, loggerService, logService) {
        this.initData = initData;
        this.extHostFileSystem = extHostFileSystem;
        this.extHostFileSystemInfo = extHostFileSystemInfo;
        this.loggerService = loggerService;
        this.logService = logService;
        this.extensionLogDirectoryCreationPromise = new ResourceMap();
        this.logOutputChannels = new ResourceMap();
        this.namePool = 1;
        this.channels = new Map();
        this.visibleChannelId = null;
        this.proxy = extHostRpc.getProxy(MainContext.MainThreadOutputService);
        this.outputsLocation = this.extHostFileSystemInfo.extUri.joinPath(initData.logsLocation, `output_logging_${toLocalISOString(new Date()).replace(/-|:|\.\d+Z$/g, '')}`);
    }
    $setVisibleChannel(visibleChannelId) {
        this.visibleChannelId = visibleChannelId;
        for (const [id, channel] of this.channels) {
            channel.visible = id === this.visibleChannelId;
        }
    }
    createOutputChannel(name, options, extension) {
        name = name.trim();
        if (!name) {
            throw new Error('illegal argument `name`. must not be falsy');
        }
        const log = typeof options === 'object' && options.log;
        const languageId = isString(options) ? options : undefined;
        if (isString(languageId) && !languageId.trim()) {
            throw new Error('illegal argument `languageId`. must not be empty');
        }
        const channelDisposables = new DisposableStore();
        let extHostOutputChannelPromise;
        let logLevel = this.initData.environment.extensionLogLevel?.find(([identifier]) => ExtensionIdentifier.equals(extension.identifier, identifier))?.[1];
        let logFile;
        if (log) {
            const extensionLogDirectory = this.extHostFileSystemInfo.extUri.joinPath(this.initData.logsLocation, extension.identifier.value);
            logFile = this.extHostFileSystemInfo.extUri.joinPath(extensionLogDirectory, `${name.replace(/[\\/:\*\?"<>\|]/g, '')}.log`);
            const existingOutputChannel = this.logOutputChannels.get(logFile);
            if (existingOutputChannel) {
                return existingOutputChannel;
            }
            // Only override the extension-specific default log level if the user has explicitly configured a level for this logger.
            // Note: registeredLogger.logLevel is undefined when using defaults, and a LogLevel value when explicitly set by the user.
            const registeredLogger = this.loggerService.getRegisteredLogger(logFile);
            if (registeredLogger?.logLevel !== undefined) {
                logLevel = registeredLogger.logLevel;
            }
            extHostOutputChannelPromise = this.doCreateLogOutputChannel(name, logFile, logLevel, extension, channelDisposables);
        }
        else {
            extHostOutputChannelPromise = this.doCreateOutputChannel(name, languageId, extension, channelDisposables);
        }
        extHostOutputChannelPromise.then(channel => {
            this.channels.set(channel.id, channel);
            channel.visible = channel.id === this.visibleChannelId;
            channelDisposables.add(toDisposable(() => {
                this.channels.delete(channel.id);
                if (logFile) {
                    this.logOutputChannels.delete(logFile);
                }
            }));
        });
        if (logFile) {
            const logOutputChannel = this.createExtHostLogOutputChannel(name, logLevel ?? this.logService.getLevel(), extHostOutputChannelPromise, channelDisposables);
            this.logOutputChannels.set(logFile, logOutputChannel);
            return logOutputChannel;
        }
        return this.createExtHostOutputChannel(name, extHostOutputChannelPromise, channelDisposables);
    }
    async doCreateOutputChannel(name, languageId, extension, channelDisposables) {
        if (!this.outputDirectoryPromise) {
            this.outputDirectoryPromise = this.extHostFileSystem.value.createDirectory(this.outputsLocation).then(() => this.outputsLocation);
        }
        const outputDir = await this.outputDirectoryPromise;
        const file = this.extHostFileSystemInfo.extUri.joinPath(outputDir, `${this.namePool++}-${name.replace(/[\\/:\*\?"<>\|]/g, '')}.log`);
        const logger = channelDisposables.add(this.loggerService.createLogger(file, { logLevel: 'always', donotRotate: true, donotUseFormatters: true, hidden: true }));
        const id = await this.proxy.$register(name, file, languageId, extension.identifier.value);
        channelDisposables.add(toDisposable(() => this.loggerService.deregisterLogger(file)));
        return new ExtHostOutputChannel(id, name, logger, this.proxy, extension);
    }
    async doCreateLogOutputChannel(name, file, logLevel, extension, channelDisposables) {
        await this.createExtensionLogDirectory(file);
        const id = `${extension.identifier.value}.${this.extHostFileSystemInfo.extUri.basename(file)}`;
        const logger = channelDisposables.add(this.loggerService.createLogger(file, { id, name, logLevel, extensionId: extension.identifier.value }));
        channelDisposables.add(toDisposable(() => this.loggerService.deregisterLogger(file)));
        return new ExtHostLogOutputChannel(id, name, logger, this.proxy, extension);
    }
    createExtensionLogDirectory(file) {
        const extensionLogDirectory = this.extHostFileSystemInfo.extUri.dirname(file);
        let extensionLogDirectoryPromise = this.extensionLogDirectoryCreationPromise.get(extensionLogDirectory);
        if (!extensionLogDirectoryPromise) {
            this.extensionLogDirectoryCreationPromise.set(extensionLogDirectory, extensionLogDirectoryPromise = (async () => {
                try {
                    await this.extHostFileSystem.value.createDirectory(extensionLogDirectory);
                }
                catch (err) {
                    if (toFileSystemProviderErrorCode(err) !== FileSystemProviderErrorCode.FileExists) {
                        throw err;
                    }
                }
            })());
        }
        return extensionLogDirectoryPromise;
    }
    createExtHostOutputChannel(name, channelPromise, channelDisposables) {
        const validate = () => {
            if (channelDisposables.isDisposed) {
                throw new Error('Channel has been closed');
            }
        };
        channelPromise.then(channel => channelDisposables.add(channel));
        return {
            get name() { return name; },
            append(value) {
                validate();
                channelPromise.then(channel => channel.append(value));
            },
            appendLine(value) {
                validate();
                channelPromise.then(channel => channel.appendLine(value));
            },
            clear() {
                validate();
                channelPromise.then(channel => channel.clear());
            },
            replace(value) {
                validate();
                channelPromise.then(channel => channel.replace(value));
            },
            show(columnOrPreserveFocus, preserveFocus) {
                validate();
                channelPromise.then(channel => channel.show(columnOrPreserveFocus, preserveFocus));
            },
            hide() {
                validate();
                channelPromise.then(channel => channel.hide());
            },
            dispose() {
                channelDisposables.dispose();
            }
        };
    }
    createExtHostLogOutputChannel(name, logLevel, channelPromise, channelDisposables) {
        const validate = () => {
            if (channelDisposables.isDisposed) {
                throw new Error('Channel has been closed');
            }
        };
        const onDidChangeLogLevel = channelDisposables.add(new Emitter());
        function setLogLevel(newLogLevel) {
            logLevel = newLogLevel;
            onDidChangeLogLevel.fire(newLogLevel);
        }
        channelPromise.then(channel => {
            if (channel.logLevel !== logLevel) {
                setLogLevel(channel.logLevel);
            }
            channelDisposables.add(channel.onDidChangeLogLevel(e => setLogLevel(e)));
        });
        return {
            ...this.createExtHostOutputChannel(name, channelPromise, channelDisposables),
            get logLevel() { return logLevel; },
            onDidChangeLogLevel: onDidChangeLogLevel.event,
            trace(value, ...args) {
                validate();
                channelPromise.then(channel => channel.trace(value, ...args));
            },
            debug(value, ...args) {
                validate();
                channelPromise.then(channel => channel.debug(value, ...args));
            },
            info(value, ...args) {
                validate();
                channelPromise.then(channel => channel.info(value, ...args));
            },
            warn(value, ...args) {
                validate();
                channelPromise.then(channel => channel.warn(value, ...args));
            },
            error(value, ...args) {
                validate();
                channelPromise.then(channel => channel.error(value, ...args));
            }
        };
    }
};
ExtHostOutputService = __decorate([
    __param(0, IExtHostRpcService),
    __param(1, IExtHostInitDataService),
    __param(2, IExtHostConsumerFileSystem),
    __param(3, IExtHostFileSystemInfo),
    __param(4, ILoggerService),
    __param(5, ILogService)
], ExtHostOutputService);
export { ExtHostOutputService };
export const IExtHostOutputService = createDecorator('IExtHostOutputService');
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdE91dHB1dC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9hcGkvY29tbW9uL2V4dEhvc3RPdXRwdXQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFdBQVcsRUFBMkQsTUFBTSx1QkFBdUIsQ0FBQztBQUc3RyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0seURBQXlELENBQUM7QUFDMUYsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sd0JBQXdCLENBQUM7QUFDNUQsT0FBTyxFQUFFLG1CQUFtQixFQUF5QixNQUFNLG1EQUFtRCxDQUFDO0FBQy9HLE9BQU8sRUFBRSxxQkFBcUIsRUFBVyxjQUFjLEVBQUUsV0FBVyxFQUFFLEdBQUcsRUFBWSxNQUFNLHFDQUFxQyxDQUFDO0FBQ2pJLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ2pGLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQzVFLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBQ3RFLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLDRCQUE0QixDQUFDO0FBQ3BFLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQ2hFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUMxRCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDekQsT0FBTyxFQUFFLDJCQUEyQixFQUFFLDZCQUE2QixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDckgsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ3hELE9BQU8sRUFBRSxlQUFlLEVBQUUsWUFBWSxFQUFFLE1BQU0s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