/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { IAddress } from '../../remote/common/remoteAgentConnection.js';

export const ISharedProcessTunnelProxyService = createDecorator<ISharedProcessTunnelProxyService>('sharedProcessTunnelProxyService');

export const ipcSharedProcessTunnelProxyChannelName = 'sharedProcessTunnelProxy';

/**
 * Info returned after starting the tunnel proxy.
 * Consumers use `proxyRules` with `session.setProxy()` to route traffic
 * through the proxy, and update the proxy's allowlist as forwarded ports
 * change.
 */
export interface ITunnelProxyInfo {
	/** Proxy rules string for `session.setProxy()` (e.g. `socks5://127.0.0.1:PORT`). */
	proxyRules: string;
	/** The local port the proxy is listening on. */
	port: number;
}

/**
 * A service running in the shared process that manages a tunnel proxy
 * server.  The proxy routes TCP connections through the remote agent
 * tunnel, but only for destinations in the allowlist (forwarded ports).
 */
export interface ISharedProcessTunnelProxyService {
	readonly _serviceBrand: undefined;

	/**
	 * Start the tunnel proxy for the given remote authority.
	 * Returns the proxy rules string and port.
	 */
	start(authority: string): Promise<ITunnelProxyInfo>;

	/**
	 * Set the remote address info for the proxy for the given authority.
	 * Should be called whenever the resolver resolves.
	 */
	setAddress(authority: string, address: IAddress): Promise<void>;

	/**
	 * Update the set of allowed destinations for the proxy.
	 * Only connections to these host:port pairs will be tunneled.
	 */
	updateAllowlist(authority: string, destinations: ReadonlyArray<{ host: string; port: number }>): Promise<void>;

	/**
	 * Get the current set of `host:port` with active tunneled connections
	 * (routed through the remote agent).
	 */
	getActiveTunneledHosts(authority: string): Promise<string[]>;

	/**
	 * Get the current set of `host:port` with active direct connections
	 * (routed locally).
	 */
	getActiveDirectHosts(authority: string): Promise<string[]>;

	/**
	 * Fires whenever the set of active connections changes (connection
	 * opened or closed). Call {@link getActiveTunneledHosts} and
	 * {@link getActiveDirectHosts} for the current state.
	 */
	onDidChangeActiveConnections: Event<string>;

	/**
	 * Release one reference to the proxy for the given authority.
	 * The proxy is stopped when the last reference is released.
	 */
	stop(authority: string): Promise<void>;
}
