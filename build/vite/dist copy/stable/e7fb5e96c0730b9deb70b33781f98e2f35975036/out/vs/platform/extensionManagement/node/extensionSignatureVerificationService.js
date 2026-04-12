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
import { getErrorMessage } from '../../../base/common/errors.js';
import { isDefined } from '../../../base/common/types.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ILogService, LogLevel } from '../../log/common/log.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { ExtensionSignatureVerificationCode } from '../common/extensionManagement.js';
export const IExtensionSignatureVerificationService = createDecorator('IExtensionSignatureVerificationService');
let ExtensionSignatureVerificationService = class ExtensionSignatureVerificationService {
    constructor(logService, telemetryService) {
        this.logService = logService;
        this.telemetryService = telemetryService;
    }
    vsceSign() {
        if (!this.moduleLoadingPromise) {
            this.moduleLoadingPromise = this.resolveVsceSign();
        }
        return this.moduleLoadingPromise;
    }
    async resolveVsceSign() {
        const mod = '@vscode/vsce-sign';
        return import(mod);
    }
    async verify(extensionId, version, vsixFilePath, signatureArchiveFilePath, clientTargetPlatform) {
        let module;
        try {
            module = await this.vsceSign();
        }
        catch (error) {
            this.logService.error('Could not load vsce-sign module', getErrorMessage(error));
            this.logService.info(`Extension signature verification is not done: ${extensionId}`);
            return undefined;
        }
        const startTime = new Date().getTime();
        let result;
        try {
            this.logService.trace(`Verifying extension signature for ${extensionId}...`);
            result = await module.verify(vsixFilePath, signatureArchiveFilePath, this.logService.getLevel() === LogLevel.Trace);
        }
        catch (e) {
            result = {
                code: ExtensionSignatureVerificationCode.UnknownError,
                didExecute: false,
                output: getErrorMessage(e)
            };
        }
        const duration = new Date().getTime() - startTime;
        this.logService.info(`Extension signature verification result for ${extensionId}: ${result.code}. ${isDefined(result.internalCode) ? `Internal Code: ${result.internalCode}. ` : ''}Executed: ${result.didExecute}. Duration: ${duration}ms.`);
        this.logService.trace(`Extension signature verification output for ${extensionId}:\n${result.output}`);
        this.telemetryService.publicLog2('extensionsignature:verification', {
            extensionId,
            extensionVersion: version,
            code: result.code,
            internalCode: result.internalCode,
            duration,
            didExecute: result.didExecute,
            clientTargetPlatform,
        });
        return { code: result.code };
    }
};
ExtensionSignatureVerificationService = __decorate([
    __param(0, ILogService),
    __param(1, ITelemetryService)
], ExtensionSignatureVerificationService);
export { ExtensionSignatureVerificationService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uU2lnbmF0dXJlVmVyaWZpY2F0aW9uU2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL2V4dGVuc2lvbk1hbmFnZW1lbnQvbm9kZS9leHRlbnNpb25TaWduYXR1cmVWZXJpZmljYXRpb25TZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFFMUQsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQzlFLE9BQU8sRUFBRSxXQUFXLEVBQUUsUUFBUSxFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFDaEUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDeEUsT0FBTyxFQUFFLGtDQUFrQyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFFdEYsTUFBTSxDQUFDLE1BQU0sc0NBQXNDLEdBQUcsZUFBZSxDQUF5Qyx3Q0FBd0MsQ0FBQyxDQUFDO0FBcUNqSixJQUFNLHFDQUFxQyxHQUEzQyxNQUFNLHFDQUFxQztJQUtqRCxZQUMrQixVQUF1QixFQUNqQixnQkFBbUM7UUFEekMsZUFBVSxHQUFWLFVBQVUsQ0FBYTtRQUNqQixxQkFBZ0IsR0FBaEIsZ0JBQWdCLENBQW1CO0lBQ3BFLENBQUM7SUFFRyxRQUFRO1FBQ2YsSUFBSSxDQUFDLElBQUksQ0FBQyxvQkFBb0IsRUFBRSxDQUFDO1lBQ2hDLElBQUksQ0FBQyxvQkFBb0IsR0FBRyxJQUFJLENBQUMsZUFBZSxFQUFFLENBQUM7UUFDcEQsQ0FBQztRQUVELE9BQU8sSUFBSSxDQUFDLG9CQUFvQixDQUFDO0lBQ2xDLENBQUM7SUFFTyxLQUFLLENBQUMs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