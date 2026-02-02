/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILogService } from 'vs/platform/log/common/log';
import { ISharedProcessTunnel, ISharedProcessTunnelService } from 'vs/platform/remote/common/sharedProcessTunnelService';
import { ISharedTunnelsService, RemoteTunnel } from 'vs/platform/tunnel/common/tunnel';
import { IAddress, IAddressProvider } from 'vs/platform/remote/common/remoteAgentConnection';
import { Disposable } from 'vs/base/common/lifecycle';
import { canceled } from 'vs/base/common/errors';
import { DeferredPromise } from 'vs/base/common/async';

class TunnelData extends Disposable implements IAddressProvider {

	private _address: IAddress | null;
	private _addressPromise: DeferredPromise<IAddress> | null;

	constructor() {
		super();
		this._address = null;
		this._addressPromise = null;
	}

	async getAddress(): Promise<IAddress> {
		if (this._address) {
			// address is resolved
			return this._address;
		}
		if (!this._addressPromise) {
			this._addressPromise = new DeferredPromise<IAddress>();
		}
		return this._addressPromise.p;
	}

	setAddress(address: IAddress): void {
		this._address = address;
		if (this._addressPromise) {
			this._addressPromise.complete(address);
			this._addressPromise = null;
		}
	}

	setTunnel(tunnel: RemoteTunnel): void {
		this._register(tunnel);
	}
}

export class SharedProcessTunnelService extends Disposable implements ISharedProcessTunnelService {
	_serviceBrand: undefined;

	private static _lastId = 0;

	private readonly _tunnels: Map<string, TunnelData> = new Map<string, TunnelData>();
	private readonly _disposedTunnels: Set<string> = new Set<string>();

	constructor(
		@ISharedTunnelsService private readonly _tunnelService: ISharedTunnelsService,
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

	async startTunnel(authority: string, id: string, tunnelRemoteHost: string, tunnelRemotePort: number, tunnelLocalHost: string, tunnelLocalPort: number | undefined, elevateIfNeeded: boolean | undefined): Promise<ISharedProcessTunnel> {
		const tunnelData = new TunnelData();

		const tunnel = await Promise.resolve(this._tunnelService.openTunnel(authority, tunnelData, tunnelRemoteHost, tunnelRemotePort, tunnelLocalHost, tunnelLocalPort, elevateIfNeeded));
		if (!tunnel || (typeof tunnel === 'string')) {
			this._logService.info(`[SharedProcessTunnelService] Could not create a tunnel to ${tunnelRemoteHost}:${tunnelRemotePort} (remote).`);
			tunnelData.dispose();
			throw new Error(`Could not create tunnel`);
		}

		if (this._disposedTunnels.has(id)) {
			// This tunnel was disposed in the meantime
			this._disposedTunnels.delete(id);
			tunnelData.dispose();
			await tunnel.dispose();
			throw canceled();
		}

		tunnelData.setTunnel(tunnel);
		this._tunnels.set(id, tunnelData);

		this._logService.info(`[SharedProcessTunnelService] Created tunnel ${id}: ${tunnel.localAddress} (local) to ${tunnelRemoteHost}:${tunnelRemotePort} (remote).`);
		const result: ISharedProcessTunnel = {
			tunnelLocalPort: tunnel.tunnelLocalPort,
			localAddress: tunnel.localAddress
		};
		return result;
	}

	async setAddress(id: string, address: IAddress): Promise<void> {
		const tunnel = this._tunnels.get(id);
		if (!tunnel) {
			return;
		}
		tunnel.setAddress(address);
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
