/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITunnelProxyInfo } from '../../tunnel/common/tunnelProxy.js';
import type { BrowserSession } from './browserSession.js';

/**
 * Public subset of {@link BrowserSessionRemote} exposed to consumers
 * (e.g. {@link BrowserView}, {@link BrowserSessionTrust}) that need
 * to acquire/release the tunnel proxy or read its current info.
 */
export interface IBrowserSessionRemote {
	/** Current tunnel proxy info, or `undefined` while no view holds one. */
	readonly proxy: ITunnelProxyInfo | undefined;
	/**
	 * Resolves once the tunnel proxy (if any) has been applied to the
	 * Electron session, so callers can defer navigation until requests
	 * will flow through the proxy. Resolves immediately for sessions
	 * without a proxy.
	 */
	readonly whenReady: Promise<void>;
	/**
	 * Hold {@link proxyInfo} on behalf of {@link viewId} and apply it to the
	 * Electron session. Calling again for the same view replaces its proxy
	 * (e.g. after its window's extension host restarted).
	 */
	acquire(viewId: string, proxyInfo: ITunnelProxyInfo): void;
	/**
	 * Release the proxy held for {@link viewId}. When other views still hold
	 * a different proxy, switches to one of theirs; clears the proxy and
	 * resets the Electron session when the last view releases. No-op for
	 * unknown viewIds.
	 */
	release(viewId: string): void;
}

/**
 * Owns the tunnel-proxy lifecycle for a {@link BrowserSession} bound to a
 * remote network: tracks which views use the session and the proxy each was
 * given, applies a proxy to the underlying Electron session, and clears it
 * when no view uses it anymore.
 *
 * One instance per {@link BrowserSession}. Proxy info is supplied per
 * {@link acquire} call rather than at construction because a session can be
 * shared by views of several windows, each with its own local proxy server.
 * The most recently acquired proxy is applied; when its last view goes away,
 * a proxy still held by another view takes over. A view never releases its
 * proxy without closing, so the session never falls back to the local network.
 */
export class BrowserSessionRemote implements IBrowserSessionRemote {

	private _proxy: ITunnelProxyInfo | undefined;
	private _readyPromise: Promise<void> = Promise.resolve();

	/** Proxy given to each live view; the proxy is cleared when this is empty. */
	private readonly _viewProxies = new Map<string, ITunnelProxyInfo>();

	constructor(
		private readonly _session: BrowserSession,
	) {
	}

	get proxy(): ITunnelProxyInfo | undefined {
		return this._proxy;
	}

	get whenReady(): Promise<void> {
		return this._readyPromise;
	}

	acquire(viewId: string, proxyInfo: ITunnelProxyInfo): void {
		this._viewProxies.set(viewId, proxyInfo);
		this._setProxy(proxyInfo);
	}

	release(viewId: string): void {
		if (!this._viewProxies.delete(viewId)) {
			return;
		}
		const remaining = [...this._viewProxies.values()];
		if (remaining.length === 0) {
			this._setProxy(undefined);
		} else if (!remaining.some(info => sameProxyInfo(info, this._proxy))) {
			this._setProxy(remaining[remaining.length - 1]);
		}
	}

	private _setProxy(info: ITunnelProxyInfo | undefined): void {
		if (sameProxyInfo(this._proxy, info)) {
			return;
		}
		this._proxy = info;
		// Serialize applies so an older, slower apply can never win.
		const apply = () => this._applyProxy(info);
		this._readyPromise = this._readyPromise.then(apply, apply);
	}

	private async _applyProxy(info: ITunnelProxyInfo | undefined): Promise<void> {
		const electronSession = this._session.electronSession;
		if (info) {
			await electronSession.setProxy({
				proxyRules: info.url,
				proxyBypassRules: '<-loopback>'
			});
		} else {
			await electronSession.setProxy({ mode: 'direct' });
		}
		// Pooled sockets would otherwise keep using the previous proxy.
		await electronSession.closeAllConnections();
	}
}

function sameProxyInfo(a: ITunnelProxyInfo | undefined, b: ITunnelProxyInfo | undefined): boolean {
	if (a === b) {
		return true;
	}
	if (!a || !b) {
		return false;
	}
	return a.url === b.url
		&& a.certFingerprint === b.certFingerprint
		&& a.credentials.username === b.credentials.username
		&& a.credentials.password === b.credentials.password;
}
