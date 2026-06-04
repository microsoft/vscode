/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILogService } from '../../log/common/log.js';
import { ISharedProcessTunnelProxyService, ITunnelProxyInfo } from '../../tunnel/common/sharedProcessTunnelProxyService.js';
import type { BrowserSession } from './browserSession.js';

/**
 * Public subset of {@link BrowserSessionRemote} exposed to consumers
 * (e.g. {@link BrowserView}, {@link BrowserSessionTrust}) that need
 * to acquire/release the tunnel proxy or read its current info.
 */
export interface IBrowserSessionRemote {
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
	private _startPromise: Promise<ITunnelProxyInfo | undefined> | undefined;

	/**
	 * Live references: viewId → the proxy id that view was acquired
	 * with. Stored so {@link release} can find the right id to stop
	 * without the caller having to remember it.
	 */
	private readonly _viewIds = new Map<string, string>();

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

	async acquire(viewId: string, proxyId: string | undefined): Promise<void> {
		if (!proxyId) {
			return;
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
			const startPromise: Promise<ITunnelProxyInfo | undefined> = this._tunnelService.start(activeProxyId).catch(err => {
				this._logService.error(`[BrowserSessionRemote] Failed to start tunnel proxy '${activeProxyId}':`, err);
				// Reset so the next acquire retries from scratch.
				if (this._startPromise === startPromise) {
					this._startPromise = undefined;
					this._viewIds.clear();
					this._activeProxyId = undefined;
				}
				return undefined;
			});
			this._startPromise = startPromise;
		}

		const proxy = await this._startPromise;
		// Only apply if this viewId is still alive (it may have been
		// released or cleared on error while we were awaiting).
		if (this._viewIds.has(viewId) && !sameProxyInfo(this._proxy, proxy)) {
			this._proxy = proxy;
			this._applyProxy();
		}
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
