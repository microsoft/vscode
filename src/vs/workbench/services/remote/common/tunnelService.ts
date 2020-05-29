/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITunnelService, RemoteTunnel, ITunnelProvider } from 'vs/platform/remote/common/tunnel';
import { Event, Emitter } from 'vs/base/common/event';
import { IDisposable } from 'vs/base/common/lifecycle';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { ILogService } from 'vs/platform/log/common/log';

export abstract class AbstractTunnelService implements ITunnelService {
	_serviceBrand: undefined;

	private _onTunnelOpened: Emitter<RemoteTunnel> = new Emitter();
	public onTunnelOpened: Event<RemoteTunnel> = this._onTunnelOpened.event;
	private _onTunnelClosed: Emitter<{ host: string, port: number }> = new Emitter();
	public onTunnelClosed: Event<{ host: string, port: number }> = this._onTunnelClosed.event;
	protected readonly _tunnels = new Map</*host*/ string, Map</* port */ number, { refcount: number, readonly value: Promise<RemoteTunnel> }>>();
	protected _tunnelProvider: ITunnelProvider | undefined;

	public constructor(
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@ILogService protected readonly logService: ILogService
	) { }

	setTunnelProvider(provider: ITunnelProvider | undefined): IDisposable {
		if (!provider) {
			return {
				dispose: () => { }
			};
		}
		this._tunnelProvider = provider;
		return {
			dispose: () => {
				this._tunnelProvider = undefined;
			}
		};
	}

	public get tunnels(): Promise<readonly RemoteTunnel[]> {
		const promises: Promise<RemoteTunnel>[] = [];
		Array.from(this._tunnels.values()).forEach(portMap => Array.from(portMap.values()).forEach(x => promises.push(x.value)));
		return Promise.all(promises);
	}

	dispose(): void {
		for (const portMap of this._tunnels.values()) {
			for (const { value } of portMap.values()) {
				value.then(tunnel => tunnel.dispose());
			}
			portMap.clear();
		}
		this._tunnels.clear();
	}

	openTunnel(remoteHost: string | undefined, remotePort: number, localPort: number): Promise<RemoteTunnel> | undefined {
		const remoteAuthority = this.environmentService.configuration.remoteAuthority;
		if (!remoteAuthority) {
			return undefined;
		}

		if (!remoteHost || (remoteHost === '127.0.0.1')) {
			remoteHost = 'localhost';
		}

		const resolvedTunnel = this.retainOrCreateTunnel(remoteAuthority, remoteHost, remotePort, localPort);
		if (!resolvedTunnel) {
			return resolvedTunnel;
		}

		return resolvedTunnel.then(tunnel => {
			const newTunnel = this.makeTunnel(tunnel);
			if (tunnel.tunnelRemoteHost !== remoteHost || tunnel.tunnelRemotePort !== remotePort) {
				this.logService.warn('Created tunnel does not match requirements of requested tunnel. Host or port mismatch.');
			}
			this._onTunnelOpened.fire(newTunnel);
			return newTunnel;
		});
	}

	private makeTunnel(tunnel: RemoteTunnel): RemoteTunnel {
		return {
			tunnelRemotePort: tunnel.tunnelRemotePort,
			tunnelRemoteHost: tunnel.tunnelRemoteHost,
			tunnelLocalPort: tunnel.tunnelLocalPort,
			localAddress: tunnel.localAddress,
			dispose: () => {
				const existingHost = this._tunnels.get(tunnel.tunnelRemoteHost);
				if (existingHost) {
					const existing = existingHost.get(tunnel.tunnelRemotePort);
					if (existing) {
						existing.refcount--;
						this.tryDisposeTunnel(tunnel.tunnelRemoteHost, tunnel.tunnelRemotePort, existing);
					}
				}
			}
		};
	}

	private async tryDisposeTunnel(remoteHost: string, remotePort: number, tunnel: { refcount: number, readonly value: Promise<RemoteTunnel> }): Promise<void> {
		if (tunnel.refcount <= 0) {
			const disposePromise: Promise<void> = tunnel.value.then(tunnel => {
				tunnel.dispose(true);
				this._onTunnelClosed.fire({ host: tunnel.tunnelRemoteHost, port: tunnel.tunnelRemotePort });
			});
			if (this._tunnels.has(remoteHost)) {
				this._tunnels.get(remoteHost)!.delete(remotePort);
			}
			return disposePromise;
		}
	}

	async closeTunnel(remoteHost: string, remotePort: number): Promise<void> {
		const portMap = this._tunnels.get(remoteHost);
		if (portMap && portMap.has(remotePort)) {
			const value = portMap.get(remotePort)!;
			value.refcount = 0;
			await this.tryDisposeTunnel(remoteHost, remotePort, value);
		}
	}

	protected addTunnelToMap(remoteHost: string, remotePort: number, tunnel: Promise<RemoteTunnel>) {
		if (!this._tunnels.has(remoteHost)) {
			this._tunnels.set(remoteHost, new Map());
		}
		this._tunnels.get(remoteHost)!.set(remotePort, { refcount: 1, value: tunnel });
	}

	protected abstract retainOrCreateTunnel(remoteAuthority: string, remoteHost: string, remotePort: number, localPort?: number): Promise<RemoteTunnel> | undefined;
}

export class TunnelService extends AbstractTunnelService {
	protected retainOrCreateTunnel(remoteAuthority: string, remoteHost: string, remotePort: number, localPort?: number | undefined): Promise<RemoteTunnel> | undefined {
		const portMap = this._tunnels.get(remoteHost);
		const existing = portMap ? portMap.get(remotePort) : undefined;
		if (existing) {
			++existing.refcount;
			return existing.value;
		}

		if (this._tunnelProvider) {
			const tunnel = this._tunnelProvider.forwardPort({ remoteAddress: { host: remoteHost, port: remotePort } });
			if (tunnel) {
				this.addTunnelToMap(remoteHost, remotePort, tunnel);
			}
			return tunnel;
		}
		return undefined;
	}
}
