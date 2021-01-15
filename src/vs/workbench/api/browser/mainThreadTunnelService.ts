/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { MainThreadTunnelServiceShape, IExtHostContext, MainContext, ExtHostContext, ExtHostTunnelServiceShape } from 'vs/workbench/api/common/extHost.protocol';
import { TunnelDto } from 'vs/workbench/api/common/extHostTunnelService';
import { extHostNamedCustomer } from 'vs/workbench/api/common/extHostCustomers';
import { CandidatePort, IRemoteExplorerService, makeAddress } from 'vs/workbench/services/remote/common/remoteExplorerService';
import { ITunnelProvider, ITunnelService, TunnelCreationOptions, TunnelProviderFeatures, TunnelOptions, RemoteTunnel, isPortPrivileged } from 'vs/platform/remote/common/tunnel';
import { Disposable } from 'vs/base/common/lifecycle';
import type { TunnelDescription } from 'vs/platform/remote/common/remoteAuthorityResolver';
import { INotificationService, Severity } from 'vs/platform/notification/common/notification';

@extHostNamedCustomer(MainContext.MainThreadTunnelService)
export class MainThreadTunnelService extends Disposable implements MainThreadTunnelServiceShape {
	private readonly _proxy: ExtHostTunnelServiceShape;
	private elevateionRetry: boolean = false;

	constructor(
		extHostContext: IExtHostContext,
		@IRemoteExplorerService private readonly remoteExplorerService: IRemoteExplorerService,
		@ITunnelService private readonly tunnelService: ITunnelService,
		@INotificationService private readonly notificationService: INotificationService
	) {
		super();
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostTunnelService);
		this._register(tunnelService.onTunnelOpened(() => this._proxy.$onDidTunnelsChange()));
		this._register(tunnelService.onTunnelClosed(() => this._proxy.$onDidTunnelsChange()));
	}

	async $setCandidateFinder(): Promise<void> {
		if (this.remoteExplorerService.portsFeaturesEnabled) {
			this._proxy.$registerCandidateFinder();
		} else {
			this._register(this.remoteExplorerService.onEnabledPortsFeatures(() => this._proxy.$registerCandidateFinder()));
		}
	}

	async $openTunnel(tunnelOptions: TunnelOptions, source: string): Promise<TunnelDto | undefined> {
		const tunnel = await this.remoteExplorerService.forward(tunnelOptions.remoteAddress, tunnelOptions.localAddressPort, tunnelOptions.label, source, false);
		if (tunnel) {
			if (!this.elevateionRetry
				&& (tunnelOptions.localAddressPort !== undefined)
				&& (tunnel.tunnelLocalPort !== undefined)
				&& isPortPrivileged(tunnelOptions.localAddressPort)
				&& (tunnel.tunnelLocalPort !== tunnelOptions.localAddressPort)
				&& this.tunnelService.canElevate) {

				this.elevationPrompt(tunnelOptions, tunnel, source);
			}
			return TunnelDto.fromServiceTunnel(tunnel);
		}
		return undefined;
	}

	private async elevationPrompt(tunnelOptions: TunnelOptions, tunnel: RemoteTunnel, source: string) {
		return this.notificationService.prompt(Severity.Info,
			nls.localize('remote.tunnel.openTunnel', "The extension {0} has forwarded port {1}. You'll need to run as superuser to use port {2} locally.", source, tunnelOptions.remoteAddress.port, tunnelOptions.localAddressPort),
			[{
				label: nls.localize('remote.tunnelsView.elevationButton', "Use Port {0} as Sudo...", tunnel.tunnelRemotePort),
				run: async () => {
					this.elevateionRetry = true;
					await this.remoteExplorerService.close({ host: tunnel.tunnelRemoteHost, port: tunnel.tunnelRemotePort });
					await this.remoteExplorerService.forward(tunnelOptions.remoteAddress, tunnelOptions.localAddressPort, tunnelOptions.label, source, true);
					this.elevateionRetry = false;
				}
			}]);
	}

	async $closeTunnel(remote: { host: string, port: number }): Promise<void> {
		return this.remoteExplorerService.close(remote);
	}

	async $getTunnels(): Promise<TunnelDescription[]> {
		return (await this.tunnelService.tunnels).map(tunnel => {
			return {
				remoteAddress: { port: tunnel.tunnelRemotePort, host: tunnel.tunnelRemoteHost },
				localAddress: tunnel.localAddress
			};
		});
	}

	async $onFoundNewCandidates(candidates: CandidatePort[]): Promise<void> {
		this.remoteExplorerService.onFoundNewCandidates(candidates);
	}

	async $setTunnelProvider(features: TunnelProviderFeatures): Promise<void> {
		const tunnelProvider: ITunnelProvider = {
			forwardPort: (tunnelOptions: TunnelOptions, tunnelCreationOptions: TunnelCreationOptions) => {
				const forward = this._proxy.$forwardPort(tunnelOptions, tunnelCreationOptions);
				if (forward) {
					return forward.then(tunnel => {
						if (!tunnel) {
							return undefined;
						}
						return {
							tunnelRemotePort: tunnel.remoteAddress.port,
							tunnelRemoteHost: tunnel.remoteAddress.host,
							localAddress: typeof tunnel.localAddress === 'string' ? tunnel.localAddress : makeAddress(tunnel.localAddress.host, tunnel.localAddress.port),
							tunnelLocalPort: typeof tunnel.localAddress !== 'string' ? tunnel.localAddress.port : undefined,
							public: tunnel.public,
							dispose: async (silent?: boolean) => {
								return this._proxy.$closeTunnel({ host: tunnel.remoteAddress.host, port: tunnel.remoteAddress.port }, silent);
							}
						};
					});
				}
				return undefined;
			}
		};
		this.tunnelService.setTunnelProvider(tunnelProvider, features);
	}

	async $setCandidateFilter(): Promise<void> {
		this.remoteExplorerService.setCandidateFilter((candidates: CandidatePort[]): Promise<CandidatePort[]> => {
			return this._proxy.$applyCandidateFilter(candidates);
		});
	}


	dispose(): void {

	}
}
