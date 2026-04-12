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
import { ThrottledDelayer } from '../../../base/common/async.js';
import { VSBuffer } from '../../../base/common/buffer.js';
import { basename, dirname, joinPath } from '../../../base/common/resources.js';
import { ByteSize, IFileService, whenProviderRegistered } from '../../files/common/files.js';
import { BufferLogger } from './bufferLog.js';
import { AbstractLoggerService, AbstractMessageLogger, LogLevel } from './log.js';
const MAX_FILE_SIZE = 5 * ByteSize.MB;
let FileLogger = class FileLogger extends AbstractMessageLogger {
    constructor(resource, level, donotUseFormatters, fileService) {
        super();
        this.resource = resource;
        this.donotUseFormatters = donotUseFormatters;
        this.fileService = fileService;
        this.backupIndex = 1;
        this.buffer = '';
        this.setLevel(level);
        this.flushDelayer = new ThrottledDelayer(100 /* buffer saves over a short time */);
        this.initializePromise = this.initialize();
    }
    async flush() {
        if (!this.buffer) {
            return;
        }
        await this.initializePromise;
        let content = await this.loadContent();
        if (content.length > MAX_FILE_SIZE) {
            await this.fileService.writeFile(this.getBackupResource(), VSBuffer.fromString(content));
            content = '';
        }
        if (this.buffer) {
            content += this.buffer;
            this.buffer = '';
            await this.fileService.writeFile(this.resource, VSBuffer.fromString(content));
        }
    }
    async initialize() {
        try {
            await this.fileService.createFile(this.resource);
        }
        catch (error) {
            if (error.fileOperationResult !== 3 /* FileOperationResult.FILE_MODIFIED_SINCE */) {
                throw error;
            }
        }
    }
    log(level, message) {
        if (this.donotUseFormatters) {
            this.buffer += message;
        }
        else {
            this.buffer += `${this.getCurrentTimestamp()} [${this.stringifyLogLevel(level)}] ${message}\n`;
        }
        this.flushDelayer.trigger(() => this.flush());
    }
    getCurrentTimestamp() {
        const toTwoDigits = (v) => v < 10 ? `0${v}` : v;
        const toThreeDigits = (v) => v < 10 ? `00${v}` : v < 100 ? `0${v}` : v;
        const currentTime = new Date();
        return `${currentTime.getFullYear()}-${toTwoDigits(currentTime.getMonth() + 1)}-${toTwoDigits(currentTime.getDate())} ${toTwoDigits(currentTime.getHours())}:${toTwoDigits(currentTime.getMinutes())}:${toTwoDigits(currentTime.getSeconds())}.${toThreeDigits(currentTime.getMilliseconds())}`;
    }
    getBackupResource() {
        this.backupIndex = this.backupIndex > 5 ? 1 : this.backupIndex;
        return joinPath(dirname(this.resource), `${basename(this.resource)}_${this.backupIndex++}`);
    }
    async loadContent() {
        try {
            const content = await this.fileService.readFile(this.resource);
            return content.value.toString();
        }
        catch (e) {
            return '';
        }
    }
    stringifyLogLevel(level) {
        switch (level) {
            case LogLevel.Debug: return 'debug';
            case LogLevel.Error: return 'error';
            case LogLevel.Info: return 'info';
            case LogLevel.Trace: return 'trace';
            case LogLevel.Warning: return 'warning';
        }
        return '';
    }
};
FileLogger = __decorate([
    __param(3, IFileService)
], FileLogger);
export class FileLoggerService extends AbstractLoggerService {
    constructor(logLevel, logsHome, fileService) {
        super(logLevel, logsHome);
        this.fileService = fileService;
    }
    doCreateLogger(resource, logLevel, options) {
        const logger = new BufferLogger(logLevel);
        whenProviderRegistered(resource, this.fileService).then(() => logger.logger = new FileLogger(resource, logger.getLevel(), !!options?.donotUseFormatters, this.fileService));
        return logger;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZmlsZUxvZy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL2xvZy9jb21tb24vZmlsZUxvZy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUNqRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDMUQsT0FBTyxFQUFFLFFBQVEsRUFBRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFFaEYsT0FBTyxFQUFFLFFBQVEsRUFBMkMsWUFBWSxFQUFFLHNCQUFzQixFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFDdEksT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLGdCQUFnQixDQUFDO0FBQzlDLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxxQkFBcUIsRUFBMkMsUUFBUSxFQUFFLE1BQU0sVUFBVSxDQUFDO0FBRTNILE1BQU0sYUFBYSxHQUFHLENBQUMsR0FBRyxRQUFRLENBQUMsRUFBRSxDQUFDO0FBRXRDLElBQU0sVUFBVSxHQUFoQixNQUFNLFVBQVcsU0FBUSxxQkFBcUI7SUFPN0MsWUFDa0IsUUFBYSxFQUM5QixLQUFlLEVBQ0Usa0JBQTJCLEVBQzlCLFdBQTBDO1FBRXhELEtBQUssRUFBRSxDQUFDO1FBTFMsYUFBUSxHQUFSLFFBQVEsQ0FBSztRQUViLHVCQUFrQixHQUFsQixrQkFBa0IsQ0FBUztRQUNiLGdCQUFXLEdBQVgsV0FBVyxDQUFjO1FBUGpELGdCQUFXLEdBQVcsQ0FBQyxDQUFDO1FBQ3hCLFdBQU0sR0FBVyxFQUFFLENBQUM7UUFTM0IsSUFBSSxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUNyQixJQUFJLENBQUMsWUFBWSxHQUFHLElBQUksZ0JBQWdCLENBQU8sR0FBRyxD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