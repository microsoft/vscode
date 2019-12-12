/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MainThreadTunnelServiceShape, IExtHostContext, MainContext, ExtHostContext, ExtHostTunnelServiceShape } from 'vs/workbench/api/common/extHost.protocol';
import { TunnelOptions, TunnelDto } from 'vs/workbench/api/common/extHostTunnelService';
import { extHostNamedCustomer } from 'vs/workbench/api/common/extHostCustomers';
import { IRemoteExplorerService } from 'vs/workbench/services/remote/common/remoteExplorerService';

@extHostNamedCustomer(MainContext.MainThreadTunnelService)
export class MainThreadTunnelService implements MainThreadTunnelServiceShape {
	private readonly _proxy: ExtHostTunnelServiceShape;

	constructor(
		extHostContext: IExtHostContext,
		@IRemoteExplorerService private readonly remoteExplorerService: IRemoteExplorerService
	) {
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostTunnelService);
	}

	async $openTunnel(tunnelOptions: TunnelOptions): Promise<TunnelDto | undefined> {
		const tunnel = await this.remoteExplorerService.forward(tunnelOptions.remote.port, tunnelOptions.localPort, tunnelOptions.name);
		if (tunnel) {
			return { remote: { host: tunnel.tunnelRemoteHost, port: tunnel.tunnelRemotePort }, localAddress: tunnel.localAddress };
		}
		return undefined;
	}

	async $closeTunnel(remotePort: number): Promise<void> {
		return this.remoteExplorerService.close(remotePort);
	}

	$addDetected(tunnels: { remote: { port: number, host: string }, localAddress: string }[]): Promise<void> {
		return Promise.resolve(this.remoteExplorerService.addDetected(tunnels));
	}

	async $registerCandidateFinder(): Promise<void> {
		this.remoteExplorerService.registerCandidateFinder(() => this._proxy.$findCandidatePorts());
	}

	dispose(): void {
		//
	}
}
