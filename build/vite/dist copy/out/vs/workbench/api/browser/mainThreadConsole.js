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
import { MainContext } from '../common/extHost.protocol.js';
import { IEnvironmentService } from '../../../platform/environment/common/environment.js';
import { log } from '../../../base/common/console.js';
import { logRemoteEntry, logRemoteEntryIfError } from '../../services/extensions/common/remoteConsoleUtil.js';
import { parseExtensionDevOptions } from '../../services/extensions/common/extensionDevOptions.js';
import { ILogService } from '../../../platform/log/common/log.js';
let MainThreadConsole = class MainThreadConsole {
    constructor(_extHostContext, _environmentService, _logService) {
        this._environmentService = _environmentService;
        this._logService = _logService;
        const devOpts = parseExtensionDevOptions(this._environmentService);
        this._isExtensionDevTestFromCli = devOpts.isExtensionDevTestFromCli;
    }
    dispose() {
        //
    }
    $logExtensionHostMessage(entry) {
        if (this._isExtensionDevTestFromCli) {
            // If running tests from cli, log to the log service everything
            logRemoteEntry(this._logService, entry);
        }
        else {
            // Log to the log service only errors and log everything to local console
            logRemoteEntryIfError(this._logService, entry, 'Extension Host');
            log(entry, 'Extension Host');
        }
    }
};
MainThreadConsole = __decorate([
    extHostNamedCustomer(MainContext.MainThreadConsole),
    __param(1, IEnvironmentService),
    __param(2, ILogService)
], MainThreadConsole);
export { MainThreadConsole };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpblRocmVhZENvbnNvbGUuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvYXBpL2Jyb3dzZXIvbWFpblRocmVhZENvbnNvbGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLG9CQUFvQixFQUFtQixNQUFNLHNEQUFzRCxDQUFDO0FBQzdHLE9BQU8sRUFBRSxXQUFXLEVBQTBCLE1BQU0sK0JBQStCLENBQUM7QUFDcEYsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0scURBQXFELENBQUM7QUFDMUYsT0FBTyxFQUFxQixHQUFHLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUN6RSxPQUFPLEVBQUUsY0FBYyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDOUcsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0seURBQXlELENBQUM7QUFDbkcsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBRzNELElBQU0saUJBQWlCLEdBQXZCLE1BQU0saUJBQWlCO0lBSTdCLFlBQ0MsZUFBZ0MsRUFDTSxtQkFBd0MsRUFDaEQsV0FBd0I7UUFEaEIsd0JBQW1CLEdBQW5CLG1CQUFtQixDQUFxQjtRQUNoRCxnQkFBVyxHQUFYLFdBQVcsQ0FBYTtRQUV0RCxNQUFNLE9BQU8sR0FBRyx3QkFBd0IsQ0FBQyxJQUFJLENBQUMsbUJBQW1CLENBQUMsQ0FBQztRQUNuRSxJQUFJLENBQUMsMEJBQTBCLEdBQUcsT0FBTyxDQUFDLHlCQUF5QixDQUFDO0lBQ3JFLENBQUM7SUFFRCxPQUFPO1FBQ04sRUFBRTtJQUNILENBQUM7SUFFRCx3QkFBd0IsQ0FBQyxLQUF3QjtRQUNoRCxJQUFJLElBQUksQ0FBQywwQkFBMEIsRUFBRSxDQUFDO1lBQ3JDLCtEQUErRDtZQUMvRCxjQUFjLENBQUMsSUFBSSxDQUFDLFdBQVcsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUN6QyxDQUFDO2FBQU0sQ0FBQztZQUNQLHlFQUF5RTtZQUN6RSxxQkFBcUIsQ0FBQyxJQUFJLENBQUMsV0FBVyxFQUFFLEtBQUssRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDO1lBQ2pFLEdBQUcsQ0FBQyxLQUFLLEVBQUUsZ0JBQWdCLENBQUMsQ0FBQztRQUM5QixDQUFDO0lBQ0YsQ0FBQztDQUNELENBQUE7QUEzQlksaUJBQWlCO0lBRDdCLG9CQUFvQixDQUFDLFdBQVcsQ0FBQyxpQkFBaUIsQ0FBQztJQU9qRCxXQUFBLG1CQUFtQixDQUFBO0lBQ25CLFdBQUEsV0FBVyxDQUFBO0dBUEQsaUJBQWlCLENBMkI3QiJ9