/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MainThreadTunnelServiceShape, IExtHostContext, MainContext, ExtHostContext, ExtHostTunnelServiceShape } from 'vs/workbench/api/common/extHost.protocol';
import { TunnelOptions, TunnelDto } from 'vs/workbench/api/common/extHostTunnelService';
import { extHostNamedCustomer } from 'vs/workbench/api/common/extHostCustomers';
import { IRemoteExplorerService } from 'vs/workbench/services/remote/common/remoteExplorerService';
import { ITunnelProvider, ITunnelService } from 'vs/platform/remote/common/tunnel';

@extHostNamedCustomer(MainContext.MainThreadTunnelService)
export class MainThreadTunnelService implements MainThreadTunnelServiceShape {
	private readonly _proxy: ExtHostTunnelServiceShape;

	constructor(
		extHostContext: IExtHostContext,
		@IRemoteExplorerService private readonly remoteExplorerService: IRemoteExplorerService,
		@ITunnelService private readonly tunnelService: ITunnelService
	) {
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostTunnelService);
	}

	async $openTunnel(tunnelOptions: TunnelOptions): Promise<TunnelDto | undefined> {
		const tunnel = await this.remoteExplorerService.forward(tunnelOptions.remote.port, tunnelOptions.localPort, tunnelOptions.name);
		if (tunnel) {
			return TunnelDto.fromServiceTunnel(tunnel);
		}
		return undefined;
	}

	async $closeTunnel(remotePort: number): Promise<void> {
		return this.remoteExplorerService.close(remotePort);
	}

	async $registerCandidateFinder(): Promise<void> {
		this.remoteExplorerService.registerCandidateFinder(() => this._proxy.$findCandidatePorts());
	}

	async $setTunnelProvider(): Promise<void> {
		const tunnelProvider: ITunnelProvider = {
			forwardPort: (tunnelOptions: TunnelOptions) => {
				const forward = this._proxy.$forwardPort(tunnelOptions);
				if (forward) {
					return forward.then(tunnel => {
						return {
							tunnelRemotePort: tunnel.remote.port,
							tunnelRemoteHost: tunnel.remote.host,
							localAddress: tunnel.localAddress,
							dispose: () => {
								this._proxy.$closeTunnel({ host: tunnel.remote.host, port: tunnel.remote.port });
							}
						};
					});
				}
				return undefined;
			}
		};
		this.tunnelService.setTunnelProvider(tunnelProvider);
	}

	dispose(): void {
		//
	}
}
