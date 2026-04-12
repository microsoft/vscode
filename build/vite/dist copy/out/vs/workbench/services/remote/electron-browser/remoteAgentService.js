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
import * as nls from '../../../../nls.js';
import { IRemoteAgentService } from '../common/remoteAgentService.js';
import { IRemoteAuthorityResolverService, RemoteAuthorityResolverError } from '../../../../platform/remote/common/remoteAuthorityResolver.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { AbstractRemoteAgentService } from '../common/abstractRemoteAgentService.js';
import { ISignService } from '../../../../platform/sign/common/sign.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IWorkbenchEnvironmentService } from '../../environment/common/environmentService.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { URI } from '../../../../base/common/uri.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IUserDataProfileService } from '../../userDataProfile/common/userDataProfile.js';
import { IRemoteSocketFactoryService } from '../../../../platform/remote/common/remoteSocketFactoryService.js';
let RemoteAgentService = class RemoteAgentService extends AbstractRemoteAgentService {
    constructor(remoteSocketFactoryService, userDataProfileService, environmentService, productService, remoteAuthorityResolverService, signService, logService) {
        super(remoteSocketFactoryService, userDataProfileService, environmentService, productService, remoteAuthorityResolverService, signService, logService);
    }
};
RemoteAgentService = __decorate([
    __param(0, IRemoteSocketFactoryService),
    __param(1, IUserDataProfileService),
    __param(2, IWorkbenchEnvironmentService),
    __param(3, IProductService),
    __param(4, IRemoteAuthorityResolverService),
    __param(5, ISignService),
    __param(6, ILogService)
], RemoteAgentService);
export { RemoteAgentService };
let RemoteConnectionFailureNotificationContribution = class RemoteConnectionFailureNotificationContribution {
    static { this.ID = 'workbench.contrib.nativeRemoteConnectionFailureNotification'; }
    constructor(_remoteAgentService, notificationService, environmentService, telemetryService, nativeHostService, _remoteAuthorityResolverService, openerService) {
        this._remoteAgentService = _remoteAgentService;
        this._remoteAuthorityResolverService = _remoteAuthorityResolverService;
        // Let's cover the case where connecting to fetch the remote extension info fails
        this._remoteAgentService.getRawEnvironment()
            .then(undefined, err => {
            if (!RemoteAuthorityResolverError.isHandled(err)) {
                const choices = [
                    {
                        label: nls.localize('devTools', "Open Developer Tools"),
                        run: () => nativeHostService.openDevTools()
                    }
                ];
                const troubleshootingURL = this._getTroubleshootingURL();
                if (troubleshootingURL) {
                    choices.push({
                        label: nls.localize('directUrl', "Open in browser"),
                        run: () => openerService.open(troubleshootingURL, { openExternal: true })
                    });
                }
                notificationService.prompt(Severity.Error, nls.localize('connectionError', "Failed to connect to the remote extension host server (Error: {0})", err ? err.message : ''), choices);
            }
        });
    }
    _getTroubleshootingURL() {
        const remoteAgentConnection = this._remoteAgentService.getConnection();
        if (!remoteAgentConnection) {
            return null;
        }
        const connectionData = this._remoteAuthorityResolverService.getConnectionData(remoteAgentConnection.remoteAuthority);
        if (!connectionData || connectionData.connectTo.type !== 0 /* RemoteConnectionType.WebSocket */) {
            return null;
        }
        return URI.from({
            scheme: 'http',
            authority: `${connectionData.connectTo.host}:${connectionData.connectTo.port}`,
            path: `/version`
        });
    }
};
RemoteConnectionFailureNotificationContribution = __decorate([
    __param(0, IRemoteAgentService),
    __param(1, INotificationService),
    __param(2, IWorkbenchEnvironmentService),
    __param(3, ITelemetryService),
    __param(4, INativeHostService),
    __param(5, IRemoteAuthorityResolverService),
    __param(6, IOpenerService)
], RemoteConnectionFailureNotificationContribution);
registerWorkbenchContribution2(RemoteConnectionFailureNotificationContribution.ID, RemoteConnectionFailureNotificationContribution, 2 /* WorkbenchPhase.BlockRestore */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVtb3RlQWdlbnRTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL3JlbW90ZS9lbGVjdHJvbi1icm93c2VyL3JlbW90ZUFnZW50U2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEtBQUssR0FBRyxNQUFNLG9CQUFvQixDQUFDO0FBQzFDLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQ3RFLE9BQU8sRUFBRSwrQkFBK0IsRUFBd0IsNEJBQTRCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUNwSyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDeEYsT0FBTyxFQUFFLDBCQUEwQixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDckYsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ3hFLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNyRSxPQUFPLEVBQUUsNEJBQTRCLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUM5RixPQUFPLEVBQUUsb0JBQW9CLEVBQWlCLFFBQVEsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBQ3pILE9BQU8sRUFBMEMsOEJBQThCLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUMxSCxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUN2RixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUNsRixPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDckQsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQzlFLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLGlE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