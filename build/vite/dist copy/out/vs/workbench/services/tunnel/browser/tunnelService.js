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
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { AbstractTunnelService, ITunnelService, isTunnelProvider } from '../../../../platform/tunnel/common/tunnel.js';
import { IWorkbenchEnvironmentService } from '../../environment/common/environmentService.js';
let TunnelService = class TunnelService extends AbstractTunnelService {
    constructor(logService, environmentService, configurationService) {
        super(logService, configurationService);
        this.environmentService = environmentService;
    }
    isPortPrivileged(_port) {
        return false;
    }
    retainOrCreateTunnel(tunnelProvider, remoteHost, remotePort, _localHost, localPort, elevateIfNeeded, privacy, protocol) {
        const existing = this.getTunnelFromMap(remoteHost, remotePort);
        if (existing) {
            ++existing.refcount;
            return existing.value;
        }
        if (isTunnelProvider(tunnelProvider)) {
            return this.createWithProvider(tunnelProvider, remoteHost, remotePort, localPort, elevateIfNeeded, privacy, protocol);
        }
        return undefined;
    }
    canTunnel(uri) {
        return super.canTunnel(uri) && !!this.environmentService.remoteAuthority;
    }
};
TunnelService = __decorate([
    __param(0, ILogService),
    __param(1, IWorkbenchEnvironmentService),
    __param(2, IConfigurationService)
], TunnelService);
export { TunnelService };
registerSingleton(ITunnelService, TunnelService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHVubmVsU2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy90dW5uZWwvYnJvd3Nlci90dW5uZWxTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBR2hHLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBcUIsaUJBQWlCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUMvRyxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFFckUsT0FBTyxFQUFFLHFCQUFxQixFQUFtQixjQUFjLEVBQWdCLGdCQUFnQixFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDdEosT0FBTyxFQUFFLDRCQUE0QixFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFFdkYsSUFBTSxhQUFhLEdBQW5CLE1BQU0sYUFBYyxTQUFRLHFCQUFxQjtJQUN2RCxZQUNjLFVBQXVCLEVBQ0Usa0JBQWdELEVBQy9ELG9CQUEyQztRQUVsRSxLQUFLLENBQUMsVUFBVSxFQUFFLG9CQUFvQixDQUFDLENBQUM7UUFIRix1QkFBa0IsR0FBbEIsa0JBQWtCLENBQThCO0lBSXZGLENBQUM7SUFFTSxnQkFBZ0IsQ0FBQyxLQUFhO1FBQ3BDLE9BQU8sS0FBSyxDQUFDO0lBQ2QsQ0FBQztJQUVTLG9CQUFvQixDQUFDLGNBQWtELEVBQUUsVUFBa0IsRUFBRSxVQUFrQixFQUFFLFVBQWtCLEVBQUUsU0FBNkIsRUFBRSxlQUF3QixFQUFFLE9BQWdCLEVBQUUsUUFBaUI7UUFDMU8sTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLGdCQUFnQixDQUFDLFVBQVUsRUFBRSxVQUFVLENBQUMsQ0FBQztRQUMvRCxJQUFJLFFBQVEsRUFBRSxDQUFDO1lBQ2QsRUFBRSxRQUFRLENBQUMsUUFBUSxDQUFDO1lBQ3BCLE9BQU8sUUFBUSxDQUFDLEtBQUssQ0FBQztRQUN2QixDQUFDO1FBRUQsSUFBSSxnQkFBZ0IsQ0FBQyxjQUFjLENBQUMsRUFBRSxDQUFDO1lBQ3RDLE9BQU8sSUFBSSxDQUFDLGtCQUFrQixDQUFDLGNBQWMsRUFBRSxVQUFVLEVBQUUsVUFBVSxFQUFFLFNBQVMsRUFBRSxlQUFlLEVBQUUsT0FBTyxFQUFFLFFBQVEsQ0FBQyxDQUFDO1FBQ3ZILENBQUM7UUFDRCxPQUFPLFNBQVMsQ0FBQztJQUNsQixDQUFDO0lBRVEsU0FBUyxDQUFDLEdBQVE7UUFDMUIsT0FBTyxLQUFLLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMsa0JBQWtCLENBQUMsZUFBZSxDQUFDO0lBQzFFLENBQUM7Q0FDRCxDQUFBO0FBN0JZLGFBQWE7SUFFdkIsV0FBQSxXQUFXLENBQUE7SUFDWCxXQUFBLDRCQUE0QixDQUFBO0lBQzVCLFdBQUEscUJBQXFCLENBQUE7R0FKWCxhQUFhLENBNkJ6Qjs7QUFFRCxpQkFBaUIsQ0FBQyxjQUFjLEVBQUUsYUFBYSxvQ0FBNEIsQ0FBQyJ9