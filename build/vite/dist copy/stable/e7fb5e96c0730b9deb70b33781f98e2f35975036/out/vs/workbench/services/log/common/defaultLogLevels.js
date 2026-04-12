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
import { ILogService, ILoggerService, LogLevelToString, getLogLevel, parseLogLevel } from '../../../../platform/log/common/log.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { IFileService, toFileOperationResult } from '../../../../platform/files/common/files.js';
import { IJSONEditingService } from '../../../services/configuration/common/jsonEditing.js';
import { isString, isUndefined } from '../../../../base/common/types.js';
import { EXTENSION_IDENTIFIER_WITH_LOG_REGEX } from '../../../../platform/environment/common/environmentService.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { parse } from '../../../../base/common/json.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Emitter } from '../../../../base/common/event.js';
import { equals } from '../../../../base/common/objects.js';
export const IDefaultLogLevelsService = createDecorator('IDefaultLogLevelsService');
let DefaultLogLevelsService = class DefaultLogLevelsService extends Disposable {
    constructor(environmentService, fileService, jsonEditingService, logService, loggerService) {
        super();
        this.environmentService = environmentService;
        this.fileService = fileService;
        this.jsonEditingService = jsonEditingService;
        this.logService = logService;
        this.loggerService = loggerService;
        this._onDidChangeDefaultLogLevels = this._register(new Emitter);
        this.onDidChangeDefaultLogLevels = this._onDidChangeDefaultLogLevels.event;
        this._defaultLogLevels = {
            default: this._getDefaultLogLevelFromEnv(),
            extensions: this._getExtensionsDefaultLogLevelsFromEnv()
        };
        this._register(this.fileService.onDidFilesChange(e => {
            if (e.contains(this.environmentService.argvResource)) {
                this.onDidChangeArgv();
            }
        }));
    }
    async onDidChangeArgv() {
        const defaultLogLevelsFromArgv = await this._parseLogLevelsFromArgv();
        this.updateDefaultLogLevels(defaultLogLevelsFromArgv);
    }
    get defaultLogLevels() {
        return this._defaultLogLevels;
    }
    updateDefaultLogLevels(defaultLogLevelsFromArgv) {
        const defaultLogLevels = {
            default: defaultLogLevelsFromArgv?.default ?? this._getDefaultLogLevelFromEnv(),
            extensions: defaultLogLevelsFromArgv?.extensions ?? this._getExtensionsDefaultLogLevelsFromEnv()
        };
        if (!equals(this._defaultLogLevels, defaultLogLevels)) {
            this._defaultLogLevels = defaultLogLevels;
            this._onDidChangeDefaultLogLevels.fire(this._defaultLogLevels);
        }
    }
    getDefaultLogLevel(extensionId) {
        if (extensionId) {
            extensionId = extensionId.toLowerCase();
            return this._getDefaultLogLevel(this._defaultLogLevels, extensionId);
        }
        else {
            return this._getDefaultLogLevel(this._defaultLogLevels);
        }
    }
    async setDefaultLogLevel(defaultLogLevel, extensionId) {
        const defaultLogLevelsFromArgv = await this._parseLogLevelsFromArgv() ?? {};
        if (extensionId) {
            extensionId = extensionId.toLowerCase();
            const currentDefaultLogLevel = this._getDefaultLogLevel(defaultLogLevelsFromArgv, extensionId);
            defaultLogLevelsFromArgv.extensions = defaultLogLevelsFromArgv.extensions ?? [];
            const extension = defaultLogLevelsFromArgv.extensions.find(([extension]) => extension === extensionId);
            if (extension) {
                extension[1] = defaultLogLevel;
            }
            else {
                defaultLogLevelsFromArgv.extensions.push([extensionId, defaultLogLevel]);
            }
            await this._writeLogLevelsToArgv(defaultLogLevelsFromArgv);
            const extensionLoggers = [...this.loggerService.getRegisteredLoggers()].filter(logger => logger.extensionId && logger.extensionId.toLowerCase() === extensionId);
            for (const { resource } of extensionLoggers) {
                if (this.loggerService.getLogLevel(resource) === currentDefaultLogLevel) {
                    this.loggerService.setLogLevel(resource, defaultLogLevel);
                }
            }
        }
        else {
            const currentLogLevel = this._getDefaultLogLevel(defaultLogLevelsFromArgv);
            defaultLogLevelsFromArgv.default = defaultLogLevel;
            await this._writeLogLevelsToArgv(defaultLogLevelsFromArgv);
            if (this.loggerService.getLogLevel() === currentLogLevel) {
                this.loggerService.setLogLevel(defaultLogLevel);
            }
        }
        this.updateDefaultLogLevels(defaultLogLevelsFromArgv);
    }
    _getDefaultLogLevel(argvLogLevels, extension) {
        if (extension) {
            const extensionLogLevel = argvLogLevels.extensions?.find(([extensionId]) => extensionId === extension);
            if (extensionLogLevel) {
                return extensionLogLevel[1];
            }
        }
        return argvLogLevels.default ?? getLogLevel(this.environmentService);
    }
    async _writeLogLevelsToArgv(logLevels) {
        const logLevelsValue = [];
        if (!isUndefined(logLevels.default)) {
            logLevelsValue.push(LogLevelToString(logLevels.default));
        }
        for (const [extension, logLevel] of logLevels.extensions ?? []) {
            logLevelsValue.push(`${extension}=${LogLevelToString(logLevel)}`);
        }
        await this.jsonEditingService.write(this.environmentService.argvResource, [{ path: ['log-level'], value: logLevelsValue.length ? logLevelsValue : undefined }], true);
    }
    async _parseLogLevelsFromArgv() {
        const result = { extensions: [] };
        const logLevels = await this._readLogLevelsFromArgv();
        for (const extensionLogLevel of logLevels) {
            const matches = EXTENSION_IDENTIFIER_WITH_LOG_REGEX.exec(extensionLogLevel);
            if (matches && matches[1] && matches[2]) {
                const logLevel = parseLogLevel(matches[2]);
                if (!isUndefined(logLevel)) {
                    result.extensions?.push([matches[1].toLowerCase(), logLevel]);
                }
            }
            else {
                const logLevel = parseLogLevel(extensionLogLevel);
                if (!isUndefined(logLevel)) {
                    result.default = logLevel;
                }
            }
        }
        return !isUndefined(result.default) || result.extensions?.length ? result : undefined;
    }
    async _readLogLevelsFromArgv() {
        try {
            const content = await this.fileService.readFile(this.environmentService.argvResource);
            const argv = parse(content.value.toString());
            return isString(argv['log-level']) ? [argv['log-level']] : Array.isArray(argv['log-level']) ? argv['log-level'] : [];
        }
        catch (error) {
            if (toFileOperationResult(error) !== 1 /* FileOperationResult.FILE_NOT_FOUND */) {
                this.logService.error(error);
            }
        }
        return [];
    }
    _getDefaultLogLevelFromEnv() {
        return getLogLevel(this.environmentService);
    }
    _getExtensionsDefaultLogLevelsFromEnv() {
        const result = [];
        for (const [extension, logLevelValue] of this.environmentService.extensionLogLevel ?? []) {
            const logLevel = parseLogLevel(logLevelValue);
            if (!isUndefined(logLevel)) {
                result.push([extension, logLevel]);
            }
        }
        return result;
    }
};
DefaultLogLevelsService = __decorate([
    __param(0, IWorkbenchEnvironmentService),
    __param(1, IFileService),
    __param(2, IJSONEditingService),
    __param(3, ILogService),
    __param(4, ILoggerService)
], DefaultLogLevelsService);
registerSingleton(IDefaultLogLevelsService, DefaultLogLevelsService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVmYXVsdExvZ0xldmVscy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9sb2cvY29tbW9uL2RlZmF1bHRMb2dMZXZlbHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFdBQVcsRUFBRSxjQUFjLEVBQVksZ0JBQWdCLEVBQUUsV0FBVyxFQUFFLGFBQWEsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQzdJLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUM3RixPQUFPLEVBQUUsNEJBQTRCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUMxRyxPQUFPLEVBQXVCLFlBQVksRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ3RILE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQzVGLE9BQU8sRUFBRSxRQUFRLEVBQUUsV0FBVyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDekUsT0FBTyxFQUFFLG1DQUFtQyxFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDcEgsT0FBTyxFQUFxQixpQkFBaUIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQy9HLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUN4RCxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbEUsT0FBTyxFQUFFLE9BQU8sRUFBUyxNQUFNLGtDQUFrQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQVM1RCxNQUFNLENBQUMsTUFBTSx3QkFBd0IsR0FBRyxlQUFlLENBQTJCLDBCQUEwQixDQUFDLENBQUM7QUFhOUcsSUFBTSx1QkFBdUIsR0FBN0IsTUFBTSx1QkFBd0IsU0FBUSxVQUFVO0lBUy9DLFlBQytCLGtCQUFpRSxFQUNqRixXQUEwQyxFQUNuQyxrQkFBd0QsRUFDaEUsVUFBd0MsRUFDckMsYUFBOEM7UUFFOUQsS0FBSyxFQUFFLENBQUM7UUFOdUMsdUJBQWtCLEdBQWxCLGtCQUFrQixDQUE4QjtRQUNoRSxnQkFBVyxHQUFYLFdBQVcsQ0FBYztRQUNsQix1QkFBa0IsR0FBbEIsa0JBQWtCLENBQXFCO1FBQy9DLGVBQVUsR0FBVixVQUFVLENBQWE7UUFDcEIsa0JBQWEsR0FBYixhQUFhLENBQWdCO1FBVnZELGlDQUE0QixHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUF5QixDQUFDLENBQUM7UUFDNUUsZ0NBQTJCLEdBQUcsSUFBSSxDQUFDLDRCQUE0QixDQUFDLEtBQUssQ0FBQztRQVk5RSxJQUFJLENBQUMsaUJBQWlCLEdBQUc7WUFDeEIsT0FBTyxFQUFFLElBQUksQ0FBQywwQkFBMEIsRUFBRTtZQUMxQyxVQUFVLEVBQUUsSUFBSSxDQUFDLHFDQUFxQyxFQUFFO1NBQ3hELENBQUM7UUFDRixJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDLEVBQUU7WUFDcEQsSUFBSSxDQUFDLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxZQUFZLENBQUMsRUFBRSxDQUFDO2dCQUN0RCxJQUFJLENBQUMsZUFBZSxFQUFFLENBQUM7WUFDeEIsQ0FBQztRQUNGLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDO0lBRU8sS0FBSyxDQUFDLGVBQWU7UUFDNUIsTUFBTSx3QkFBd0IsR0FBRyxNQUFNLElBQUksQ0FBQyx1QkFBdUIsRUFBRSxDQUFDO1FBQ3RFLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDO0lBQ3ZELENBQUM7SUFFRCxJQUFJLGdCQUFnQjtRQUNuQixPQUFPLElBQUksQ0FBQyxpQkFBaUIsQ0FBQztJQUMvQixDQUFDO0lBRU8sc0JBQXNCLENBQUMsd0JBQXlEO1FBQ3ZGLE1BQU0sZ0JBQWdCLEdBQUc7WUFDeEIsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE9BQU8sSUFBSSxJQUFJLENBQUMsMEJBQTBCLEVBQUU7WUFDL0UsVUFBVSxFQUFFLHdCQUF3QixFQUFFLFVBQVUsSUFBSSxJQUFJLENBQUMscUNBQXFDLEVBQUU7U0FDaEcsQ0FBQztRQUNGLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLGlCQUFpQixFQUFFLGdCQUFnQixDQUFDLEVBQUUsQ0FBQztZQUN2RCxJQUFJLENBQUMsaUJBQWlCLEdBQUcsZ0JBQWdCLENBQUM7WUFDMUMsSUFBSSxDQUFDLDRCQUE0QixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsaUJBQWlCLENBQUMsQ0FBQztRQUNoRSxDQUFDO0lBQ0YsQ0FBQztJQUVELGtCQUFrQixDQUFDLFdBQW9CO1FBQ3RDLElBQUksV0FBVyxFQUFFLENBQUM7WUFDakIsV0FBVyxHQUFHLFdBQVcsQ0FBQyxXQUFXLEVBQUUsQ0FBQztZQUN4QyxPQUFPLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxJQUFJLENBQUMsaUJBQWlCLEVBQUUsV0FBVyxDQUFDLENBQUM7UUFDdEUsQ0FBQzthQUFNLENBQUM7WUFDUCxPQUFPLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxJQUFJLENBQUMsaUJBQWlCLENBQUMsQ0FBQztRQUN6RCxDQUFDO0lBQ0YsQ0FBQztJQUVELEtBQUssQ0FBQyxrQkFBa0IsQ0FBQyxlQUF5QixFQUFFLFdBQW9CO1FBQ3ZFLE1BQU0sd0JBQXdCLEdBQUcsTUFBTSxJQUFJLENBQUMsdUJBQXVCLEVBQUUsSUFBSSxFQUFFLENBQUM7UUFDNUUsSUFBSSxXQUFXLEVBQUUsQ0FBQztZQUNqQixXQUFXLEdBQUcsV0FBVyxDQUFDLFdBQVcsRUFBRSxDQUFDO1lBQ3hDLE1BQU0sc0JBQXNCLEdBQUcsSUFBSSxDQUFDLG1CQUFtQixDQUFDLHdCQUF3QixFQUFFLFdBQVcsQ0FBQyxDQUFDO1lBQy9GLHdCQUF3QixDQUFDLFVBQVUsR0FBRyx3QkFBd0IsQ0FBQyxVQUFVLElBQUksRUFBRSxDQUFDO1lBQ2hGLE1BQU0sU0FBUyxHQUFHLHdCQUF3QixDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxTQUFTLEtBQUssV0FBVyxDQUFDLENBQUM7WUFDdkcsSUFBSSxTQUFTLEVBQUUsQ0FBQztnQkFDZixTQUFTLENBQUMsQ0FBQyxDQUFDLEdBQUcsZUFBZSxDQUFDO1lBQ2hDLENBQUM7aUJBQU0sQ0FBQztnQkFDUCx3QkFBd0IsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLENBQUMsV0FBVyxFQUFFLGVBQWUsQ0FBQyxDQUFDLENBQUM7WUFDMUUsQ0FBQztZQUNELE1BQU0sSUFBSSxDQUFDLHFCQUFxQixDQUFDLHdCQUF3QixDQUFDLENBQUM7WUFDM0QsTUFBTSxnQkFBZ0IsR0FBRyxDQUFDLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQyxvQkFBb0IsRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLFdBQVcsSUFBSSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsRUFBRSxLQUFLLFdBQVcsQ0FBQyxDQUFDO1lBQ2pLLEtBQUssTUFBTSxFQUFFLFFBQVEsRUFBRSxJQUFJLGdCQUFnQixFQUFFLENBQUM7Z0JBQzdDLElBQUksSUFBSSxDQUFDLGFBQWEsQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFDLEtBQUssc0JBQXNCLEVBQUUsQ0FBQztvQkFDekUsSUFBSSxDQUFDLGFBQWEsQ0FBQyxXQUFXLENBQUMsUUFBUSxFQUFFLGVBQWUsQ0FBQyxDQUFDO2dCQUMzRCxDQUFDO1lBQ0YsQ0FBQztRQUNGLENBQUM7YUFBTSxDQUFDO1lBQ1AsTUFBTSxlQUFlLEdBQUcsSUFBSSxDQUFDLG1CQUFtQixDQUFDLHdCQUF3QixDQUFDLENBQUM7WUFDM0Usd0JBQXdCLENBQUMsT0FBTyxHQUFHLGVBQWUsQ0FBQztZQUNuRCxNQUFNLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDO1lBQzNELElBQUksSUFBSSxDQUFDLGFBQWEsQ0FBQyxXQUFXLEVBQUUsS0FBSyxlQUFlLEVBQUUsQ0FBQztnQkFDMUQsSUFBSSxDQUFDLGFBQWEsQ0FBQyxXQUFXLENBQUMsZUFBZSxDQUFDLENBQUM7WUFDakQsQ0FBQztRQUNGLENBQUM7UUFDRCxJQUFJLENBQUMsc0JBQXNCLENBQUMsd0JBQXdCLENBQUMsQ0FBQztJQUN2RCxDQUFDO0lBRU8sbUJBQW1CLENBQUMsYUFBa0MsRUFBRSxTQUFrQjtRQUNqRixJQUFJLFNBQVMsRUFBRSxDQUFDO1lBQ2YsTUFBTSxpQkFBaUIsR0FBRyxhQUFhLENBQUMsVUFBVSxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUMsV0FBVyxDQUFDLEVBQUUsRUFBRSxDQUFDLFdBQVcsS0FBSyxTQUFTLENBQUMsQ0FBQztZQUN2RyxJQUFJLGlCQUFpQixFQUFFLENBQUM7Z0JBQ3ZCLE9BQU8saUJBQWlCLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDN0IsQ0FBQztRQUNGLENBQUM7UUFDRCxPQUFPLGFBQWEsQ0FBQyxPQUFPLElBQUksV0FBVyxDQUFDLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO0lBQ3RFLENBQUM7SUFFTyxLQUFLLENBQUMscUJBQXFCLENBQUMsU0FBOEI7UUFDakUsTUFBTSxjQUFjLEdBQWEsRUFBRSxDQUFDO1FBQ3BDLElBQUksQ0FBQyxXQUFXLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7WUFDckMsY0FBYyxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxTQUFTLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztRQUMxRCxDQUFDO1FBQ0QsS0FBSyxNQUFNLENBQUMsU0FBUyxFQUFFLFFBQVEsQ0FBQyxJQUFJLFNBQVMsQ0FBQyxVQUFVLElBQUksRUFBRSxFQUFFLENBQUM7WUFDaEUsY0FBYyxDQUFDLElBQUksQ0FBQyxHQUFHLFNBQVMsSUFBSSxnQkFBZ0IsQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDbkUsQ0FBQztRQUNELE1BQU0sSUFBSSxDQUFDLGtCQUFrQixDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsa0JBQWtCLENBQUMsWUFBWSxFQUFFLENBQUMsRUFBRSxJQUFJLEVBQUUsQ0FBQyxXQUFXLENBQUMsRUFBRSxLQUFLLEVBQUUsY0FBYyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQyxTQUFTLEVBQUUsQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQ3ZLLENBQUM7SUFFTyxLQUFLLENBQUMsdUJBQXVCO1FBQ3BDLE1BQU0sTUFBTSxHQUF3QixFQUFFLFVBQVUsRUFBRSxFQUFFLEVBQUUsQ0FBQztRQUN2RCxNQUFNLFNBQVMsR0FBRyxNQUFNLElBQUksQ0FBQyxzQkFBc0IsRUFBRSxDQUFDO1FBQ3RELEtBQUssTUFBTSxpQkFBaUIsSUFBSSxTQUFTLEVBQUUsQ0FBQztZQUMzQyxNQUFNLE9BQU8sR0FBRyxtQ0FBbUMsQ0FBQyxJQUFJLENBQUMsaUJBQWlCLENBQUMsQ0FBQztZQUM1RSxJQUFJLE9BQU8sSUFBSSxPQUFPLENBQUMsQ0FBQyxDQUFDLElBQUksT0FBTyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7Z0JBQ3pDLE1BQU0sUUFBUSxHQUFHLGFBQWEsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDM0MsSUFBSSxDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDO29CQUM1QixNQUFNLENBQUMsVUFBVSxFQUFFLElBQUksQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxXQUFXLEVBQUUsRUFBRSxRQUFRLENBQUMsQ0FBQyxDQUFDO2dCQUMvRCxDQUFDO1lBQ0YsQ0FBQztpQkFBTSxDQUFDO2dCQUNQLE1BQU0sUUFBUSxHQUFHLGFBQWEsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO2dCQUNsRCxJQUFJLENBQUMsV0FBVyxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUM7b0JBQzVCLE1BQU0sQ0FBQyxPQUFPLEdBQUcsUUFBUSxDQUFDO2dCQUMzQixDQUFDO1lBQ0YsQ0FBQztRQUNGLENBQUM7UUFDRCxPQUFPLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsSUFBSSxNQUFNLENBQUMsVUFBVSxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUM7SUFDdkYsQ0FBQztJQUVPLEtBQUssQ0FBQyxzQkFBc0I7UUFDbkMsSUFBSSxDQUFDO1lBQ0osTUFBTSxPQUFPLEdBQUcsTUFBTSxJQUFJLENBQUMsV0FBVyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsa0JBQWtCLENBQUMsWUFBWSxDQUFDLENBQUM7WUFDdEYsTUFBTSxJQUFJLEdBQXdDLEtBQUssQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7WUFDbEYsT0FBTyxRQUFRLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO1FBQ3RILENBQUM7UUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1lBQ2hCLElBQUkscUJBQXFCLENBQUMsS0FBSyxDQUFDLCtDQUF1QyxFQUFFLENBQUM7Z0JBQ3pFLElBQUksQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQzlCLENBQUM7UUFDRixDQUFDO1FBQ0QsT0FBTyxFQUFFLENBQUM7SUFDWCxDQUFDO0lBRU8sMEJBQTBCO1FBQ2pDLE9BQU8sV0FBVyxDQUFDLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO0lBQzdDLENBQUM7SUFFTyxxQ0FBcUM7UUFDNUMsTUFBTSxNQUFNLEdBQXlCLEVBQUUsQ0FBQztRQUN4QyxLQUFLLE1BQU0sQ0FBQyxTQUFTLEVBQUUsYUFBYSxDQUFDLElBQUksSUFBSSxDQUFDLGtCQUFrQixDQUFDLGlCQUFpQixJQUFJLEVBQUUsRUFBRSxDQUFDO1lBQzFGLE1BQU0sUUFBUSxHQUFHLGFBQWEsQ0FBQyxhQUFhLENBQUMsQ0FBQztZQUM5QyxJQUFJLENBQUMsV0FBVyxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUM7Z0JBQzVCLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxTQUFTLEVBQUUsUUFBUSxDQUFDLENBQUMsQ0FBQztZQUNwQyxDQUFDO1FBQ0YsQ0FBQztRQUNELE9BQU8sTUFBTSxDQUFDO0lBQ2YsQ0FBQztDQUNELENBQUE7QUEzSkssdUJBQXVCO0lBVTFCLFdBQUEsNEJBQTRCLENBQUE7SUFDNUIsV0FBQSxZQUFZLENBQUE7SUFDWixXQUFBLG1CQUFtQixDQUFBO0lBQ25CLFdBQUEsV0FBVyxDQUFBO0lBQ1gsV0FBQSxjQUFjLENBQUE7R0FkWCx1QkFBdUIsQ0EySjVCO0FBRUQsaUJBQWlCLENBQUMsd0JBQXdCLEVBQUUsdUJBQXVCLG9DQUE0QixDQUFDIn0=