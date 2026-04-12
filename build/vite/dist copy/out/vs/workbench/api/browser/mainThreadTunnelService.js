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
import * as nls from '../../../nls.js';
import { MainContext, ExtHostContext, CandidatePortSource } from '../common/extHost.protocol.js';
import { TunnelDtoConverter } from '../common/extHostTunnelService.js';
import { extHostNamedCustomer } from '../../services/extensions/common/extHostCustomers.js';
import { IRemoteExplorerService, PORT_AUTO_FORWARD_SETTING, PORT_AUTO_SOURCE_SETTING, PORT_AUTO_SOURCE_SETTING_HYBRID, PORT_AUTO_SOURCE_SETTING_OUTPUT, PortsEnablement } from '../../services/remote/common/remoteExplorerService.js';
import { ITunnelService, TunnelProtocol } from '../../../platform/tunnel/common/tunnel.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { INotificationService, Severity } from '../../../platform/notification/common/notification.js';
import { IConfigurationService } from '../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { IRemoteAgentService } from '../../services/remote/common/remoteAgentService.js';
import { Registry } from '../../../platform/registry/common/platform.js';
import { Extensions as ConfigurationExtensions } from '../../../platform/configuration/common/configurationRegistry.js';
import { IContextKeyService } from '../../../platform/contextkey/common/contextkey.js';
import { TunnelCloseReason, TunnelSource, forwardedPortsFeaturesEnabled, makeAddress } from '../../services/remote/common/tunnelModel.js';
let MainThreadTunnelService = class MainThreadTunnelService extends Disposable {
    constructor(extHostContext, remoteExplorerService, tunnelService, notificationService, configurationService, logService, remoteAgentService, contextKeyService) {
        super();
        this.remoteExplorerService = remoteExplorerService;
        this.tunnelService = tunnelService;
        this.notificationService = notificationService;
        this.configurationService = configurationService;
        this.logService = logService;
        this.remoteAgentService = remoteAgentService;
        this.contextKeyService = contextKeyService;
        this.elevateionRetry = false;
        this.portsAttributesProviders = new Map();
        this._alreadyRegistered = false;
        this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostTunnelService);
        this._register(tunnelService.onTunnelOpened(() => this._proxy.$onDidTunnelsChange()));
        this._register(tunnelService.onTunnelClosed(() => this._proxy.$onDidTunnelsChange()));
    }
    processFindingEnabled() {
        return (!!this.configurationService.getValue(PORT_AUTO_FORWARD_SETTING) || this.tunnelService.hasTunnelProvider)
            && (this.configurationService.getValue(PORT_AUTO_SOURCE_SETTING) !== PORT_AUTO_SOURCE_SETTING_OUTPUT);
    }
    async $setRemoteTunnelService(processId) {
        this.remoteExplorerService.namedProcesses.set(processId, 'Code Extension Host');
        if (this.remoteExplorerService.portsFeaturesEnabled === PortsEnablement.AdditionalFeatures) {
            this._proxy.$registerCandidateFinder(this.processFindingEnabled());
        }
        else {
            this._register(this.remoteExplorerService.onEnabledPortsFeatures(() => this._proxy.$registerCandidateFinder(this.processFindingEnabled())));
        }
        this._register(this.configurationService.onDidChangeConfiguration(async (e) => {
            if ((this.remoteExplorerService.portsFeaturesEnabled === PortsEnablement.AdditionalFeatures) && (e.affectsConfiguration(PORT_AUTO_FORWARD_SETTING) || e.affectsConfiguration(PORT_AUTO_SOURCE_SETTING))) {
                return this._proxy.$registerCandidateFinder(this.processFindingEnabled());
            }
        }));
        this._register(this.tunnelService.onAddedTunnelProvider(async () => {
            if (this.remoteExplorerService.portsFeaturesEnabled === PortsEnablement.AdditionalFeatures) {
                return this._proxy.$registerCandidateFinder(this.processFindingEnabled());
            }
        }));
    }
    async $registerPortsAttributesProvider(selector, providerHandle) {
        this.portsAttributesProviders.set(providerHandle, selector);
        if (!this._alreadyRegistered) {
            this.remoteExplorerService.tunnelModel.addAttributesProvider(this);
            this._alreadyRegistered = true;
        }
    }
    async $unregisterPortsAttributesProvider(providerHandle) {
        this.portsAttributesProviders.delete(providerHandle);
    }
    async providePortAttributes(ports, pid, commandLine, token) {
        if (this.portsAttributesProviders.size === 0) {
            return [];
        }
        // Check all the selectors to make sure it's worth going to the extension host.
        const appropriateHandles = Array.from(this.portsAttributesProviders.entries()).filter(entry => {
            const selector = entry[1];
            const portRange = (typeof selector.portRange === 'number') ? [selector.portRange, selector.portRange + 1] : selector.portRange;
            const portInRange = portRange ? ports.some(port => portRange[0] <= port && port < portRange[1]) : true;
            const commandMatches = !selector.commandPattern || (commandLine && (commandLine.match(selector.commandPattern)));
            return portInRange && commandMatches;
        }).map(entry => entry[0]);
        if (appropriateHandles.length === 0) {
            return [];
        }
        return this._proxy.$providePortAttributes(appropriateHandles, ports, pid, commandLine, token);
    }
    async $openTunnel(tunnelOptions, source) {
        const tunnel = await this.remoteExplorerService.forward({
            remote: tunnelOptions.remoteAddress,
            local: tunnelOptions.localAddressPort,
            name: tunnelOptions.label,
            source: {
                source: TunnelSource.Extension,
                description: source
            },
            elevateIfNeeded: false
        });
        if (!tunnel || (typeof tunnel === 'string')) {
            return undefined;
        }
        if (!this.elevateionRetry
            && (tunnelOptions.localAddressPort !== undefined)
            && (tunnel.tunnelLocalPort !== undefined)
            && this.tunnelService.isPortPrivileged(tunnelOptions.localAddressPort)
            && (tunnel.tunnelLocalPort !== tunnelOptions.localAddressPort)
            && this.tunnelService.canElevate) {
            this.elevationPrompt(tunnelOptions, tunnel, source);
        }
        return TunnelDtoConverter.fromServiceTunnel(tunnel);
    }
    async elevationPrompt(tunnelOptions, tunnel, source) {
        return this.notificationService.prompt(Severity.Info, nls.localize('remote.tunnel.openTunnel', "The extension {0} has forwarded port {1}. You'll need to run as superuser to use port {2} locally.", source, tunnelOptions.remoteAddress.port, tunnelOptions.localAddressPort), [{
                label: nls.localize('remote.tunnelsView.elevationButton', "Use Port {0} as Sudo...", tunnel.tunnelRemotePort),
                run: async () => {
                    this.elevateionRetry = true;
                    await this.remoteExplorerService.close({ host: tunnel.tunnelRemoteHost, port: tunnel.tunnelRemotePort }, TunnelCloseReason.Other);
                    await this.remoteExplorerService.forward({
                        remote: tunnelOptions.remoteAddress,
                        local: tunnelOptions.localAddressPort,
                        name: tunnelOptions.label,
                        source: {
                            source: TunnelSource.Extension,
                            description: source
                        },
                        elevateIfNeeded: true
                    });
                    this.elevateionRetry = false;
                }
            }]);
    }
    async $closeTunnel(remote) {
        return this.remoteExplorerService.close(remote, TunnelCloseReason.Other);
    }
    async $getTunnels() {
        return (await this.tunnelService.tunnels).map(tunnel => {
            return {
                remoteAddress: { port: tunnel.tunnelRemotePort, host: tunnel.tunnelRemoteHost },
                localAddress: tunnel.localAddress,
                privacy: tunnel.privacy,
                protocol: tunnel.protocol
            };
        });
    }
    async $onFoundNewCandidates(candidates) {
        this.remoteExplorerService.onFoundNewCandidates(candidates);
    }
    async $setTunnelProvider(features, isResolver) {
        const tunnelProvider = {
            forwardPort: (tunnelOptions, tunnelCreationOptions) => {
                const forward = this._proxy.$forwardPort(tunnelOptions, tunnelCreationOptions);
                return forward.then(tunnelOrError => {
                    if (!tunnelOrError) {
                        return undefined;
                    }
                    else if (typeof tunnelOrError === 'string') {
                        return tunnelOrError;
                    }
                    const tunnel = tunnelOrError;
                    this.logService.trace(`ForwardedPorts: (MainThreadTunnelService) New tunnel established by tunnel provider: ${tunnel?.remoteAddress.host}:${tunnel?.remoteAddress.port}`);
                    return {
                        tunnelRemotePort: tunnel.remoteAddress.port,
                        tunnelRemoteHost: tunnel.remoteAddress.host,
                        localAddress: typeof tunnel.localAddress === 'string' ? tunnel.localAddress : makeAddress(tunnel.localAddress.host, tunnel.localAddress.port),
                        tunnelLocalPort: typeof tunnel.localAddress !== 'string' ? tunnel.localAddress.port : undefined,
                        public: tunnel.public,
                        privacy: tunnel.privacy,
                        protocol: tunnel.protocol ?? TunnelProtocol.Http,
                        dispose: async (silent) => {
                            this.logService.trace(`ForwardedPorts: (MainThreadTunnelService) Closing tunnel from tunnel provider: ${tunnel?.remoteAddress.host}:${tunnel?.remoteAddress.port}`);
                            return this._proxy.$closeTunnel({ host: tunnel.remoteAddress.host, port: tunnel.remoteAddress.port }, silent);
                        }
                    };
                });
            }
        };
        if (features) {
            this.tunnelService.setTunnelFeatures(features);
        }
        this.tunnelService.setTunnelProvider(tunnelProvider);
        // At this point we clearly want the ports view/features since we have a tunnel factory
        if (isResolver) {
            this.contextKeyService.createKey(forwardedPortsFeaturesEnabled.key, true);
        }
    }
    async $hasTunnelProvider() {
        return this.tunnelService.hasTunnelProvider;
    }
    async $setCandidateFilter() {
        this.remoteExplorerService.setCandidateFilter((candidates) => {
            return this._proxy.$applyCandidateFilter(candidates);
        });
    }
    async $setCandidatePortSource(source) {
        // Must wait for the remote environment before trying to set settings there.
        this.remoteAgentService.getEnvironment().then(() => {
            switch (source) {
                case CandidatePortSource.None: {
                    Registry.as(ConfigurationExtensions.Configuration)
                        .registerDefaultConfigurations([{ overrides: { 'remote.autoForwardPorts': false } }]);
                    break;
                }
                case CandidatePortSource.Output: {
                    Registry.as(ConfigurationExtensions.Configuration)
                        .registerDefaultConfigurations([{ overrides: { 'remote.autoForwardPortsSource': PORT_AUTO_SOURCE_SETTING_OUTPUT } }]);
                    break;
                }
                case CandidatePortSource.Hybrid: {
                    Registry.as(ConfigurationExtensions.Configuration)
                        .registerDefaultConfigurations([{ overrides: { 'remote.autoForwardPortsSource': PORT_AUTO_SOURCE_SETTING_HYBRID } }]);
                    break;
                }
                default: // Do nothing, the defaults for these settings should be used.
            }
        }).catch(() => {
            // The remote failed to get setup. Errors from that area will already be surfaced to the user.
        });
    }
};
MainThreadTunnelService = __decorate([
    extHostNamedCustomer(MainContext.MainThreadTunnelService),
    __param(1, IRemoteExplorerService),
    __param(2, ITunnelService),
    __param(3, INotificationService),
    __param(4, IConfigurationService),
    __param(5, ILogService),
    __param(6, IRemoteAgentService),
    __param(7, IContextKeyService)
], MainThreadTunnelService);
export { MainThreadTunnelService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpblRocmVhZFR1bm5lbFNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvYXBpL2Jyb3dzZXIvbWFpblRocmVhZFR1bm5lbFNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxpQkFBaUIsQ0FBQztBQUN2QyxPQUFPLEVBQWdDLFdBQVcsRUFBRSxjQUFjLEVBQTZCLG1CQUFtQixFQUFxQyxNQUFNLCtCQUErQixDQUFDO0FBQzdMLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3ZFLE9BQU8sRUFBRSxvQkFBb0IsRUFBbUIsTUFBTSxzREFBc0QsQ0FBQztBQUM3RyxPQUFPLEVBQUUsc0JBQXNCLEVBQUUseUJBQXlCLEVBQUUsd0JBQXdCLEVBQUUsK0JBQStCLEVBQUUsK0JBQStCLEVBQUUsZUFBZSxFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDdk8sT0FBTyxFQUFtQixjQUFjLEVBQThILGNBQWMsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQ3hPLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUUvRCxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsUUFBUSxFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDdkcsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFDaEcsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBRXpGLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUN6RSxPQUFPLEVBQTBCLFVBQVUsSUFBSSx1QkFBdUIsRUFBRSxNQUFNLGlFQUFpRSxDQUFD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