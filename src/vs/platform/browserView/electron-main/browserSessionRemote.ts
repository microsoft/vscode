/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from '../../../base/common/async.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { ITunnelProxyInfo, TunnelProxyStatus } from '../../tunnel/common/tunnelProxy.js';
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
	 * Acquire a reference to the tunnel proxy on behalf of {@link viewId} and
	 * apply its current lifecycle {@link status}. Refcounted by {@link viewId}.
	 */
	acquire(viewId: string, status: TunnelProxyStatus): void;
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
	private _pendingReady: DeferredPromise<void> | undefined;
	private _failureMessage: string | undefined;

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

	acquire(viewId: string, status: TunnelProxyStatus): void {
		if (status.type === 'stopped' || this._session.storageScope === BrowserViewStorageScope.Global) {
			this.release(viewId);
			return;
		}
		this._viewIds.add(viewId);
		switch (status.type) {
			case 'starting':
				this._setPending();
				break;
			case 'ready':
				this._setProxy(status.info);
				break;
			case 'failed':
				this._setFailed(status.error);
				break;
		}
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
		if (sameProxyInfo(this._proxy, info) && !this._pendingReady && !this._failureMessage) {
			return;
		}
		const wasRemote = this._proxy !== undefined;
		this._proxy = info;
		this._failureMessage = undefined;
		const pendingReady = this._pendingReady;
		this._pendingReady = undefined;
		const applyPromise = this._applyProxy();
		if (pendingReady) {
			this._readyPromise = pendingReady.p;
			void applyPromise.then(
				() => pendingReady.complete(),
				error => pendingReady.error(error)
			);
		} else {
			this._readyPromise = applyPromise;
		}
		if (info) {
			this._onDidStart.fire();
		} else if (wasRemote) {
			this._onDidStop.fire();
		}
	}

	private _setPending(): void {
		this._failureMessage = undefined;
		if (!this._pendingReady) {
			this._pendingReady = new DeferredPromise<void>();
			this._readyPromise = this._pendingReady.p;
			void this._readyPromise.catch(() => { });
		}
	}

	private _setFailed(message: string): void {
		if (this._failureMessage === message) {
			return;
		}
		const wasRemote = this._proxy !== undefined;
		this._proxy = undefined;
		this._failureMessage = message;
		const pendingReady = this._pendingReady;
		this._pendingReady = undefined;
		const error = new Error(`Failed to start remote browser proxy: ${message}`);
		const applyPromise = wasRemote ? this._applyProxy() : Promise.resolve();
		if (pendingReady) {
			this._readyPromise = pendingReady.p;
			void applyPromise.then(
				() => pendingReady.error(error),
				applyError => pendingReady.error(applyError)
			);
		} else {
			this._readyPromise = applyPromise.then(() => { throw error; });
			void this._readyPromise.catch(() => { });
		}
		if (wasRemote) {
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
