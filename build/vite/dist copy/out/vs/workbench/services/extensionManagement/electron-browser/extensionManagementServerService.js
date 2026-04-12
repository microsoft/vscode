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
import { localize } from '../../../../nls.js';
import { Schemas } from '../../../../base/common/network.js';
import { IExtensionManagementServerService } from '../common/extensionManagement.js';
import { IRemoteAgentService } from '../../remote/common/remoteAgentService.js';
import { ISharedProcessService } from '../../../../platform/ipc/electron-browser/services.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { NativeRemoteExtensionManagementService } from './remoteExtensionManagementService.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { NativeExtensionManagementService } from './nativeExtensionManagementService.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
let ExtensionManagementServerService = class ExtensionManagementServerService extends Disposable {
    constructor(sharedProcessService, remoteAgentService, labelService, instantiationService) {
        super();
        this.remoteExtensionManagementServer = null;
        this.webExtensionManagementServer = null;
        const localExtensionManagementService = this._register(instantiationService.createInstance(NativeExtensionManagementService, sharedProcessService.getChannel('extensions')));
        this.localExtensionManagementServer = { extensionManagementService: localExtensionManagementService, id: 'local', label: localize('local', "Local") };
        const remoteAgentConnection = remoteAgentService.getConnection();
        if (remoteAgentConnection) {
            const extensionManagementService = instantiationService.createInstance(NativeRemoteExtensionManagementService, remoteAgentConnection.getChannel('extensions'), this.localExtensionManagementServer);
            this.remoteExtensionManagementServer = {
                id: 'remote',
                extensionManagementService,
                get label() { return labelService.getHostLabel(Schemas.vscodeRemote, remoteAgentConnection.remoteAuthority) || localize('remote', "Remote"); },
            };
        }
    }
    getExtensionManagementServer(extension) {
        if (extension.location.scheme === Schemas.file) {
            return this.localExtensionManagementServer;
        }
        if (this.remoteExtensionManagementServer && extension.location.scheme === Schemas.vscodeRemote) {
            return this.remoteExtensionManagementServer;
        }
        throw new Error(`Invalid Extension ${extension.location}`);
    }
    getExtensionInstallLocation(extension) {
        const server = this.getExtensionManagementServer(extension);
        return server === this.remoteExtensionManagementServer ? 2 /* ExtensionInstallLocation.Remote */ : 1 /* ExtensionInstallLocation.Local */;
    }
};
ExtensionManagementServerService = __decorate([
    __param(0, ISharedProcessService),
    __param(1, IRemoteAgentService),
    __param(2, ILabelService),
    __param(3, IInstantiationService)
], ExtensionManagementServerService);
export { ExtensionManagementServerService };
registerSingleton(IExtensionManagementServerService, ExtensionManagementServerService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvZXh0ZW5zaW9uTWFuYWdlbWVudC9lbGVjdHJvbi1icm93c2VyL2V4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUM5QyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDN0QsT0FBTyxFQUF3RCxpQ0FBaUMsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQzNJLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBRWhGLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQzlGLE9BQU8sRUFBcUIsaUJBQWlCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUMvRyxPQUFPLEVBQUUsc0NBQXNDLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUMvRixPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFFM0UsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbkcsT0FBTyxFQUFFLGdDQUFnQyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDekYsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBRTNELElBQU0sZ0NBQWdDLEdBQXRDLE1BQU0sZ0NBQWlDLFNBQVEsVUFBVTtJQVEvRCxZQUN3QixvQkFBMkMsRUFDN0Msa0JBQXVDLEVBQzdDLFlBQTJCLEVBQ25CLG9CQUEyQztRQUVsRSxLQUFLLEVBQUUsQ0FBQztRQVRBLG9DQUErQixHQUFzQyxJQUFJLENBQUM7UUFDMUUsaUNBQTRCLEdBQXNDLElBQUksQ0FBQztRQVMvRSxNQUFNLCtCQUErQixHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsb0JBQW9CLENBQUMsY0FBYyxDQUFDLGdDQUFnQyxFQUFFLG9CQUFvQixDQUFDLFVBQVUsQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDN0ssSUFBSSxDQUFDLDhCQUE4QixHQUFHLEVBQUUsMEJBQTBCLEVBQUUsK0JBQStCLEVBQUUsRUFBRSxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsUUFBUSxDQUFDLE9BQU8sRUFBRSxPQUFPLENBQUMsRUFBRSxDQUFDO1FBQ3RKLE1BQU0scUJBQXFCLEdBQUcsa0JBQWtCLENBQUMsYUFBYSxFQUFFLENBQUM7UUFDakUsSUFBSSxxQkFBcUIsRUFBRSxDQUFDO1lBQzNCLE1BQU0sMEJBQTBCLEdBQUcsb0JBQW9CLENBQUMsY0FBYyxDQUFDLHNDQUFzQyxFQUFFLHFCQUFxQixDQUFDLFVBQVUsQ0FBVyxZQUFZLENBQUMsRUFBRSxJQUFJLENBQUMsOEJBQThCLENBQUMsQ0FBQztZQUM5TSxJQUFJLENBQUMsK0JBQStCLEdBQUc7Z0JBQ3RDLEVBQUUsRUFBRSxRQUFRO2dCQUNaLDBCQUEwQjtnQkFDMUIsSUFBSSxLQUFLLEtBQUssT0FBTyxZQUFZLENBQUMsWUFBWSxDQUFDLE9BQU8sQ0FBQyxZQUFZLEVBQUUscUJBQXFCLENBQUMsZUFBZSxDQUFDLElBQUksUUFBUSxDQUFDLFFBQVEsRUFBRSxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUM7YUFDOUksQ0FBQztRQUNILENBQUM7SUFFRixDQUFDO0lBRUQsNEJBQTRCLENBQUMsU0FBcUI7UUFDakQsSUFBSSxTQUFTLENBQUMsUUFBUSxDQUFDLE1BQU0sS0FBSyxPQUFPLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDaEQsT0FBTyxJQUFJLENBQUMsOEJBQThCLENBQUM7UUFDNUMsQ0FBQztRQUNELElBQUksSUFBSSxDQUFDLCtCQUErQixJQUFJLFNBQVMsQ0FBQyxRQUFRLENBQUMsTUFBTSxLQUFLLE9BQU8sQ0FBQyxZQUFZLEVBQUUsQ0FBQztZQUNoRyxPQUFPLElBQUksQ0FBQywrQkFBK0IsQ0FBQztRQUM3QyxDQUFDO1FBQ0QsTUFBTSxJQUFJLEtBQUssQ0FBQyxxQkFBcUIsU0FBUyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7SUFDNUQsQ0FBQztJQUVELDJCQUEyQixDQUFDLFNBQXFCO1FBQ2hELE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyw0QkFBNEIsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUM1RCxPQUFPLE1BQU0sS0FBSyxJQUFJLENBQUMsK0JBQStCLENBQUMsQ0FBQyx5Q0FBaUMsQ0FBQyx1Q0FBK0IsQ0FBQztJQUMzSCxDQUFDO0NBQ0QsQ0FBQTtBQTNDWSxnQ0FBZ0M7SUFTMUMsV0FBQSxxQkFBcUIsQ0FBQTtJQUNyQixXQUFBLG1CQUFtQixDQUFBO0lBQ25CLFdBQUEsYUFBYSxDQUFBO0lBQ2IsV0FBQSxxQkFBcUIsQ0FBQTtHQVpYLGdDQUFnQyxDQTJDNUM7O0FBRUQsaUJBQWlCLENBQUMsaUNBQWlDLEVBQUUsZ0NBQWdDLG9DQUE0QixDQUFDIn0=