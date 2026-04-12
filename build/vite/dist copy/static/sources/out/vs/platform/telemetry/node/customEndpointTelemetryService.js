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
import { FileAccess } from '../../../base/common/network.js';
import { Client as TelemetryClient } from '../../../base/parts/ipc/node/ipc.cp.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { IEnvironmentService } from '../../environment/common/environment.js';
import { ILoggerService } from '../../log/common/log.js';
import { IProductService } from '../../product/common/productService.js';
import { ITelemetryService } from '../common/telemetry.js';
import { TelemetryAppenderClient } from '../common/telemetryIpc.js';
import { TelemetryLogAppender } from '../common/telemetryLogAppender.js';
import { TelemetryService } from '../common/telemetryService.js';
let CustomEndpointTelemetryService = class CustomEndpointTelemetryService {
    constructor(configurationService, telemetryService, loggerService, environmentService, productService) {
        this.configurationService = configurationService;
        this.telemetryService = telemetryService;
        this.loggerService = loggerService;
        this.environmentService = environmentService;
        this.productService = productService;
        this.customTelemetryServices = new Map();
    }
    getCustomTelemetryService(endpoint) {
        if (!this.customTelemetryServices.has(endpoint.id)) {
            const telemetryInfo = Object.create(null);
            telemetryInfo['common.vscodemachineid'] = this.telemetryService.machineId;
            telemetryInfo['common.vscodesessionid'] = this.telemetryService.sessionId;
            const args = [endpoint.id, JSON.stringify(telemetryInfo), endpoint.aiKey];
            const client = new TelemetryClient(FileAccess.asFileUri('bootstrap-fork').fsPath, {
                serverName: 'Debug Telemetry',
                timeout: 1000 * 60 * 5,
                args,
                env: {
                    ELECTRON_RUN_AS_NODE: 1,
                    VSCODE_PIPE_LOGGING: 'true',
                    VSCODE_ESM_ENTRYPOINT: 'vs/workbench/contrib/debug/node/telemetryApp'
                }
            });
            const channel = client.getChannel('telemetryAppender');
            const appenders = [
                new TelemetryAppenderClient(channel),
                new TelemetryLogAppender(`[${endpoint.id}] `, false, this.loggerService, this.environmentService, this.productService),
            ];
            this.customTelemetryServices.set(endpoint.id, new TelemetryService({
                appenders,
                sendErrorTelemetry: endpoint.sendErrorTelemetry
            }, this.configurationService, this.productService));
        }
        return this.customTelemetryServices.get(endpoint.id);
    }
    publicLog(telemetryEndpoint, eventName, data) {
        const customTelemetryService = this.getCustomTelemetryService(telemetryEndpoint);
        customTelemetryService.publicLog(eventName, data);
    }
    publicLogError(telemetryEndpoint, errorEventName, data) {
        const customTelemetryService = this.getCustomTelemetryService(telemetryEndpoint);
        customTelemetryService.publicLogError(errorEventName, data);
    }
};
CustomEndpointTelemetryService = __decorate([
    __param(0, IConfigurationService),
    __param(1, ITelemetryService),
    __param(2, ILoggerService),
    __param(3, IEnvironmentService),
    __param(4, IProductService)
], CustomEndpointTelemetryService);
export { CustomEndpointTelemetryService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY3VzdG9tRW5kcG9pbnRUZWxlbWV0cnlTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vdGVsZW1ldHJ5L25vZGUvY3VzdG9tRW5kcG9pbnRUZWxlbWV0cnlTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUM3RCxPQUFPLEVBQUUsTUFBTSxJQUFJLGVBQWUsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ25GLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ3BGLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzlFLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUN6RCxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDekUsT0FBTyxFQUF1RSxpQkFBaUIsRUFBRSxNQUFNLHdCQUF3QixDQUFDO0FBQ2hJLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLDJCQUEyQixDQUFDO0FBQ3BFLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3pFLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBRTFELElBQU0sOEJBQThCLEdBQXBDLE1BQU0sOEJBQThCO0lBSzFDLFlBQ3dCLG9CQUE0RCxFQUNoRSxnQkFBb0QsRUFDdkQsYUFBOEMsRUFDekMsa0JBQXdELEVBQzVELGNBQWdEO1FBSnpCLHlCQUFvQixHQUFwQixvQkFBb0IsQ0FBdUI7UUFDL0MscUJBQWdCLEdBQWhCLGdCQUFnQixDQUFtQjtRQUN0QyxrQkFBYSxHQUFiLGFBQWEsQ0FBZ0I7UUFDeEIsdUJBQWtCLEdBQWxC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