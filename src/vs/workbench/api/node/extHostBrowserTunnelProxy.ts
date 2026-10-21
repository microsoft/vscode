/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from '../../../base/common/async.js';
import { Disposable, DisposableMap, IDisposable } from '../../../base/common/lifecycle.js';
import { ISocket } from '../../../base/parts/ipc/common/ipc.net.js';
import { localize } from '../../../nls.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { IAddress, IAddressProvider, IConnectionOptions, connectRemoteAgentTunnel } from '../../../platform/remote/common/remoteAgentConnection.js';
import { IRemoteConnectionData, RemoteConnectionType } from '../../../platform/remote/common/remoteAuthorityResolver.js';
import { IRemoteSocketFactoryService } from '../../../platform/remote/common/remoteSocketFactoryService.js';
import { nodeSocketFactory } from '../../../platform/remote/node/nodeSocketFactory.js';
import { ITunnelConnectFn, TunnelProxy } from '../../../platform/tunnel/node/tunnelProxy.js';
import { ITunnelProxyInfo } from '../../../platform/tunnel/common/tunnelProxy.js';
import { IExtHostBrowserTunnelProxy } from '../common/extHostBrowserTunnelProxy.js';
import { IExtHostExtensionService } from '../common/extHostExtensionService.js';
import { IExtHostManagedSockets } from '../common/extHostManagedSockets.js';
import { IExtHostInitDataService } from '../common/extHostInitDataService.js';
import { ExtHostManagedSocket } from './extHostTunnelService.js';
import { ISignService } from '../../../platform/sign/common/sign.js';

/**
 * Node implementation of {@link IExtHostBrowserTunnelProxy}: hosts, in the
 * local extension host, one {@link TunnelProxy} HTTPS server per remote
 * network browsers use. The renderer reference-counts networks and starts and
 * stops their proxies.
 *
 * The window's own remote (network authority = the window's remote authority)
 * dials destinations through the established remote connection (managed or
 * websocket), observed from
 * {@link IExtHostExtensionService.onDidChangeRemoteConnectionData}. Managed
 * connections are dialed in-process through {@link IExtHostManagedSockets},
 * which only exist in the local extension host because the resolver runs
 * there.
 *
 * The remote connection's endpoint is fed to its proxy through a long-lived,
 * mutable {@link MutableAddressProvider}. When the endpoint changes we update
 * the provider and drain the proxy's connection pool rather than restarting
 * it, so the renderer keeps the same proxy URL/credentials and active browsing
 * is not disrupted by unrelated connection-data updates (e.g. token refreshes).
 */
export class NodeExtHostBrowserTunnelProxy extends Disposable implements IExtHostBrowserTunnelProxy {
	declare readonly _serviceBrand: undefined;

	private readonly _addressProvider = new MutableAddressProvider();
	private _connection: IRemoteConnectionData | null = null;

	private readonly _networkProxies = this._register(new DisposableMap<string, INetworkProxy>());

	constructor(
		@IExtHostInitDataService private readonly _initData: IExtHostInitDataService,
		@ISignService private readonly _signService: ISignService,
		@ILogService private readonly _logService: ILogService,
		@IExtHostManagedSockets private readonly _managedSockets: IExtHostManagedSockets,
		@IExtHostExtensionService extHostExtensionService: IExtHostExtensionService,
	) {
		super();
		this._setConnection(extHostExtensionService.getRemoteConnectionData());
		this._register(extHostExtensionService.onDidChangeRemoteConnectionData(() => this._setConnection(extHostExtensionService.getRemoteConnectionData())));
	}

	$acquireNetworkProxy(authority: string): Promise<ITunnelProxyInfo> {
		if (authority !== this._initData.remote.authority) {
			return Promise.reject(new Error(localize('browser.unknownNetwork', "This page was opened for another remote ({0}). Open it again from a window connected to that remote.", authority)));
		}
		let entry = this._networkProxies.get(authority);
		if (!entry) {
			const proxy = new TunnelProxy(this._createRemoteConnector(), this._logService);
			const created: INetworkProxy = { proxy, info: proxy.start(), dispose: () => proxy.dispose() };
			created.info.catch(err => {
				this._logService.error(`[ExtHostBrowserTunnelProxy] Failed to start proxy for network ${authority}:`, err);
				// A released proxy was already disposed.
				if (this._networkProxies.get(authority) === created) {
					this._networkProxies.deleteAndDispose(authority);
				}
			});
			this._networkProxies.set(authority, created);
			entry = created;
		}
		return entry.info;
	}

	$releaseNetworkProxy(authority: string): void {
		this._networkProxies.deleteAndDispose(authority);
	}

	private _setConnection(connection: IRemoteConnectionData | null): void {
		if (!connection) {
			return; // never clear a known endpoint; mirror connection-data semantics
		}
		const changed = !!this._connection && !sameConnection(this._connection, connection);
		this._connection = connection;
		this._addressProvider.setAddress({ connectTo: connection.connectTo, connectionToken: connection.connectionToken });
		// The endpoint moved: drain in-flight connections so they reconnect against
		// the new address. The server itself stays up.
		if (changed && this._initData.remote.authority) {
			this._networkProxies.get(this._initData.remote.authority)?.proxy.drainConnectionPool();
		}
	}

	private _createRemoteConnector(): ITunnelConnectFn {
		const options = this._createConnectionOptions();
		return (host, port) => connectRemoteAgentTunnel(options, host, port);
	}

	private _createConnectionOptions(): IConnectionOptions {
		// A socket factory that dials the established connection directly,
		// in-process. Managed connections go through the extension host's managed
		// socket factory; websocket connections dial the host/port directly.
		const managedSockets = this._managedSockets;
		const remoteSocketFactoryService: IRemoteSocketFactoryService = {
			_serviceBrand: undefined,
			async connect(connectTo, path: string, query: string, debugLabel: string): Promise<ISocket> {
				if (connectTo.type === RemoteConnectionType.Managed) {
					const result = await managedSockets.makeConnection();
					return ExtHostManagedSocket.connect(result, path, query, debugLabel);
				}
				return nodeSocketFactory.connect(connectTo, path, query, debugLabel);
			},
			register() {
				// This adapter only dials the already-established remote connection (see
				// connect); it is never used to register socket factories.
				throw new Error('BrowserTunnelProxy socket factory does not support register()');
			},
		};

		return {
			commit: this._initData.commit,
			quality: this._initData.quality,
			addressProvider: this._addressProvider,
			remoteSocketFactoryService,
			signService: this._signService,
			logService: this._logService,
			ipcLogger: null,
		};
	}
}

/** A running proxy server and its connection info once started. */
interface INetworkProxy extends IDisposable {
	readonly proxy: TunnelProxy;
	readonly info: Promise<ITunnelProxyInfo>;
}

/**
 * A long-lived {@link IAddressProvider} whose address can be updated over time.
 * {@link getAddress} blocks until the first address is available and afterwards
 * always resolves to the latest one, so the kept-alive {@link TunnelProxy} picks
 * up endpoint changes per connection without being restarted.
 */
class MutableAddressProvider implements IAddressProvider {
	private _address: IAddress | null = null;
	private _pending: DeferredPromise<IAddress> | null = null;

	getAddress(): Promise<IAddress> {
		if (this._address) {
			return Promise.resolve(this._address);
		}
		this._pending ??= new DeferredPromise<IAddress>();
		return this._pending.p;
	}

	setAddress(address: IAddress): void {
		this._address = address;
		this._pending?.complete(address);
		this._pending = null;
	}
}

/**
 * Whether two connection descriptors point at the same endpoint, so the tunnel
 * proxy can ignore redundant connection-data updates (e.g. unrelated token
 * pushes) instead of needlessly draining its connection pool.
 */
function sameConnection(a: IRemoteConnectionData | null, b: IRemoteConnectionData | null): boolean {
	if (a === b) {
		return true;
	}
	if (!a || !b || a.connectionToken !== b.connectionToken) {
		return false;
	}
	const x = a.connectTo;
	const y = b.connectTo;
	if (x.type === RemoteConnectionType.Managed && y.type === RemoteConnectionType.Managed) {
		return x.id === y.id;
	}
	if (x.type === RemoteConnectionType.WebSocket && y.type === RemoteConnectionType.WebSocket) {
		return x.host === y.host && x.port === y.port;
	}
	return false;
}
