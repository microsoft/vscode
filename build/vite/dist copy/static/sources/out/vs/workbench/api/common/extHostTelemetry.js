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
import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';
import { Emitter } from '../../../base/common/event.js';
import { ILoggerService } from '../../../platform/log/common/log.js';
import { IExtHostInitDataService } from './extHostInitDataService.js';
import { UIKind } from '../../services/extensions/common/extensionHostProtocol.js';
import { cleanData, cleanRemoteAuthority, TelemetryLogGroup } from '../../../platform/telemetry/common/telemetryUtils.js';
import { mixin } from '../../../base/common/objects.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { localize } from '../../../nls.js';
let ExtHostTelemetry = class ExtHostTelemetry extends Disposable {
    constructor(isWorker, initData, loggerService) {
        super();
        this.initData = initData;
        this._onDidChangeTelemetryEnabled = this._register(new Emitter());
        this.onDidChangeTelemetryEnabled = this._onDidChangeTelemetryEnabled.event;
        this._onDidChangeTelemetryConfiguration = this._register(new Emitter());
        this.onDidChangeTelemetryConfiguration = this._onDidChangeTelemetryConfiguration.event;
        this._productConfig = { usage: true, error: true };
        this._level = 0 /* TelemetryLevel.NONE */;
        this._inLoggingOnlyMode = false;
        this._telemetryLoggers = new Map();
        this._inLoggingOnlyMode = this.initData.environment.isExtensionTelemetryLoggingOnly;
        const id = initData.remote.isRemote ? 'remoteExtHostTelemetry' : isWorker ? 'workerExtHostTelemetry' : 'extHostTelemetry';
        this._outputLogger = this._register(loggerService.createLogger(id, {
            name: localize('extensionTelemetryLog', "Extension Telemetry{0}", this._inLoggingOnlyMode ? ' (Not Sent)' : ''),
            hidden: true,
            group: TelemetryLogGroup,
        }));
    }
    getTelemetryConfiguration() {
        return this._level === 3 /* TelemetryLevel.USAGE */;
    }
    getTelemetryDetails() {
        return {
            isCrashEnabled: this._level >= 1 /* TelemetryLevel.CRASH */,
            isErrorsEnabled: this._productConfig.error ? this._level >= 2 /* TelemetryLevel.ERROR */ : false,
            isUsageEnabled: this._productConfig.usage ? this._level >= 3 /* TelemetryLevel.USAGE */ : false
        };
    }
    instantiateLogger(extension, sender, options) {
        const telemetryDetails = this.getTelemetryDetails();
        const logger = new ExtHostTelemetryLogger(sender, options, extension, this._outputLogger, this._inLoggingOnlyMode, this.getBuiltInCommonProperties(extension), { isUsageEnabled: telemetryDetails.isUsageEnabled, isErrorsEnabled: telemetryDetails.isErrorsEnabled });
        const loggers = this._telemetryLoggers.get(extension.identifier.value) ?? [];
        this._telemetryLoggers.set(extension.identifier.value, [...loggers, logger]);
        return logger.apiTelemetryLogger;
    }
    $initializeTelemetryLevel(level, supportsTelemetry, productConfig) {
        this._level = level;
        this._productConfig = productConfig ?? { usage: true, error: true };
    }
    getBuiltInCommonProperties(extension) {
        const commonProperties = Object.create(null);
        // TODO @lramos15, does os info like node arch, platform version, etc exist here.
        // Or will first party extensions just mix this in
        commonProperties['common.extname'] = `${extension.publisher}.${extension.name}`;
        commonProperties['common.extversion'] = extension.version;
        commonProperties['common.vscodemachineid'] = this.initData.telemetryInfo.machineId;
        commonProperties['common.vscodesessionid'] = this.initData.telemetryInfo.sessionId;
        commonProperties['common.vscodecommithash'] = this.initData.commit;
        commonProperties['common.sqmid'] = this.initData.telemetryInfo.sqmId;
        commonProperties['common.devDeviceId'] = this.initData.telemetryInfo.devDeviceId ?? this.initData.telemetryInfo.machineId;
        commonProperties['common.vscodeversion'] = this.initData.version;
        commonProperties['common.vscodereleasedate'] = this.initData.date;
        commonProperties['common.isnewappinstall'] = isNewAppInstall(this.initData.telemetryInfo.firstSessionDate);
        commonProperties['common.product'] = this.initData.environment.appHost;
        switch (this.initData.uiKind) {
            case UIKind.Web:
                commonProperties['common.uikind'] = 'web';
                break;
            case UIKind.Desktop:
                commonProperties['common.uikind'] = 'desktop';
                break;
            default:
                commonProperties['common.uikind'] = 'unknown';
        }
        commonProperties['common.remotename'] = cleanRemoteAuthority(this.initData.remote.authority, this.initData);
        return commonProperties;
    }
    $onDidChangeTelemetryLevel(level) {
        this._oldTelemetryEnablement = this.getTelemetryConfiguration();
        this._level = level;
        const telemetryDetails = this.getTelemetryDetails();
        // Remove all disposed loggers
        this._telemetryLoggers.forEach((loggers, key) => {
            const newLoggers = loggers.filter(l => !l.isDisposed);
            if (newLoggers.length === 0) {
                this._telemetryLoggers.delete(key);
            }
            else {
                this._telemetryLoggers.set(key, newLoggers);
            }
        });
        // Loop through all loggers and update their level
        this._telemetryLoggers.forEach(loggers => {
            for (const logger of loggers) {
                logger.updateTelemetryEnablements(telemetryDetails.isUsageEnabled, telemetryDetails.isErrorsEnabled);
            }
        });
        if (this._oldTelemetryEnablement !== this.getTelemetryConfiguration()) {
            this._onDidChangeTelemetryEnabled.fire(this.getTelemetryConfiguration());
        }
        this._onDidChangeTelemetryConfiguration.fire(this.getTelemetryDetails());
    }
    onExtensionError(extension, error) {
        const loggers = this._telemetryLoggers.get(extension.value);
        const nonDisposedLoggers = loggers?.filter(l => !l.isDisposed);
        if (!nonDisposedLoggers) {
            this._telemetryLoggers.delete(extension.value);
            return false;
        }
        let errorEmitted = false;
        for (const logger of nonDisposedLoggers) {
            if (logger.ignoreUnhandledExtHostErrors) {
                continue;
            }
            logger.logError(error);
            errorEmitted = true;
        }
        return errorEmitted;
    }
};
ExtHostTelemetry = __decorate([
    __param(1, IExtHostInitDataService),
    __param(2, ILoggerService)
], ExtHostTelemetry);
export { ExtHostTelemetry };
export class ExtHostTelemetryLogger {
    static validateSender(sender) {
        if (typeof sender !== 'object') {
            throw new TypeError('TelemetrySender argument is invalid');
        }
        if (typeof sender.sendEventData !== 'function') {
            throw new TypeError('TelemetrySender.sendEventData must be a function');
        }
        if (typeof sender.sendErrorData !== 'function') {
            throw new TypeError('TelemetrySender.sendErrorData must be a function');
        }
        if (typeof sender.flush !== 'undefined' && typeof sender.flush !== 'function') {
            throw new TypeError('TelemetrySender.flush must be a function or undefined');
        }
    }
    constructor(sender, options, _extension, _logger, _inLoggingOnlyMode, _commonProperties, telemetryEnablements) {
        this._extension = _extension;
        this._logger = _logger;
        this._inLoggingOnlyMode = _inLoggingOnlyMode;
        this._commonProperties = _commonProperties;
        this._onDidChangeEnableStates = new Emitter();
        this.ignoreUnhandledExtHostErrors = options?.ignoreUnhandledErrors ?? false;
        this._ignoreBuiltinCommonProperties = options?.ignoreBuiltInCommonProperties ?? false;
        this._additionalCommonProperties = options?.additionalCommonProperties;
        this._sender = sender;
        this._telemetryEnablements = { isUsageEnabled: telemetryEnablements.isUsageEnabled, isErrorsEnabled: telemetryEnablements.isErrorsEnabled };
    }
    updateTelemetryEnablements(isUsageEnabled, isErrorsEnabled) {
        if (this._apiObject) {
            this._telemetryEnablements = { isUsageEnabled, isErrorsEnabled };
            this._onDidChangeEnableStates.fire(this._apiObject);
        }
    }
    mixInCommonPropsAndCleanData(data) {
        // Some telemetry modules prefer to break properties and measurmements up
        // We mix common properties into the properties tab.
        let updatedData = data.properties ? (data.properties ?? {}) : data;
        // We don't clean measurements since they are just numbers
        updatedData = cleanData(updatedData, []);
        if (this._additionalCommonProperties) {
            updatedData = mixin(updatedData, this._additionalCommonProperties);
        }
        if (!this._ignoreBuiltinCommonProperties) {
            updatedData = mixin(updatedData, this._commonProperties);
        }
        if (data.properties) {
            data.properties = updatedData;
        }
        else {
            data = updatedData;
        }
        return data;
    }
    logEvent(eventName, data) {
        // No sender means likely disposed of, we should no-op
        if (!this._sender) {
            return;
        }
        // If it's a built-in extension (vscode publisher) we don't prefix the publisher and only the ext name
        if (this._extension.publisher === 'vscode') {
            eventName = this._extension.name + '/' + eventName;
        }
        else {
            eventName = this._extension.identifier.value + '/' + eventName;
        }
        data = this.mixInCommonPropsAndCleanData(data || {});
        if (!this._inLoggingOnlyMode) {
            this._sender?.sendEventData(eventName, data);
        }
        this._logger.trace(eventName, data);
    }
    logUsage(eventName, data) {
        if (!this._telemetryEnablements.isUsageEnabled) {
            return;
        }
        this.logEvent(eventName, data);
    }
    logError(eventNameOrException, data) {
        if (!this._telemetryEnablements.isErrorsEnabled || !this._sender) {
            return;
        }
        if (typeof eventNameOrException === 'string') {
            this.logEvent(eventNameOrException, data);
        }
        else {
            const errorData = {
                name: eventNameOrException.name,
                message: eventNameOrException.message,
                stack: eventNameOrException.stack,
                cause: eventNameOrException.cause
            };
            const cleanedErrorData = cleanData(errorData, []);
            // Reconstruct the error object with the cleaned data
            const cleanedError = new Error(typeof cleanedErrorData.message === 'string' ? cleanedErrorData.message : undefined, {
                cause: cleanedErrorData.cause
            });
            cleanedError.stack = typeof cleanedErrorData.stack === 'string' ? cleanedErrorData.stack : undefined;
            cleanedError.name = typeof cleanedErrorData.name === 'string' ? cleanedErrorData.name : 'unknown';
            data = this.mixInCommonPropsAndCleanData(data || {});
            if (!this._inLoggingOnlyMode) {
                this._sender.sendErrorData(cleanedError, data);
            }
            this._logger.trace('exception', data);
        }
    }
    get apiTelemetryLogger() {
        if (!this._apiObject) {
            const that = this;
            const obj = {
                logUsage: that.logUsage.bind(that),
                get isUsageEnabled() {
                    return that._telemetryEnablements.isUsageEnabled;
                },
                get isErrorsEnabled() {
                    return that._telemetryEnablements.isErrorsEnabled;
                },
                logError: that.logError.bind(that),
                dispose: that.dispose.bind(that),
                onDidChangeEnableStates: that._onDidChangeEnableStates.event.bind(that)
            };
            this._apiObject = Object.freeze(obj);
        }
        return this._apiObject;
    }
    get isDisposed() {
        return !this._sender;
    }
    dispose() {
        if (this._sender?.flush) {
            let tempSender = this._sender;
            this._sender = undefined;
            Promise.resolve(tempSender.flush()).then(tempSender = undefined);
            this._apiObject = undefined;
        }
        else {
            this._sender = undefined;
        }
        this._onDidChangeEnableStates.dispose();
    }
}
export function isNewAppInstall(firstSessionDate) {
    const installAge = Date.now() - new Date(firstSessionDate).getTime();
    return isNaN(installAge) ? false : installAge < 1000 * 60 * 60 * 24; // install age is less than a day
}
export const IExtHostTelemetry = createDecorator('IExtHostTelemetry');
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdFRlbGVtZXRyeS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9hcGkvY29tbW9uL2V4dEhvc3RUZWxlbWV0cnkudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFHaEcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQzFGLE9BQU8sRUFBUyxPQUFPLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUcvRCxPQUFPLEVBQVcsY0FBYyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDOUUsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFFdEUsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLDJEQUEyRCxDQUFDO0FBQ25GLE9BQU8sRUFBRSxTQUFTLEVBQUUsb0JBQW9CLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUMxSCxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDeEQsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQy9ELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxpQkFBaUIsQ0FBQztBQU9wQyxJQUFNLGdCQUFnQixHQUF0QixNQUFNLGdCQUFpQixTQUFRLFVBQVU7SUFpQi9DLFlBQ0MsUUFBaUIsRUFDUSxRQUFrRCxFQUMzRCxhQUE2QjtRQUU3QyxLQUFLLEVBQUUsQ0FBQztRQUhrQyxhQUFRLEdBQVIsUUFBUSxDQUF5QjtRQWYzRCxpQ0FBNEIsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksT0FBTyxFQUFXLENBQUMsQ0FBQztRQUM5RSxnQ0FBMkIsR0FBbUIsSUFBSSxDQUFDLDRCQUE0QixDQUFDLEtBQUssQ0FBQztRQUU5RSx1Q0FBa0MsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFD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