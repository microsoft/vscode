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
	private _onTunnelClosed: Emitter<number> = new Emitter();
	public onTunnelClosed: Event<number> = this._onTunnelClosed.event;
	private readonly _tunnels = new Map</* port */ number, { refcount: number, readonly value: Promise<RemoteTunnel> }>();
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
		return Promise.all(Array.from(this._tunnels.values()).map(x => x.value));
	}

	dispose(): void {
		for (const { value } of this._tunnels.values()) {
			value.then(tunnel => tunnel.dispose());
		}
		this._tunnels.clear();
	}

	openTunnel(remotePort: number, localPort: number): Promise<RemoteTunnel> | undefined {
		const remoteAuthority = this.environmentService.configuration.remoteAuthority;
		if (!remoteAuthority) {
			return undefined;
		}

		const resolvedTunnel = this.retainOrCreateTunnel(remoteAuthority, remotePort, localPort);
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
				const existing = this._tunnels.get(tunnel.tunnelRemotePort);
				if (existing) {
					existing.refcount--;
					this.tryDisposeTunnel(tunnel.tunnelRemotePort, existing);
				}
			}
		};
	}

	private async tryDisposeTunnel(remotePort: number, tunnel: { refcount: number, readonly value: Promise<RemoteTunnel> }): Promise<void> {
		if (tunnel.refcount <= 0) {
			const disposePromise: Promise<void> = tunnel.value.then(tunnel => {
				tunnel.dispose();
				this._onTunnelClosed.fire(tunnel.tunnelRemotePort);
			});
			this._tunnels.delete(remotePort);
			return disposePromise;
		}
	}

	async closeTunnel(remotePort: number): Promise<void> {
		if (this._tunnels.has(remotePort)) {
			const value = this._tunnels.get(remotePort)!;
			value.refcount = 0;
			await this.tryDisposeTunnel(remotePort, value);
		}
	}

	private retainOrCreateTunnel(remoteAuthority: string, remotePort: number, localPort?: number): Promise<RemoteTunnel> | undefined {
		const existing = this._tunnels.get(remotePort);
		if (existing) {
			++existing.refcount;
			return existing.value;
		}

		if (this._tunnelProvider) {
			const tunnel = this._tunnelProvider.forwardPort({ remote: { host: 'localhost', port: remotePort } });
			if (tunnel) {
				this._tunnels.set(remotePort, { refcount: 1, value: tunnel });
			}
			return tunnel;
		} else {
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
			this._tunnels.set(remotePort, { refcount: 1, value: tunnel });
			return tunnel;
		}
	}
}

registerSingleton(ITunnelService, TunnelService, true);
