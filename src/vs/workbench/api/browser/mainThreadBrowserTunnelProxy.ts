/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../base/common/buffer.js';
import { Disposable, DisposableMap } from '../../../base/common/lifecycle.js';
import { IAgentHostConnectionsService } from '../../../platform/agentHost/common/agentHostConnectionsService.js';
import { IAgentHostTcpConnection } from '../../../platform/agentHost/common/agentHostTcpConnection.js';
import { IBrowserViewWorkbenchService } from '../../contrib/browserView/common/browserView.js';
import { IExtHostContext, extHostNamedCustomer } from '../../services/extensions/common/extHostCustomers.js';
import { ExtensionHostKind } from '../../services/extensions/common/extensionHostKind.js';
import { ExtHostBrowserTunnelProxyShape, ExtHostContext, MainContext, MainThreadBrowserTunnelProxyShape } from '../common/extHost.protocol.js';

/**
 * Renderer-side bridge for the browser proxies the local extension host runs,
 * one per remote network browsers use (see {@link IBrowserViewWorkbenchService.registerNetworkProxyProvider}).
 * Proxies of agent host networks open their destination connections here, as
 * TCP streams on the renderer's agent host connections.
 */
@extHostNamedCustomer(MainContext.MainThreadBrowserTunnelProxy)
export class MainThreadBrowserTunnelProxy extends Disposable implements MainThreadBrowserTunnelProxyShape {

	private readonly _proxy: ExtHostBrowserTunnelProxyShape;
	/** Only the local extension host runs browser proxies, so only it may open connections on agent host networks. */
	private readonly _isProxyHost: boolean;
	/** Destination connections opened on agent host networks. The extension host closes each when its proxy no longer uses it. */
	private readonly _networkConnections = this._register(new DisposableMap<number, IAgentHostTcpConnection>());
	private _nextNetworkConnectionId = 0;

	constructor(
		extHostContext: IExtHostContext,
		@IBrowserViewWorkbenchService private readonly _browserViewWorkbenchService: IBrowserViewWorkbenchService,
		@IAgentHostConnectionsService private readonly _agentHostConnectionsService: IAgentHostConnectionsService,
	) {
		super();
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostBrowserTunnelProxy);
		this._isProxyHost = extHostContext.extensionHostKind === ExtensionHostKind.LocalProcess;

		if (this._isProxyHost) {
			this._register(this._browserViewWorkbenchService.registerNetworkProxyProvider({
				acquire: authority => this._proxy.$acquireNetworkProxy(authority),
				release: authority => this._proxy.$releaseNetworkProxy(authority),
			}));
		}
	}

	async $openNetworkConnection(authority: string, host: string, port: number): Promise<number> {
		if (!this._isProxyHost) {
			throw new Error('Only the local extension host can open browser network connections');
		}
		const connection = this._agentHostConnectionsService.getConnectionByAuthority(authority);
		if (!connection) {
			throw new Error(`Agent host network ${authority} is not connected`);
		}
		if (!connection.openTcpConnection) {
			throw new Error(`Agent host network ${authority} does not support TCP connections`);
		}
		const stream = await connection.openTcpConnection({ host, port });
		if (this._store.isDisposed) {
			stream.dispose();
			throw new Error('Browser network connection closed');
		}
		const id = this._nextNetworkConnectionId++;
		this._networkConnections.set(id, stream);
		return id;
	}

	$readNetworkConnection(id: number): Promise<VSBuffer | undefined> {
		return this._getNetworkConnection(id).read();
	}

	$writeNetworkConnection(id: number, data: VSBuffer): Promise<void> {
		return this._getNetworkConnection(id).write(data);
	}

	async $endNetworkConnection(id: number): Promise<void> {
		const connection = this._getNetworkConnection(id);
		await connection.end();
		// Keep the stream subscribed until the host has received the final data.
		await connection.drain();
	}

	$closeNetworkConnection(id: number): void {
		this._networkConnections.deleteAndDispose(id);
	}

	private _getNetworkConnection(id: number): IAgentHostTcpConnection {
		const connection = this._networkConnections.get(id);
		if (!connection) {
			throw new Error('Browser network connection is closed');
		}
		return connection;
	}
}
