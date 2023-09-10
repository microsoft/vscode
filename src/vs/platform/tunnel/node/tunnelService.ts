/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as net from 'net';
import * as os from 'os';
import { BROWSER_RESTRICTED_PORTS, findFreePortFaster } from 'vs/base/node/ports';
import { NodeSocket } from 'vs/base/parts/ipc/node/ipc.net';

import { Barrier } from 'vs/base/common/async';
import { Disposable } from 'vs/base/common/lifecycle';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ILogService } from 'vs/platform/log/common/log';
import { IProductService } from 'vs/platform/product/common/productService';
import { connectRemoteAgentTunnel, IAddressProvider, IConnectionOptions } from 'vs/platform/remote/common/remoteAgentConnection';
import { AbstractTunnelService, isAllInterfaces, ISharedTunnelsService as ISharedTunnelsService, isLocalhost, isPortPrivileged, isTunnelProvider, ITunnelProvider, ITunnelService, RemoteTunnel, TunnelPrivacyId } from 'vs/platform/tunnel/common/tunnel';
import { ISignService } from 'vs/platform/sign/common/sign';
import { OS } from 'vs/base/common/platform';
import { IRemoteSocketFactoryService } from 'vs/platform/remote/common/remoteSocketFactoryService';

async function createRemoteTunnel(options: IConnectionOptions, defaultTunnelHost: string, tunnelRemoteHost: string, tunnelRemotePort: number, tunnelLocalPort?: number): Promise<RemoteTunnel> {
	let readyTunnel: NodeRemoteTunnel | undefined;
	for (let attempts = 3; attempts; attempts--) {
		readyTunnel?.dispose();
		const tunnel = new NodeRemoteTunnel(options, defaultTunnelHost, tunnelRemoteHost, tunnelRemotePort, tunnelLocalPort);
		readyTunnel = await tunnel.waitForReady();
		if ((tunnelLocalPort && BROWSER_RESTRICTED_PORTS[tunnelLocalPort]) || !BROWSER_RESTRICTED_PORTS[readyTunnel.tunnelLocalPort]) {
			break;
		}
	}
	return readyTunnel!;
}

class NodeRemoteTunnel extends Disposable implements RemoteTunnel {

	public readonly tunnelRemotePort: number;
	public tunnelLocalPort!: number;
	public tunnelRemoteHost: string;
	public localAddress!: string;
	public readonly privacy = TunnelPrivacyId.Private;

	private readonly _options: IConnectionOptions;
	private readonly _server: net.Server;
	private readonly _barrier: Barrier;

	private readonly _listeningListener: () => void;
	private readonly _connectionListener: (socket: net.Socket) => void;
	private readonly _errorListener: () => void;

	private readonly _socketsDispose: Map<string, () => void> = new Map();

	constructor(options: IConnectionOptions, private readonly defaultTunnelHost: string, tunnelRemoteHost: string, tunnelRemotePort: number, private readonly suggestedLocalPort?: number) {
		super();
		this._options = options;
		this._server = net.createServer();
		this._barrier = new Barrier();

		this._listeningListener = () => this._barrier.open();
		this._server.on('listening', this._listeningListener);

		this._connectionListener = (socket) => this._onConnection(socket);
		this._server.on('connection', this._connectionListener);

		// If there is no error listener and there is an error it will crash the whole window
		this._errorListener = () => { };
		this._server.on('error', this._errorListener);

		this.tunnelRemotePort = tunnelRemotePort;
		this.tunnelRemoteHost = tunnelRemoteHost;
	}

	public override async dispose(): Promise<void> {
		super.dispose();
		this._server.removeListener('listening', this._listeningListener);
		this._server.removeListener('connection', this._connectionListener);
		this._server.removeListener('error', this._errorListener);
		this._server.close();
		const disposers = Array.from(this._socketsDispose.values());
		disposers.forEach(disposer => {
			disposer();
		});
	}

	public async waitForReady(): Promise<this> {
		const startPort = this.suggestedLocalPort ?? this.tunnelRemotePort;
		const hostname = isAllInterfaces(this.defaultTunnelHost) ? '0.0.0.0' : '127.0.0.1';
		// try to get the same port number as the remote port number...
		let localPort = await findFreePortFaster(startPort, 2, 1000, hostname);

		// if that fails, the method above returns 0, which works out fine below...
		let address: string | net.AddressInfo | null = null;
		this._server.listen(localPort, this.defaultTunnelHost);
		await this._barrier.wait();
		address = <net.AddressInfo>this._server.address();

		// It is possible for findFreePortFaster to return a port that there is already a server listening on. This causes the previous listen call to error out.
		if (!address) {
			localPort = 0;
			this._server.listen(localPort, this.defaultTunnelHost);
			await this._barrier.wait();
			address = <net.AddressInfo>this._server.address();
		}

		this.tunnelLocalPort = address.port;
		this.localAddress = `${this.tunnelRemoteHost === '127.0.0.1' ? '127.0.0.1' : 'localhost'}:${address.port}`;
		return this;
	}

	private async _onConnection(localSocket: net.Socket): Promise<void> {
		// pause reading on the socket until we have a chance to forward its data
		localSocket.pause();

		const tunnelRemoteHost = (isLocalhost(this.tunnelRemoteHost) || isAllInterfaces(this.tunnelRemoteHost)) ? 'localhost' : this.tunnelRemoteHost;
		const protocol = await connectRemoteAgentTunnel(this._options, tunnelRemoteHost, this.tunnelRemotePort);
		const remoteSocket = (<NodeSocket>protocol.getSocket()).socket;
		const dataChunk = protocol.readEntireBuffer();
		protocol.dispose();

		if (dataChunk.byteLength > 0) {
			localSocket.write(dataChunk.buffer);
		}

		localSocket.on('end', () => {
			if (localSocket.localAddress) {
				this._socketsDispose.delete(localSocket.localAddress);
			}
			remoteSocket.end();
		});
		localSocket.on('close', () => remoteSocket.end());
		localSocket.on('error', () => {
			if (localSocket.localAddress) {
				this._socketsDispose.delete(localSocket.localAddress);
			}
			remoteSocket.destroy();
		});

		remoteSocket.on('end', () => localSocket.end());
		remoteSocket.on('close', () => localSocket.end());
		remoteSocket.on('error', () => {
			localSocket.destroy();
		});

		localSocket.pipe(remoteSocket);
		remoteSocket.pipe(localSocket);
		if (localSocket.localAddress) {
			this._socketsDispose.set(localSocket.localAddress, () => {
				// Need to end instead of unpipe, otherwise whatever is connected locally could end up "stuck" with whatever state it had until manually exited.
				localSocket.end();
				remoteSocket.end();
			});
		}
	}
}

export class BaseTunnelService extends AbstractTunnelService {
	public constructor(
		@IRemoteSocketFactoryService private readonly remoteSocketFactoryService: IRemoteSocketFactoryService,
		@ILogService logService: ILogService,
		@ISignService private readonly signService: ISignService,
		@IProductService private readonly productService: IProductService,
		@IConfigurationService configurationService: IConfigurationService
	) {
		super(logService, configurationService);
	}

	public isPortPrivileged(port: number): boolean {
		return isPortPrivileged(port, this.defaultTunnelHost, OS, os.release());
	}

	protected retainOrCreateTunnel(addressOrTunnelProvider: IAddressProvider | ITunnelProvider, remoteHost: string, remotePort: number, localHost: string, localPort: number | undefined, elevateIfNeeded: boolean, privacy?: string, protocol?: string): Promise<RemoteTunnel | undefined> | undefined {
		const existing = this.getTunnelFromMap(remoteHost, remotePort);
		if (existing) {
			++existing.refcount;
			return existing.value;
		}

		if (isTunnelProvider(addressOrTunnelProvider)) {
			return this.createWithProvider(addressOrTunnelProvider, remoteHost, remotePort, localPort, elevateIfNeeded, privacy, protocol);
		} else {
			this.logService.trace(`ForwardedPorts: (TunnelService) Creating tunnel without provider ${remoteHost}:${remotePort} on local port ${localPort}.`);
			const options: IConnectionOptions = {
				commit: this.productService.commit,
				quality: this.productService.quality,
				addressProvider: addressOrTunnelProvider,
				remoteSocketFactoryService: this.remoteSocketFactoryService,
				signService: this.signService,
				logService: this.logService,
				ipcLogger: null
			};

			const tunnel = createRemoteTunnel(options, localHost, remoteHost, remotePort, localPort);
			this.logService.trace('ForwardedPorts: (TunnelService) Tunnel created without provider.');
			this.addTunnelToMap(remoteHost, remotePort, tunnel);
			return tunnel;
		}
	}
}

export class TunnelService extends BaseTunnelService {
	public constructor(
		@IRemoteSocketFactoryService remoteSocketFactoryService: IRemoteSocketFactoryService,
		@ILogService logService: ILogService,
		@ISignService signService: ISignService,
		@IProductService productService: IProductService,
		@IConfigurationService configurationService: IConfigurationService
	) {
		super(remoteSocketFactoryService, logService, signService, productService, configurationService);
	}
}

export class SharedTunnelsService extends Disposable implements ISharedTunnelsService {
	declare readonly _serviceBrand: undefined;
	private readonly _tunnelServices: Map<string, ITunnelService> = new Map();

	public constructor(
		@IRemoteSocketFactoryService protected readonly remoteSocketFactoryService: IRemoteSocketFactoryService,
		@ILogService protected readonly logService: ILogService,
		@IProductService private readonly productService: IProductService,
		@ISignService private readonly signService: ISignService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();
	}

	async openTunnel(authority: string, addressProvider: IAddressProvider | undefined, remoteHost: string | undefined, remotePort: number, localHost: string, localPort?: number, elevateIfNeeded?: boolean, privacy?: string, protocol?: string): Promise<RemoteTunnel | undefined> {
		this.logService.trace(`ForwardedPorts: (SharedTunnelService) openTunnel request for ${remoteHost}:${remotePort} on local port ${localPort}.`);
		if (!this._tunnelServices.has(authority)) {
			const tunnelService = new TunnelService(this.remoteSocketFactoryService, this.logService, this.signService, this.productService, this.configurationService);
			this._register(tunnelService);
			this._tunnelServices.set(authority, tunnelService);
			tunnelService.onTunnelClosed(async () => {
				if ((await tunnelService.tunnels).length === 0) {
					tunnelService.dispose();
					this._tunnelServices.delete(authority);
				}
			});
		}
		return this._tunnelServices.get(authority)!.openTunnel(addressProvider, remoteHost, remotePort, localHost, localPort, elevateIfNeeded, privacy, protocol);
	}
}
