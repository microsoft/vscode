/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { ILogService } from '../../log/common/log.js';
import { ISharedProcessTunnelProxyService, ITunnelProxyInfo } from '../../tunnel/common/sharedProcessTunnelProxyService.js';
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
	 * first {@link acquire} sets {@link proxyId}.
	 */
	readonly onDidStart: Event<void>;
	/**
	 * Fires when the session's tunnel proxy is torn down, i.e. the last
	 * reference is released (or the proxy failed to start) and
	 * {@link proxyId} is cleared.
	 */
	readonly onDidStop: Event<void>;
	/**
	 * Opaque id of the shared-process proxy this session is currently
	 * using, or `undefined` when no view is holding a reference. Set
	 * when the first {@link acquire} runs; cleared when the last
	 * reference is released.
	 */
	readonly proxyId: string | undefined;
	/** Current resolved tunnel proxy info, or `undefined` if not started/no remote. */
	readonly proxy: ITunnelProxyInfo | undefined;
	/**
	 * Resolves once the tunnel proxy (if any) has been started and
	 * applied to the Electron session, so callers can defer navigation
	 * until requests will flow through the proxy. Resolves immediately
	 * for non-remote sessions or when no start is in flight.
	 */
	readonly whenReady: Promise<void>;
	/**
	 * Acquire a reference to the shared-process tunnel proxy on behalf
	 * of {@link viewId}. Starts the proxy on the first reference and
	 * applies the resolved proxy info to the Electron session. Safe to
	 * call multiple times with the same {@link viewId} (idempotent).
	 * No-op when {@link proxyId} is `undefined` (non-remote view).
	 */
	acquire(viewId: string, proxyId: string | undefined): Promise<void>;
	/**
	 * Release the reference acquired for {@link viewId}. Stops the
	 * proxy and resets the Electron session when the last reference
	 * is released. No-op for unknown viewIds.
	 */
	release(viewId: string): void;
}

/**
 * Owns the tunnel-proxy lifecycle for a {@link BrowserSession}: tracks
 * which views are using the session, starts the shared-process tunnel
 * proxy on first use, applies the proxy URL/credentials to the
 * underlying Electron session, and stops the proxy when no view is
 * using it anymore.
 *
 * One instance per {@link BrowserSession}. The {@link proxyId} is
 * supplied per {@link acquire} call rather than at construction so that
 * a session reused across windows (e.g. the same workspace opened in a
 * second window after the first was closed) picks up the new window's
 * proxy id instead of a stale one cached at construction time.
 *
 * If a second window acquires the same session while the first is
 * still holding a reference, the first window's proxy id wins for the
 * duration; the second window's traffic flows through the existing
 * proxy. That's a known limitation of sharing sessions across windows.
 */
export class BrowserSessionRemote implements IBrowserSessionRemote {

	private _proxy: ITunnelProxyInfo | undefined;
	private _activeProxyId: string | undefined;
	private _startPromise: Promise<void> | undefined;

	/**
	 * Live references: viewId → the proxy id that view was acquired
	 * with. Stored so {@link release} can find the right id to stop
	 * without the caller having to remember it.
	 */
	private readonly _viewIds = new Map<string, string>();

	private readonly _onDidStart = new Emitter<void>();
	readonly onDidStart: Event<void> = this._onDidStart.event;

	private readonly _onDidStop = new Emitter<void>();
	readonly onDidStop: Event<void> = this._onDidStop.event;

	constructor(
		private readonly _session: BrowserSession,
		private readonly _tunnelService: ISharedProcessTunnelProxyService,
		private readonly _logService: ILogService,
	) {
	}

	get proxyId(): string | undefined {
		return this._activeProxyId;
	}

	get proxy(): ITunnelProxyInfo | undefined {
		return this._proxy;
	}

	get whenReady(): Promise<void> {
		return this._startPromise ? this._startPromise.then(() => undefined) : Promise.resolve();
	}

	async acquire(viewId: string, proxyId: string | undefined): Promise<void> {
		if (!proxyId || this._session.storageScope === BrowserViewStorageScope.Global) {
			return this.release(viewId);
		}

		// Idempotent per viewId: subsequent acquires just await the
		// in-flight start (if any) so the session is fully configured
		// before the caller proceeds.
		if (this._viewIds.has(viewId)) {
			if (this._startPromise) {
				await this._startPromise;
			}
			return;
		}

		// First acquire after the session is idle picks the active id;
		// concurrent acquires with a mismatched id (cross-window reuse
		// of a shared session) stay with the existing one.
		if (this._activeProxyId === undefined) {
			this._activeProxyId = proxyId;
		} else if (this._activeProxyId !== proxyId) {
			this._logService.warn(`[BrowserSessionRemote] Session '${this._session.id}' is shared across windows; staying with proxy '${this._activeProxyId}' (ignoring '${proxyId}').`);
		}

		const activeProxyId = this._activeProxyId;
		this._viewIds.set(viewId, activeProxyId);

		if (!this._startPromise) {
			const startPromise: Promise<void> = this._tunnelService.start(activeProxyId).then((proxy) => {
				// Apply the resolved proxy to the Electron session once, as long
				// as a view is still using it. Folding the apply into the start
				// chain guarantees `whenReady` only resolves after `setProxy` ran.
				if (this._viewIds.size > 0 && !sameProxyInfo(this._proxy, proxy)) {
					this._proxy = proxy;
					this._applyProxy();
					this._onDidStart.fire();
				}
			}).catch(err => {
				this._logService.error(`[BrowserSessionRemote] Failed to start tunnel proxy '${activeProxyId}':`, err);
				// Reset so the next acquire retries from scratch.
				if (this._startPromise === startPromise) {
					this._startPromise = undefined;
					this._viewIds.clear();
					this._activeProxyId = undefined;
					this._onDidStop.fire();
				}
			});
			this._startPromise = startPromise;
		}

		return this._startPromise;
	}

	release(viewId: string): void {
		const releasedProxyId = this._viewIds.get(viewId);
		if (releasedProxyId === undefined || !this._viewIds.delete(viewId)) {
			return;
		}
		if (this._viewIds.size === 0) {
			void this._tunnelService.stop(releasedProxyId);
			this._activeProxyId = undefined;
			this._startPromise = undefined;
			if (this._proxy) {
				this._proxy = undefined;
				this._applyProxy();
			}
			this._onDidStop.fire();
		}
	}

	private _applyProxy(): void {
		if (this._proxy) {
			this._session.electronSession.setProxy({
				proxyRules: this._proxy.url,
				proxyBypassRules: '<-loopback>'
			});
		} else {
			this._session.electronSession.setProxy({ mode: 'direct' });
		}
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
