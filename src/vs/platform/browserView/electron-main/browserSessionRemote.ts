/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { ITunnelProxyInfo } from '../../tunnel/common/tunnelProxy.js';
import { BrowserViewStorageScope } from '../common/browserView.js';
import type { BrowserSession } from './browserSession.js';

/**
 * Public subset of {@link BrowserSessionRemote} exposed to consumers
 * (e.g. {@link BrowserView}, {@link BrowserSessionTrust}) that need
 * to acquire/release the tunnel proxy or read its current info.
 */
export interface IBrowserSessionRemote {
	/**
	 * Fires when the session's tunnel proxy becomes active, i.e. the
	 * first reference is acquired with proxy info.
	 */
	readonly onDidStart: Event<void>;
	/**
	 * Fires when the session's tunnel proxy is torn down, i.e. the last
	 * reference is released or the proxy is cleared.
	 */
	readonly onDidStop: Event<void>;
	/** Whether this session is currently routing through a tunnel proxy. */
	readonly isRemote: boolean;
	/** Current resolved tunnel proxy info, or `undefined` if not started/no remote. */
	readonly proxy: ITunnelProxyInfo | undefined;
	/**
	 * Resolves once the tunnel proxy (if any) has been applied to the
	 * Electron session, so callers can defer navigation until requests
	 * will flow through the proxy. Resolves immediately for non-remote
	 * sessions.
	 */
	readonly whenReady: Promise<void>;
	/**
	 * Acquire a reference to the tunnel proxy on behalf of {@link viewId}
	 * and apply {@link proxyInfo} to the Electron session. Pass `undefined`
	 * to release the reference (non-remote view). Refcounted by
	 * {@link viewId}.
	 */
	acquire(viewId: string, proxyInfo: ITunnelProxyInfo | undefined): void;
	/**
	 * Release the reference acquired for {@link viewId}. Clears the proxy
	 * and resets the Electron session when the last reference is released.
	 * No-op for unknown viewIds.
	 */
	release(viewId: string): void;
}

/**
 * Owns the tunnel-proxy lifecycle for a {@link BrowserSession}: tracks
 * which views are using the session, applies the tunnel proxy URL/
 * credentials (pushed from the window's local node extension host, which
 * hosts the HTTPS tunnel proxy) to the underlying Electron session, and
 * clears the proxy when no view is using it anymore.
 *
 * One instance per {@link BrowserSession}. The proxy info is supplied per
 * {@link acquire} call rather than at construction so that a session reused
 * across windows picks up the latest proxy.
 *
 * If a session is shared across windows, the most recently applied proxy
 * wins for the duration; that's a known limitation of sharing sessions
 * across windows.
 */
export class BrowserSessionRemote implements IBrowserSessionRemote {

	private _proxy: ITunnelProxyInfo | undefined;
	private _readyPromise: Promise<void> = Promise.resolve();

	/** Live references held by view id; the proxy is cleared at zero. */
	private readonly _viewIds = new Set<string>();

	private readonly _onDidStart = new Emitter<void>();
	readonly onDidStart: Event<void> = this._onDidStart.event;

	private readonly _onDidStop = new Emitter<void>();
	readonly onDidStop: Event<void> = this._onDidStop.event;

	constructor(
		private readonly _session: BrowserSession,
	) {
	}

	get isRemote(): boolean {
		return this._proxy !== undefined;
	}

	get proxy(): ITunnelProxyInfo | undefined {
		return this._proxy;
	}

	get whenReady(): Promise<void> {
		return this._readyPromise;
	}

	acquire(viewId: string, proxyInfo: ITunnelProxyInfo | undefined): void {
		if (!proxyInfo || this._session.storageScope === BrowserViewStorageScope.Global) {
			this.release(viewId);
			return;
		}
		this._viewIds.add(viewId);
		this._setProxy(proxyInfo);
	}

	release(viewId: string): void {
		if (!this._viewIds.delete(viewId)) {
			return;
		}
		if (this._viewIds.size === 0) {
			this._setProxy(undefined);
		}
	}

	private _setProxy(info: ITunnelProxyInfo | undefined): void {
		if (sameProxyInfo(this._proxy, info)) {
			return;
		}
		const wasRemote = this._proxy !== undefined;
		this._proxy = info;
		this._readyPromise = this._applyProxy();
		if (info) {
			this._onDidStart.fire();
		} else if (wasRemote) {
			this._onDidStop.fire();
		}
	}

	private _applyProxy(): Promise<void> {
		if (this._proxy) {
			return this._session.electronSession.setProxy({
				proxyRules: this._proxy.url,
				proxyBypassRules: '<-loopback>'
			});
		}
		return this._session.electronSession.setProxy({ mode: 'direct' });
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
