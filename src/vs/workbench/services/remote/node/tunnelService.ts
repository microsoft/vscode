/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as net from 'net';
import { Barrier } from 'vs/base/common/async';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { NodeSocket } from 'vs/base/parts/ipc/node/ipc.net';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import product from 'vs/platform/product/common/product';
import { connectRemoteAgentTunnel, IConnectionOptions } from 'vs/platform/remote/common/remoteAgentConnection';
import { IRemoteAuthorityResolverService } from 'vs/platform/remote/common/remoteAuthorityResolver';
import { ITunnelService, RemoteTunnel, ITunnelProvider } from 'vs/platform/remote/common/tunnel';
import { nodeSocketFactory } from 'vs/platform/remote/node/nodeSocketFactory';
import { ISignService } from 'vs/platform/sign/common/sign';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ILogService } from 'vs/platform/log/common/log';
import { findFreePort } from 'vs/base/node/ports';
import { Event, Emitter } from 'vs/base/common/event';

export async function createRemoteTunnel(options: IConnectionOptions, tunnelRemotePort: number, tunnelLocalPort?: number): Promise<RemoteTunnel> {
	const tunnel = new NodeRemoteTunnel(options, tunnelRemotePort, tunnelLocalPort);
	return tunnel.waitForReady();
}

class NodeRemoteTunnel extends Disposable implements RemoteTunnel {

	public readonly tunnelRemotePort: number;
	public tunnelLocalPort!: number;
	public tunnelRemoteHost: string = 'localhost';
	public localAddress!: string;

	private readonly _options: IConnectionOptions;
	private readonly _server: net.Server;
	private readonly _barrier: Barrier;

	private readonly _listeningListener: () => void;
	private readonly _connectionListener: (socket: net.Socket) => void;

	constructor(options: IConnectionOptions, tunnelRemotePort: number, private readonly suggestedLocalPort?: number) {
		super();
		this._options = options;
		this._server = net.createServer();
		this._barrier = new Barrier();

		this._listeningListener = () => this._barrier.open();
		this._server.on('listening', this._listeningListener);

		this._connectionListener = (socket) => this._onConnection(socket);
		this._server.on('connection', this._connectionListener);

		this.tunnelRemotePort = tunnelRemotePort;

	}

	public dispose(): void {
		super.dispose();
		this._server.removeListener('listening', this._listeningListener);
		this._server.removeListener('connection', this._connectionListener);
		this._server.close();
	}

	public async waitForReady(): Promise<this> {

		// try to get the same port number as the remote port number...
		const localPort = await findFreePort(this.suggestedLocalPort ?? this.tunnelRemotePort, 1, 1000);

		// if that fails, the method above returns 0, which works out fine below...
		const address = (<net.AddressInfo>this._server.listen(localPort).address());
		this.tunnelLocalPort = address.port;

		await this._barrier.wait();
		this.localAddress = 'localhost:' + address.port;
		return this;
	}

	private async _onConnection(localSocket: net.Socket): Promise<void> {
		// pause reading on the socket until we have a chance to forward its data
		localSocket.pause();

		const protocol = await connectRemoteAgentTunnel(this._options, this.tunnelRemotePort);
		const remoteSocket = (<NodeSocket>protocol.getSocket()).socket;
		const dataChunk = protocol.readEntireBuffer();
		protocol.dispose();

		if (dataChunk.byteLength > 0) {
			localSocket.write(dataChunk.buffer);
		}

		localSocket.on('end', () => remoteSocket.end());
		localSocket.on('close', () => remoteSocket.end());
		remoteSocket.on('end', () => localSocket.end());
		remoteSocket.on('close', () => localSocket.end());

		localSocket.pipe(remoteSocket);
		remoteSocket.pipe(localSocket);
	}
}

export class TunnelService implements ITunnelService {
	_serviceBrand: undefined;

	private _onTunnelOpened: Emitter<RemoteTunnel> = new Emitter();
	public onTunnelOpened: Event<RemoteTunnel> = this._onTunnelOpened.event;
	private _onTunnelClosed: Emitter<{ host: string, port: number }> = new Emitter();
	public onTunnelClosed: Event<{ host: string, port: number }> = this._onTunnelClosed.event;
	private readonly _tunnels = new Map</*host*/ string, Map</* port */ number, { refcount: number, readonly value: Promise<RemoteTunnel> }>>();
	private _tunnelProvider: ITunnelProvider | undefined;

	public constructor(
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@IRemoteAuthorityResolverService private readonly remoteAuthorityResolverService: IRemoteAuthorityResolverService,
		@ISignService private readonly signService: ISignService,
		@ILogService private readonly logService: ILogService,
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
				tunnel.dispose();
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

	private addTunnelToMap(remoteHost: string, remotePort: number, tunnel: Promise<RemoteTunnel>) {
		if (!this._tunnels.has(remoteHost)) {
			this._tunnels.set(remoteHost, new Map());
		}
		this._tunnels.get(remoteHost)!.set(remotePort, { refcount: 1, value: tunnel });
	}

	private retainOrCreateTunnel(remoteAuthority: string, remoteHost: string, remotePort: number, localPort?: number): Promise<RemoteTunnel> | undefined {
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
		} else if (remoteHost === 'localhost') {
			const options: IConnectionOptions = {
				commit: product.commit,
				socketFactory: nodeSocketFactory,
				addressProvider: {
					getAddress: async () => {
						const { authority } = await this.remoteAuthorityResolverService.resolveAuthority(remoteAuthority);
						return { host: authority.host, port: authority.port };
					}
				},
				signService: this.signService,
				logService: this.logService
			};

			const tunnel = createRemoteTunnel(options, remotePort, localPort);
			this.addTunnelToMap(remoteHost, remotePort, tunnel);
			return tunnel;
		}
		return undefined;
	}
}

registerSingleton(ITunnelService, TunnelService, true);
