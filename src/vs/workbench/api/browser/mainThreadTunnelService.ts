/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../nls.js';
import { MainThreadTunnelServiceShape, MainContext, ExtHostContext, ExtHostTunnelServiceShape, CandidatePortSource, PortAttributesSelector, TunnelDto } from '../common/extHost.protocol.js';
import { TunnelDtoConverter } from '../common/extHostTunnelService.js';
import { extHostNamedCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import { IRemoteExplorerService, PORT_AUTO_FORWARD_SETTING, PORT_AUTO_SOURCE_SETTING, PORT_AUTO_SOURCE_SETTING_HYBRID, PORT_AUTO_SOURCE_SETTING_OUTPUT, PortsEnablement } from '../../services/remote/common/remoteExplorerService.js';
import { ITunnelProvider, ITunnelService, TunnelCreationOptions, TunnelProviderFeatures, TunnelOptions, RemoteTunnel, ProvidedPortAttributes, PortAttributesProvider, TunnelProtocol } from '../../../platform/tunnel/common/tunnel.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import type { TunnelDescription } from '../../../platform/remote/common/remoteAuthorityResolver.js';
import { INotificationService, Severity } from '../../../platform/notification/common/notification.js';
import { IConfigurationService } from '../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { IRemoteAgentService } from '../../services/remote/common/remoteAgentService.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { Registry } from '../../../platform/registry/common/platform.js';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from '../../../platform/configuration/common/configurationRegistry.js';
import { IContextKeyService } from '../../../platform/contextkey/common/contextkey.js';
import { CandidatePort, TunnelCloseReason, TunnelSource, forwardedPortsFeaturesEnabled, makeAddress } from '../../services/remote/common/tunnelModel.js';

@extHostNamedCustomer(MainContext.MainThreadTunnelService)
export class MainThreadTunnelService extends Disposable implements MainThreadTunnelServiceShape, PortAttributesProvider {
	private readonly _proxy: ExtHostTunnelServiceShape;
	private elevateionRetry: boolean = false;
	private portsAttributesProviders: Map<number, PortAttributesSelector> = new Map();

	constructor(
		extHostContext: IExtHostContext,
		@IRemoteExplorerService private readonly remoteExplorerService: IRemoteExplorerService,
		@ITunnelService private readonly tunnelService: ITunnelService,
		@INotificationService private readonly notificationService: INotificationService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILogService private readonly logService: ILogService,
		@IRemoteAgentService private readonly remoteAgentService: IRemoteAgentService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService
	) {
		super();
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostTunnelService);
		this._register(tunnelService.onTunnelOpened(() => this._proxy.$onDidTunnelsChange()));
		this._register(tunnelService.onTunnelClosed(() => this._proxy.$onDidTunnelsChange()));
	}

	private processFindingEnabled(): boolean {
		return (!!this.configurationService.getValue(PORT_AUTO_FORWARD_SETTING) || this.tunnelService.hasTunnelProvider)
			&& (this.configurationService.getValue(PORT_AUTO_SOURCE_SETTING) !== PORT_AUTO_SOURCE_SETTING_OUTPUT);
	}

	async $setRemoteTunnelService(processId: number): Promise<void> {
		this.remoteExplorerService.namedProcesses.set(processId, 'Code Extension Host');
		if (this.remoteExplorerService.portsFeaturesEnabled === PortsEnablement.AdditionalFeatures) {
			this._proxy.$registerCandidateFinder(this.processFindingEnabled());
		} else {
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

	private _alreadyRegistered: boolean = false;
	async $registerPortsAttributesProvider(selector: PortAttributesSelector, providerHandle: number): Promise<void> {
		this.portsAttributesProviders.set(providerHandle, selector);
		if (!this._alreadyRegistered) {
			this.remoteExplorerService.tunnelModel.addAttributesProvider(this);
			this._alreadyRegistered = true;
		}
	}

	async $unregisterPortsAttributesProvider(providerHandle: number): Promise<void> {
		this.portsAttributesProviders.delete(providerHandle);
	}

	async providePortAttributes(ports: number[], pid: number | undefined, commandLine: string | undefined, token: CancellationToken): Promise<ProvidedPortAttributes[]> {
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

	async $openTunnel(tunnelOptions: TunnelOptions, source: string): Promise<TunnelDto | undefined> {
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

	private async elevationPrompt(tunnelOptions: TunnelOptions, tunnel: RemoteTunnel, source: string) {
		return this.notificationService.prompt(Severity.Info,
			nls.localize('remote.tunnel.openTunnel', "The extension {0} has forwarded port {1}. You'll need to run as superuser to use port {2} locally.", source, tunnelOptions.remoteAddress.port, tunnelOptions.localAddressPort),
			[{
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

	async $closeTunnel(remote: { host: string; port: number }): Promise<void> {
		return this.remoteExplorerService.close(remote, TunnelCloseReason.Other);
	}

	async $getTunnels(): Promise<TunnelDescription[]> {
		return (await this.tunnelService.tunnels).map(tunnel => {
			return {
				remoteAddress: { port: tunnel.tunnelRemotePort, host: tunnel.tunnelRemoteHost },
				localAddress: tunnel.localAddress,
				privacy: tunnel.privacy,
				protocol: tunnel.protocol
			};
		});
	}

	async $onFoundNewCandidates(candidates: CandidatePort[]): Promise<void> {
		this.remoteExplorerService.onFoundNewCandidates(candidates);
	}

	async $setTunnelProvider(features: TunnelProviderFeatures | undefined, isResolver: boolean): Promise<void> {
		const tunnelProvider: ITunnelProvider = {
			forwardPort: (tunnelOptions: TunnelOptions, tunnelCreationOptions: TunnelCreationOptions) => {
				const forward = this._proxy.$forwardPort(tunnelOptions, tunnelCreationOptions);
				return forward.then(tunnelOrError => {
					if (!tunnelOrError) {
						return undefined;
					} else if (typeof tunnelOrError === 'string') {
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
						dispose: async (silent?: boolean) => {
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

	async $hasTunnelProvider(): Promise<boolean> {
		return this.tunnelService.hasTunnelProvider;
	}

	async $setCandidateFilter(): Promise<void> {
		this.remoteExplorerService.setCandidateFilter((candidates: CandidatePort[]): Promise<CandidatePort[]> => {
			return this._proxy.$applyCandidateFilter(candidates);
		});
	}

	async $setCandidatePortSource(source: CandidatePortSource): Promise<void> {
		// Must wait for the remote environment before trying to set settings there.
		this.remoteAgentService.getEnvironment().then(() => {
			switch (source) {
				case CandidatePortSource.None: {
					Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration)
						.registerDefaultConfigurations([{ overrides: { 'remote.autoForwardPorts': false } }]);
					break;
				}
				case CandidatePortSource.Output: {
					Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration)
						.registerDefaultConfigurations([{ overrides: { 'remote.autoForwardPortsSource': PORT_AUTO_SOURCE_SETTING_OUTPUT } }]);
					break;
				}
				case CandidatePortSource.Hybrid: {
					Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration)
						.registerDefaultConfigurations([{ overrides: { 'remote.autoForwardPortsSource': PORT_AUTO_SOURCE_SETTING_HYBRID } }]);
					break;
				}
				default: // Do nothing, the defaults for these settings should be used.
			}
		}).catch(() => {
			// The remote failed to get setup. Errors from that area will already be surfaced to the user.
		});
	}
}
