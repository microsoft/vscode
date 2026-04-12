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
import { ITunnelService, TunnelProtocol, TunnelPrivacyId } from '../../../../platform/tunnel/common/tunnel.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IBrowserWorkbenchEnvironmentService } from '../../../services/environment/browser/environmentService.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { URI } from '../../../../base/common/uri.js';
import { IRemoteExplorerService } from '../../../services/remote/common/remoteExplorerService.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { forwardedPortsFeaturesEnabled } from '../../../services/remote/common/tunnelModel.js';
let TunnelFactoryContribution = class TunnelFactoryContribution extends Disposable {
    static { this.ID = 'workbench.contrib.tunnelFactory'; }
    constructor(tunnelService, environmentService, openerService, remoteExplorerService, logService, contextKeyService) {
        super();
        this.openerService = openerService;
        const tunnelFactory = environmentService.options?.tunnelProvider?.tunnelFactory;
        if (tunnelFactory) {
            // At this point we clearly want the ports view/features since we have a tunnel factory
            contextKeyService.createKey(forwardedPortsFeaturesEnabled.key, true);
            let privacyOptions = environmentService.options?.tunnelProvider?.features?.privacyOptions ?? [];
            if (environmentService.options?.tunnelProvider?.features?.public
                && (privacyOptions.length === 0)) {
                privacyOptions = [
                    {
                        id: 'private',
                        label: nls.localize('tunnelPrivacy.private', "Private"),
                        themeIcon: 'lock'
                    },
                    {
                        id: 'public',
                        label: nls.localize('tunnelPrivacy.public', "Public"),
                        themeIcon: 'eye'
                    }
                ];
            }
            this._register(tunnelService.setTunnelProvider({
                forwardPort: async (tunnelOptions, tunnelCreationOptions) => {
                    let tunnelPromise;
                    try {
                        tunnelPromise = tunnelFactory(tunnelOptions, tunnelCreationOptions);
                    }
                    catch (e) {
                        logService.trace('tunnelFactory: tunnel provider error');
                    }
                    if (!tunnelPromise) {
                        return undefined;
                    }
                    let tunnel;
                    try {
                        tunnel = await tunnelPromise;
                    }
                    catch (e) {
                        logService.trace('tunnelFactory: tunnel provider promise error');
                        if (e instanceof Error) {
                            return e.message;
                        }
                        return undefined;
                    }
                    const localAddress = tunnel.localAddress.startsWith('http') ? tunnel.localAddress : `http://${tunnel.localAddress}`;
                    const remoteTunnel = {
                        tunnelRemotePort: tunnel.remoteAddress.port,
                        tunnelRemoteHost: tunnel.remoteAddress.host,
                        // The tunnel factory may give us an inaccessible local address.
                        // To make sure this doesn't happen, resolve the uri immediately.
                        localAddress: await this.resolveExternalUri(localAddress),
                        privacy: tunnel.privacy ?? (tunnel.public ? TunnelPrivacyId.Public : TunnelPrivacyId.Private),
                        protocol: tunnel.protocol ?? TunnelProtocol.Http,
                        dispose: async () => { await tunnel.dispose(); }
                    };
                    return remoteTunnel;
                }
            }));
            const tunnelInformation = environmentService.options?.tunnelProvider?.features ?
                {
                    features: {
                        elevation: !!environmentService.options?.tunnelProvider?.features?.elevation,
                        public: !!environmentService.options?.tunnelProvider?.features?.public,
                        privacyOptions,
                        protocol: environmentService.options?.tunnelProvider?.features?.protocol === undefined ? true : !!environmentService.options?.tunnelProvider?.features?.protocol
                    }
                } : undefined;
            remoteExplorerService.setTunnelInformation(tunnelInformation);
        }
    }
    async resolveExternalUri(uri) {
        try {
            return (await this.openerService.resolveExternalUri(URI.parse(uri))).resolved.toString();
        }
        catch {
            return uri;
        }
    }
};
TunnelFactoryContribution = __decorate([
    __param(0, ITunnelService),
    __param(1, IBrowserWorkbenchEnvironmentService),
    __param(2, IOpenerService),
    __param(3, IRemoteExplorerService),
    __param(4, ILogService),
    __param(5, IContextKeyService)
], TunnelFactoryContribution);
export { TunnelFactoryContribution };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHVubmVsRmFjdG9yeS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3JlbW90ZS9icm93c2VyL3R1bm5lbEZhY3RvcnkudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQkFBb0IsQ0FBQztBQUMxQyxPQUFPLEVBQUUsY0FBYyxFQUErRCxjQUFjLEVBQUUsZUFBZSxFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDNUssT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBRWxFLE9BQU8sRUFBRSxtQ0FBbUMsRUFBRSxNQUFNLDZEQUE2RCxDQUFDO0FBQ2xILE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUM5RSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDckQsT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0sMERBQTBELENBQUM7QUFDbEcsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQzFGLE9BQU8sRUFBRSw2QkFBNkIsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBRXhGLElBQU0seUJBQXlCLEdBQS9CLE1BQU0seUJBQTBCLFNBQVEsVUFBVTthQUV4QyxPQUFFLEdBQUcsaUNBQWlDLEFBQXBDLENBQXFDO0lBRXZELFlBQ2lCLGFBQTZCLEVBQ1Isa0JBQXVELEVBQ3BFLGFBQTZCLEVBQzdCLHFCQUE2QyxFQUN4RCxVQUF1QixFQUNoQixpQkFBcUM7UUFFekQsS0FBSyxFQUFFLENBQUM7UUFMZ0Isa0JBQWEsR0FBYixhQUFhLENBQWdCO1FBTXJELE1BQU0sYUFBYSxHQUFHLGtCQUFrQixD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