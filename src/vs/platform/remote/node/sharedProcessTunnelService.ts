/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILogService } from 'vs/platform/log/common/log';
import { ISharedProcessTunnel, ISharedProcessTunnelService } from 'vs/platform/remote/common/sharedProcessTunnelService';
import { ITunnelService, RemoteTunnel } from 'vs/platform/remote/common/tunnel';
import { IAddress, IAddressProvider } from 'vs/platform/remote/common/remoteAgentConnection';
import { Disposable } from 'vs/base/common/lifecycle';
import { canceled } from 'vs/base/common/errors';

export class SharedProcessTunnelService extends Disposable implements ISharedProcessTunnelService {
	_serviceBrand: undefined;

	private static _lastId = 0;

	private readonly _tunnels: Map<string, RemoteTunnel> = new Map<string, RemoteTunnel>();
	private readonly _disposedTunnels: Set<string> = new Set<string>();

	constructor(
		@ITunnelService private readonly _tunnelService: ITunnelService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	public override dispose(): void {
		super.dispose();
		this._tunnels.forEach((tunnel) => tunnel.dispose());
	}

	async createTunnel(): Promise<{ id: string }> {
		const id = String(++SharedProcessTunnelService._lastId);
		return { id };
	}

	async startTunnel(id: string, address: IAddress, tunnelRemoteHost: string, tunnelRemotePort: number, tunnelLocalPort: number | undefined, elevateIfNeeded: boolean | undefined): Promise<ISharedProcessTunnel> {
		const addressProvider = new class implements IAddressProvider {
			async getAddress(): Promise<IAddress> {
				return address;
			}
		};

		const tunnel = await Promise.resolve(this._tunnelService.openTunnel(addressProvider, tunnelRemoteHost, tunnelRemotePort, tunnelLocalPort, elevateIfNeeded));
		if (!tunnel) {
			this._logService.info(`[SharedProcessTunnelService] Could not create a tunnel to ${tunnelRemoteHost}:${tunnelRemotePort} (remote).`);
			throw new Error(`Could not create tunnel`);
		}

		if (this._disposedTunnels.has(id)) {
			// This tunnel was disposed in the meantime
			this._disposedTunnels.delete(id);
			await tunnel.dispose();
			throw canceled();
		}

		this._tunnels.set(id, tunnel);

		this._logService.info(`[SharedProcessTunnelService] Created tunnel ${id}: ${tunnel.localAddress} (local) to ${tunnelRemoteHost}:${tunnelRemotePort} (remote).`);
		const result: ISharedProcessTunnel = {
			tunnelLocalPort: tunnel.tunnelLocalPort,
			localAddress: tunnel.localAddress
		};
		return result;
	}

	async destroyTunnel(id: string): Promise<void> {
		const tunnel = this._tunnels.get(id);
		if (tunnel) {
			this._logService.info(`[SharedProcessTunnelService] Disposing tunnel ${id}.`);
			this._tunnels.delete(id);
			await tunnel.dispose();
			return;
		}

		// Looks like this tunnel is still starting, mark the id as disposed
		this._disposedTunnels.add(id);
	}
}
