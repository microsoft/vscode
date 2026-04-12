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
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ILoggerService } from '../../../../platform/log/common/log.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { OneDataSystemWebAppender } from '../../../../platform/telemetry/browser/1dsAppender.js';
import { ITelemetryService, TELEMETRY_SETTING_ID } from '../../../../platform/telemetry/common/telemetry.js';
import { TelemetryLogAppender } from '../../../../platform/telemetry/common/telemetryLogAppender.js';
import { TelemetryService as BaseTelemetryService } from '../../../../platform/telemetry/common/telemetryService.js';
import { getTelemetryLevel, isInternalTelemetry, isLoggingOnly, NullTelemetryService, supportsTelemetry } from '../../../../platform/telemetry/common/telemetryUtils.js';
import { IBrowserWorkbenchEnvironmentService } from '../../environment/browser/environmentService.js';
import { IRemoteAgentService } from '../../remote/common/remoteAgentService.js';
import { IMeteredConnectionService } from '../../../../platform/meteredConnection/common/meteredConnection.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { resolveWorkbenchCommonProperties } from './workbenchCommonProperties.js';
import { experimentsEnabled } from '../common/workbenchTelemetryUtils.js';
import { IRequestService, NO_FETCH_TELEMETRY } from '../../../../platform/request/common/request.js';
let TelemetryService = class TelemetryService extends Disposable {
    get sessionId() { return this.impl.sessionId; }
    get machineId() { return this.impl.machineId; }
    get sqmId() { return this.impl.sqmId; }
    get devDeviceId() { return this.impl.devDeviceId; }
    get firstSessionDate() { return this.impl.firstSessionDate; }
    get msftInternal() { return this.impl.msftInternal; }
    constructor(environmentService, loggerService, configurationService, storageService, productService, remoteAgentService, meteredConnectionService, requestService) {
        super();
        this.impl = NullTelemetryService;
        this.sendErrorTelemetry = true;
        this.impl = this.initializeService(environmentService, loggerService, configurationService, storageService, productService, remoteAgentService, meteredConnectionService);
        // When the level changes it could change from off to on and we want to make sure telemetry is properly intialized
        this._register(configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration(TELEMETRY_SETTING_ID)) {
                this.impl = this.initializeService(environmentService, loggerService, configurationService, storageService, productService, remoteAgentService, meteredConnectionService);
            }
        }));
        this._register(requestService.onDidCompleteRequest(e => {
            if (e.callSite === NO_FETCH_TELEMETRY || productService.quality === 'stable') {
                return;
            }
            this.publicLog2('fetchCall', {
                callSite: e.callSite,
                latency: e.latency,
                statusCode: e.statusCode,
            });
        }));
    }
    /**
     * Initializes the telemetry service to be a full fledged service.
     * This is only done once and only when telemetry is enabled as this will also ping the endpoint to
     * ensure its not adblocked and we can send telemetry
     */
    initializeService(environmentService, loggerService, configurationService, storageService, productService, remoteAgentService, meteredConnectionService) {
        const telemetrySupported = supportsTelemetry(productService, environmentService) && productService.aiConfig?.ariaKey;
        if (telemetrySupported && getTelemetryLevel(configurationService) !== 0 /* TelemetryLevel.NONE */ && this.impl === NullTelemetryService) {
            // If remote server is present send telemetry through that, else use the client side appender
            const appenders = [];
            const isInternal = isInternalTelemetry(productService, configurationService);
            if (!isLoggingOnly(productService, environmentService)) {
                if (remoteAgentService.getConnection() !== null) {
                    const remoteTelemetryProvider = {
                        log: remoteAgentService.logTelemetry.bind(remoteAgentService),
                        flush: remoteAgentService.flushTelemetry.bind(remoteAgentService)
                    };
                    appenders.push(remoteTelemetryProvider);
                }
                else {
                    appenders.push(new OneDataSystemWebAppender(isInternal, 'monacoworkbench', null, productService.aiConfig?.ariaKey));
                }
            }
            appenders.push(new TelemetryLogAppender('', false, loggerService, environmentService, productService));
            const config = {
                appenders,
                commonProperties: resolveWorkbenchCommonProperties(storageService, productService, isInternal, environmentService.remoteAuthority, environmentService.options && environmentService.options.resolveCommonTelemetryProperties),
                // Use the web origin as a cleanup pattern (analogous to appRoot on desktop).
                // This strips the origin from web URLs in stack traces so the useful
                // relative path (e.g. /static/build/bundle.js:1:200953) is preserved
                // for debugging, while the origin itself is removed.
                piiPaths: [mainWindow.location.origin],
                sendErrorTelemetry: this.sendErrorTelemetry,
                waitForExperimentProperties: experimentsEnabled(configurationService, productService, environmentService),
                meteredConnectionService,
            };
            return this._register(new BaseTelemetryService(config, configurationService, productService));
        }
        return this.impl;
    }
    setExperimentProperty(name, value) {
        return this.impl.setExperimentProperty(name, value);
    }
    setCommonProperty(name, value) {
        this.impl.setCommonProperty(name, value);
    }
    get telemetryLevel() {
        return this.impl.telemetryLevel;
    }
    publicLog(eventName, data) {
        this.impl.publicLog(eventName, data);
    }
    publicLog2(eventName, data) {
        this.publicLog(eventName, data);
    }
    publicLogError(errorEventName, data) {
        this.impl.publicLog(errorEventName, data);
    }
    publicLogError2(eventName, data) {
        this.publicLogError(eventName, data);
    }
};
TelemetryService = __decorate([
    __param(0, IBrowserWorkbenchEnvironmentService),
    __param(1, ILoggerService),
    __param(2, IConfigurationService),
    __param(3, IStorageService),
    __param(4, IProductService),
    __param(5, IRemoteAgentService),
    __param(6, IMeteredConnectionService),
    __param(7, IRequestService)
], TelemetryService);
export { TelemetryService };
registerSingleton(ITelemetryService, TelemetryService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVsZW1ldHJ5U2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy90ZWxlbWV0cnkvYnJvd3Nlci90ZWxlbWV0cnlTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEVBQXFCLGlCQUFpQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFDL0csT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ3hFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUN4RixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDakYsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sdURBQXVELENBQUM7QUFFakcsT0FBTyxFQUFrQixpQkFBaUIsRUFBa0Isb0JBQW9CLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUM3SSxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUNyRyxPQUFPLEVBQTJCLGdCQUFnQixJQUFJLG9CQUFvQixFQUFFLE1BQU0sMkRBQTJELENBQUM7QUFDOUksT0FBTyxFQUFFLGlCQUFpQixFQUFFLG1CQUFtQixFQUFFLGFBQWEsRUFBc0Isb0JBQW9CLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUM3TCxPQUFPLEVBQUUsbUNBQW1DLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUN0RyxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUNoRixPQUFPLEVBQUUseUJBQXlCLEVBQUUsTUFB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