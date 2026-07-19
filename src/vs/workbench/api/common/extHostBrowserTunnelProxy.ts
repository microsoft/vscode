/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';
import { ExtHostBrowserTunnelProxyShape } from './extHost.protocol.js';

export const IExtHostBrowserTunnelProxy = createDecorator<IExtHostBrowserTunnelProxy>('IExtHostBrowserTunnelProxy');

/**
 * Hosts (in the local node extension host) an HTTPS proxy server that routes
 * the integrated browser's traffic through the remote agent tunnel.
 *
 * Running the server here — rather than in the shared process — gives it
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

	$setEnabled(_enabled: boolean): void {
		// No-op: only the node extension host can host a server.
	}
}
