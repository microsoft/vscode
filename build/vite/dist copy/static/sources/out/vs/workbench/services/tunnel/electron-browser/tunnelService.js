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
import { ILogService } from '../../../../platform/log/common/log.js';
import { IWorkbenchEnvironmentService } from '../../environment/common/environmentService.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ITunnelService, AbstractTunnelService, TunnelPrivacyId, isPortPrivileged, isTunnelProvider } from '../../../../platform/tunnel/common/tunnel.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ISharedProcessTunnelService } from '../../../../platform/remote/common/sharedProcessTunnelService.js';
import { ILifecycleService } from '../../lifecycle/common/lifecycle.js';
import { IRemoteAuthorityResolverService } from '../../../../platform/remote/common/remoteAuthorityResolver.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { INativeWorkbenchEnvironmentService } from '../../environment/electron-browser/environmentService.js';
import { OS } from '../../../../base/common/platform.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
let SharedProcessTunnel = class SharedProcessTunnel extends Disposable {
    constructor(_id, _addressProvider, tunnelRemoteHost, tunnelRemotePort, tunnelLocalPort, localAddress, _onBeforeDispose, _sharedProcessTunnelService, _remoteAuthorityResolverService) {
        super();
        this._id = _id;
        this._addressProvider = _addressProvider;
        this.tunnelRemoteHost = tunnelRemoteHost;
        this.tunnelRemotePort = tunnelRemotePort;
        this.tunnelLocalPort = tunnelLocalPort;
        this.localAddress = localAddress;
        this._onBeforeDispose = _onBeforeDispose;
        this._sharedProcessTunnelService = _sharedProcessTunnelService;
        this._remoteAuthorityResolverService = _remoteAuthorityResolverService;
        this.privacy = TunnelPrivacyId.Private;
        this.protocol = undefined;
        this._updateAddress();
        this._register(this._remoteAuthorityResolverService.onDidChangeConnectionData(() => this._updateAddress()));
    }
    _updateAddress() {
        this._addressProvider.getAddress().then((address) => {
            this._sharedProcessTunnelService.setAddress(this._id, address);
        });
    }
    async dispose() {
        this._onBeforeDispose();
        super.dispose();
        await this._sharedProcessTunnelService.destroyTunnel(this._id);
    }
};
SharedProcessTunnel = __decorate([
    __param(7, ISharedProcessTunnelService),
    __param(8, IRemoteAuthorityResolverService)
], SharedProcessTunnel);
let TunnelService = class TunnelService extends AbstractTunnelService {
    constructor(logService, _environmentService, _sharedProcessTunnelService, _instantiationService, lifecycleService, _nativeWorkbenchEnvironmentService, configurationService) {
        super(logService, configurationService);
        this._environmentService = _environmentService;
        this._sharedProcessTunnelService = _sharedProcessTunnelService;
        this._instantiationService = _instantiationService;
        this._nativeWorkbenchEnvironmentService = _nativeWorkbenchEnvironmentService;
        this._activeSharedProcessTunnels = new Set();
        // Destroy any shared process tunnels that might still be active
        this._register(lifecycleService.onDidShutdown(() => {
            this._activeSharedProcessTunnels.forEach((id) => {
                this._sharedProcessTunnelService.destroyTunnel(id);
            });
        }));
    }
    isPortPrivileged(port) {
        return isPortPrivileged(port, this.defaultTunnelHost, OS, this._nativeWorkbenchEnvironmentService.os.release);
    }
    retainOrCreateTunnel(addressOrTunnelProvider, remoteHost, remotePort, localHost, localPort, elevateIfNeeded, privacy, protocol) {
        const existing = this.getTunnelFromMap(remoteHost, remotePort);
        if (existing) {
            ++existing.refcount;
            return existing.value;
        }
        if (isTunnelProvider(addressOrTunnelProvider)) {
            return this.createWithProvider(addressOrTunnelProvider, remoteHost, remotePort, localPort, elevateIfNeeded, privacy, protocol);
        }
        else {
            this.logService.trace(`ForwardedPorts: (TunnelService) Creating tunnel without provider ${remoteHost}:${remotePort} on local port ${localPort}.`);
            const tunnel = this._createSharedProcessTunnel(addressOrTunnelProvider, remoteHost, remotePort, localHost, localPort, elevateIfNeeded);
            this.logService.trace('ForwardedPorts: (TunnelService) Tunnel created without provider.');
            this.addTunnelToMap(remoteHost, remotePort, tunnel);
            return tunnel;
        }
    }
    async _createSharedProcessTunnel(addressProvider, tunnelRemoteHost, tunnelRemotePort, tunnelLocalHost, tunnelLocalPort, elevateIfNeeded) {
        const { id } = await this._sharedProcessTunnelService.createTunnel();
        this._activeSharedProcessTunnels.add(id);
        const authority = this._environmentService.remoteAuthority;
        const result = await this._sharedProcessTunnelService.startTunnel(authority, id, tunnelRemoteHost, tunnelRemotePort, tunnelLocalHost, tunnelLocalPort, elevateIfNeeded);
        const tunnel = this._instantiationService.createInstance(SharedProcessTunnel, id, addressProvider, tunnelRemoteHost, tunnelRemotePort, result.tunnelLocalPort, result.localAddress, () => {
            this._activeSharedProcessTunnels.delete(id);
        });
        return tunnel;
    }
    canTunnel(uri) {
        return super.canTunnel(uri) && !!this._environmentService.remoteAuthority;
    }
};
TunnelService = __decorate([
    __param(0, ILogService),
    __param(1, IWorkbenchEnvironmentService),
    __param(2, ISharedProcessTunnelService),
    __param(3, IInstantiationService),
    __param(4, ILifecycleService),
    __param(5, INativeWorkbenchEnvironmentService),
    __param(6, IConfigurationService)
], TunnelService);
export { TunnelService };
registerSingleton(ITunnelService, TunnelService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHVubmVsU2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy90dW5uZWwvZWxlY3Ryb24tYnJvd3Nlci90dW5uZWxTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNyRSxPQUFPLEVBQUUsNEJBQTRCLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUU5RixPQUFPLEVBQXFCLGlCQUFpQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFDL0csT0FBTyxFQUFFLGNBQWMsRUFBRSxxQkFBcUIsRUFBZ0IsZUFBZSxFQUFFLGdCQUFnQixFQUFtQixnQkFBZ0IsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQ3pMLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUVsRSxPQUFPLEVBQUUsMkJBQTJCLEVBQUUsTUFBTSxrRUFBa0UsQ0FBQztBQUMvRyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUN4RSxPQUFPLEVBQUUsK0JBQStCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUNoSCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEVBQUUsa0NBQWtDLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUM5RyxPQUFPLEVBQUUsRUFBRSxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDekQsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFFbkcsSUFBTSxtQkFBbUIsR0FBekIsTUFBTSxtQkFBb0IsU0FBUSxVQUFVO0lBSzNDLFlBQ2tCLEdBQVcsRUFDWCxnQkFBa0MsRUFDbkMsZ0JBQXdCLEVBQ3hCLGdCQUF3QixF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