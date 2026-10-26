/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';
import { ITunnelProxyInfo } from '../../../platform/tunnel/common/tunnelProxy.js';
import { ExtHostBrowserTunnelProxyShape } from './extHost.protocol.js';

export const IExtHostBrowserTunnelProxy = createDecorator<IExtHostBrowserTunnelProxy>('IExtHostBrowserTunnelProxy');

/**
 * Hosts (in the local node extension host) one HTTPS proxy server per remote
 * network browsers use. Today the only network is the window's remote, served
 * through the remote connection.
 *
 * Running the servers here — rather than in the shared process — gives them
 * in-process access to the resolver's managed connection, so managed remotes
 * (WSL, Dev Containers, Codespaces, Remote Tunnels) work natively, and keeps
 * each window's traffic isolated in that window's extension host.
 *
 * The default (common) implementation is a no-op; only the node extension
 * host can host a server (see `ExtHostBrowserTunnelProxy` in the node layer).
 */
export interface IExtHostBrowserTunnelProxy extends ExtHostBrowserTunnelProxyShape {
	readonly _serviceBrand: undefined;
}

export class ExtHostBrowserTunnelProxy implements IExtHostBrowserTunnelProxy {
	declare readonly _serviceBrand: undefined;

	$acquireNetworkProxy(_authority: string): Promise<ITunnelProxyInfo> {
		return Promise.reject(new Error('Browser network proxies require the local node extension host'));
	}

	$releaseNetworkProxy(_authority: string): void {
		// No-op: no network proxy can have been acquired.
	}
}
