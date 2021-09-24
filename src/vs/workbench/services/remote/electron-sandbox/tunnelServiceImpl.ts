/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILogService } from 'vs/platform/log/common/log';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { URI } from 'vs/base/common/uri';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ITunnelService, AbstractTunnelService, RemoteTunnel, TunnelPrivacyId } from 'vs/platform/remote/common/tunnel';
import { Disposable } from 'vs/base/common/lifecycle';
import { IAddressProvider } from 'vs/platform/remote/common/remoteAgentConnection';
import { ISharedProcessTunnelService } from 'vs/platform/remote/common/sharedProcessTunnelService';
import { ILifecycleService } from 'vs/workbench/services/lifecycle/common/lifecycle';

class SharedProcessTunnel extends Disposable implements RemoteTunnel {

	public readonly privacy = TunnelPrivacyId.Private;
	public readonly protocol: string | undefined = undefined;

	constructor(
		private readonly _sharedProcessTunnelService: ISharedProcessTunnelService,
		private readonly _id: string,
		public readonly tunnelRemoteHost: string,
		public readonly tunnelRemotePort: number,
		public readonly tunnelLocalPort: number | undefined,
		public readonly localAddress: string,
		private readonly _onBeforeDispose: () => void
	) {
		super();
	}

	public override async dispose(): Promise<void> {
		this._onBeforeDispose();
		super.dispose();
		await this._sharedProcessTunnelService.destroyTunnel(this._id);
	}
}

export class TunnelService extends AbstractTunnelService {

	private readonly _activeSharedProcessTunnels = new Set<string>();

	public constructor(
		@ILogService logService: ILogService,
		@IWorkbenchEnvironmentService private readonly _environmentService: IWorkbenchEnvironmentService,
		@ISharedProcessTunnelService private readonly _sharedProcessTunnelService: ISharedProcessTunnelService,
		@ILifecycleService lifecycleService: ILifecycleService,
	) {
		super(logService);

		// Destroy any shared process tunnels that might still be active
		lifecycleService.onDidShutdown(() => {
			this._activeSharedProcessTunnels.forEach((id) => {
				this._sharedProcessTunnelService.destroyTunnel(id);
			});
		});
	}

	protected retainOrCreateTunnel(addressProvider: IAddressProvider, remoteHost: string, remotePort: number, localPort: number | undefined, elevateIfNeeded: boolean, privacy: string, protocol?: string): Promise<RemoteTunnel | undefined> | undefined {
		const existing = this.getTunnelFromMap(remoteHost, remotePort);
		if (existing) {
			++existing.refcount;
			return existing.value;
		}

		if (this._tunnelProvider) {
			return this.createWithProvider(this._tunnelProvider, remoteHost, remotePort, localPort, elevateIfNeeded, privacy, protocol);
		} else {
			this.logService.trace(`ForwardedPorts: (TunnelService) Creating tunnel without provider ${remoteHost}:${remotePort} on local port ${localPort}.`);

			const tunnel = this._createSharedProcessTunnel(addressProvider, remoteHost, remotePort, localPort, elevateIfNeeded);
			this.logService.trace('ForwardedPorts: (TunnelService) Tunnel created without provider.');
			this.addTunnelToMap(remoteHost, remotePort, tunnel);
			return tunnel;
		}
	}

	private async _createSharedProcessTunnel(addressProvider: IAddressProvider, tunnelRemoteHost: string, tunnelRemotePort: number, tunnelLocalPort: number | undefined, elevateIfNeeded: boolean | undefined): Promise<RemoteTunnel> {
		const address = await addressProvider.getAddress();

		const { id } = await this._sharedProcessTunnelService.createTunnel();
		this._activeSharedProcessTunnels.add(id);

		const result = await this._sharedProcessTunnelService.startTunnel(id, address, tunnelRemoteHost, tunnelRemotePort, tunnelLocalPort, elevateIfNeeded);
		const tunnel = new SharedProcessTunnel(this._sharedProcessTunnelService, id, tunnelRemoteHost, tunnelRemotePort, result.tunnelLocalPort, result.localAddress, () => {
			this._activeSharedProcessTunnels.delete(id);
		});
		return tunnel;
	}

	override canTunnel(uri: URI): boolean {
		return super.canTunnel(uri) && !!this._environmentService.remoteAuthority;
	}
}

registerSingleton(ITunnelService, TunnelService);
