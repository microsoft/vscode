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
import { extHostNamedCustomer } from '../../services/extensions/common/extHostCustomers.js';
import { ILoggerService, ILogService, isLogLevel, log, LogLevelToString, parseLogLevel } from '../../../platform/log/common/log.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { ExtHostContext, MainContext } from '../common/extHost.protocol.js';
import { URI } from '../../../base/common/uri.js';
import { CommandsRegistry } from '../../../platform/commands/common/commands.js';
import { IEnvironmentService } from '../../../platform/environment/common/environment.js';
let MainThreadLoggerService = class MainThreadLoggerService {
    constructor(extHostContext, loggerService) {
        this.loggerService = loggerService;
        this.disposables = new DisposableStore();
        const proxy = extHostContext.getProxy(ExtHostContext.ExtHostLogLevelServiceShape);
        this.disposables.add(loggerService.onDidChangeLogLevel(arg => {
            if (isLogLevel(arg)) {
                proxy.$setLogLevel(arg);
            }
            else {
                proxy.$setLogLevel(arg[1], arg[0]);
            }
        }));
    }
    $log(file, messages) {
        const logger = this.loggerService.getLogger(URI.revive(file));
        if (!logger) {
            throw new Error('Create the logger before logging');
        }
        for (const [level, message] of messages) {
            log(logger, level, message);
        }
    }
    async $createLogger(file, options) {
        this.loggerService.createLogger(URI.revive(file), options);
    }
    async $registerLogger(logResource) {
        this.loggerService.registerLogger({
            ...logResource,
            resource: URI.revive(logResource.resource)
        });
    }
    async $deregisterLogger(resource) {
        this.loggerService.deregisterLogger(URI.revive(resource));
    }
    async $setVisibility(resource, visible) {
        this.loggerService.setVisibility(URI.revive(resource), visible);
    }
    $flush(file) {
        const logger = this.loggerService.getLogger(URI.revive(file));
        if (!logger) {
            throw new Error('Create the logger before flushing');
        }
        logger.flush();
    }
    dispose() {
        this.disposables.dispose();
    }
};
MainThreadLoggerService = __decorate([
    extHostNamedCustomer(MainContext.MainThreadLogger),
    __param(1, ILoggerService)
], MainThreadLoggerService);
export { MainThreadLoggerService };
// --- Internal commands to improve extension test runs
CommandsRegistry.registerCommand('_extensionTests.setLogLevel', function (accessor, level) {
    const loggerService = accessor.get(ILoggerService);
    const environmentService = accessor.get(IEnvironmentService);
    if (environmentService.isExtensionDevelopment && !!environmentService.extensionTestsLocationURI) {
        const logLevel = parseLogLevel(level);
        if (logLevel !== undefined) {
            loggerService.setLogLevel(logLevel);
        }
    }
});
CommandsRegistry.registerCommand('_extensionTests.getLogLevel', function (accessor) {
    const logService = accessor.get(ILogService);
    return LogLevelToString(logService.getLevel());
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpblRocmVhZExvZ1NlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvYXBpL2Jyb3dzZXIvbWFpblRocmVhZExvZ1NlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLG9CQUFvQixFQUFtQixNQUFNLHNEQUFzRCxDQUFDO0FBQzdHLE9BQU8sRUFBbUMsY0FBYyxFQUFFLFdBQVcsRUFBRSxVQUFVLEVBQUUsR0FBRyxFQUFZLGdCQUFnQixFQUFFLGFBQWEsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQy9LLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUNwRSxPQUFPLEVBQUUsY0FBYyxFQUF5QixXQUFXLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUNuRyxPQUFPLEVBQWlCLEdBQUcsRUFBVSxNQUFNLDZCQUE2QixDQUFDO0FBRXpFLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQ2pGLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBR25GLElBQU0sdUJBQXVCLEdBQTdCLE1BQU0sdUJBQXVCO0lBSW5DLFlBQ0MsY0FBK0IsRUFDZixhQUE4QztRQUE3QixrQkFBYSxHQUFiLGFBQWEsQ0FBZ0I7UUFKOUMsZ0JBQVcsR0FBRyxJQUFJLGVBQWUsRUFBRSxDQUFDO1FBTXBELE1BQU0sS0FBSyxHQUFHLGNBQWMsQ0FBQyxRQUFRLENBQUMsY0FBYyxDQUFDLDJCQUEyQixDQUFDLENBQUM7UUFDbEYsSUFBSSxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsYUFBYSxDQUFDLG1CQUFtQixDQUFDLEdBQUcsQ0FBQyxFQUFFO1lBQzVELElBQUksVUFBVSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUM7Z0JBQ3JC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