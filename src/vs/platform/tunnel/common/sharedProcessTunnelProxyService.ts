/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../instantiation/common/instantiation.js';
import { IAddress } from '../../remote/common/remoteAgentConnection.js';

export const ISharedProcessTunnelProxyService = createDecorator<ISharedProcessTunnelProxyService>('sharedProcessTunnelProxyService');

export const ipcSharedProcessTunnelProxyChannelName = 'sharedProcessTunnelProxy';

/**
 * Credentials and metadata for the tunnel proxy.
 * This is the single type consumers need to configure an Electron session
 * (proxy URL, credentials for Basic auth, certificate fingerprint for
 * pinning the self-signed TLS certificate).
 */
export interface ITunnelProxyInfo {
	/** Proxy URL for `session.setProxy()` (e.g. `https://127.0.0.1:PORT`). */
	url: string;
	host: string;
	port: number;
	/** Basic auth credentials for `Proxy-Authorization`. */
	credentials: { username: string; password: string };
	/** SHA-256 fingerprint of the self-signed certificate (`sha256/<base64>`). */
	certFingerprint: string;
}

/**
 * A service running in the shared process that manages an HTTPS proxy
 * server.  The proxy routes TCP connections through the remote agent
 * tunnel, making the remote network transparently accessible to consumers
 * that support HTTPS proxies (e.g. Electron sessions via `session.setProxy()`).
 *
 * The proxy uses a self-signed TLS certificate and Basic proxy
 * authentication with randomly generated credentials.
 *
 * Each proxy is keyed by an opaque {@link id}. The shared process does
 * not interpret the id; callers compose it from whatever scopes they
 * need to isolate (e.g. window id + remote authority, so two windows
 * on the same remote get independent proxies and address providers).
 */
export interface ISharedProcessTunnelProxyService {
	readonly _serviceBrand: undefined;

	/**
	 * Start (or join) the tunnel proxy for the given {@link id}.
	 * Reference-counted: every {@link start} must be paired with a
	 * {@link stop}; the proxy stays up while the count is positive.
	 * Returns the proxy URL, credentials, and certificate fingerprint.
	 */
	start(id: string): Promise<ITunnelProxyInfo>;

	/**
	 * Update the remote address used by the proxy for the given {@link id}.
	 * Should be called whenever the resolver resolves. Safe to call
	 * before {@link start} — the address is stored for the next start.
	 */
	setAddress(id: string, address: IAddress): Promise<void>;

	/**
	 * Release one reference to the proxy for the given {@link id}.
	 * The proxy is stopped when the last reference is released.
	 */
	stop(id: string): Promise<void>;
}
