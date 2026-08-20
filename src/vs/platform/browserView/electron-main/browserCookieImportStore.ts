/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createRequire } from 'module';
import { Disposable } from '../../../base/common/lifecycle.js';
import { getLogger } from './browserCookieImportLog.js';
import type { BrowserWindow } from 'electron';

// `electron` is a CommonJS module — a top-level named import (`import { BrowserWindow }`)
// fails in the renderer test environment where the module is loaded via ESM. Load it
// lazily with createRequire so this module can be imported anywhere; the BrowserWindow
// is only needed when a CDP session is actually constructed (electron-main only).
const nodeRequire = createRequire(import.meta.url);
function loadBrowserWindow(): typeof import('electron').BrowserWindow {
	return nodeRequire('electron').BrowserWindow;
}

/**
 * CDP cookie write store — the low-level jar mutation layer.
 *
 * Electron's high-level `session.cookies` API cannot write partitioned
 * cookies (CHIPS) and rejects some legacy cookie shapes. To match Orca's
 * fidelity we drive the cookie jar through CDP instead:
 *
 *   - `Network.setCookie` — write a single cookie with full fidelity
 *     (partitionKey, sourceScheme, priority, sameParty, etc.)
 *   - `Network.getAllCookies` — snapshot the jar for rollback
 *   - `Network.deleteCookies` — remove a cookie by identity
 *
 * CDP requires an attached debugger on a WebContents that belongs to the
 * target session. Browser views may not exist for every session (e.g. a
 * fresh workspace), so we open a temporary hidden `BrowserWindow` bound to
 * the session, attach the debugger, run the commands, and destroy the
 * window. This mirrors Orca's `openHiddenCookieWindow()` pattern.
 *
 * The window is never shown and never loads any content — it exists only
 * to own a WebContents whose debugger can reach the session's cookie jar.
 */

/**
 * A cookie identity as understood by CDP `Network.deleteCookies` /
 * `Network.getCookies`. `url` is derived from the cookie's domain+path so
 * the CDP layer can resolve the cookie without ambiguity.
 */
export interface ICookieIdentity {
	readonly name: string;
	readonly domain: string;
	readonly path: string;
	readonly url: string;
}

/**
 * A cookie as returned by CDP `Network.getAllCookies`. The `partitionKey`
 * field is present on Chromium 105+ and is `undefined` for unpartitioned
 * cookies.
 */
export interface ICdpCookie {
	readonly name: string;
	readonly value: string;
	readonly domain: string;
	readonly path: string;
	readonly expires: number;
	readonly size: number;
	readonly httpOnly: boolean;
	readonly secure: boolean;
	readonly session: boolean;
	readonly sameSite: 'Strict' | 'Lax' | 'None' | 'Unspecified';
	readonly priority: 'Low' | 'Medium' | 'High';
	readonly sameParty: boolean;
	readonly sourceScheme: 'Unset' | 'NonSecure' | 'Secure';
	readonly sourcePort: number;
	readonly partitionKey?: string;
}

/**
 * Result of a single `Network.setCookie` call.
 */
export interface ICookieWriteResult {
	readonly ok: boolean;
	readonly error?: string;
}

/**
 * Opens a temporary hidden BrowserWindow bound to the given Electron
 * session, attaches the debugger, and returns a handle that can send CDP
 * commands. The window is destroyed on dispose.
 */
export class BrowserCookieImportCdpSession extends Disposable {

	private readonly _window: BrowserWindow;
	private readonly _debugger: Electron.Debugger;
	private _attached = false;

	constructor(session: Electron.Session) {
		super();

		// Lazy-load BrowserWindow at construction time so the module-level
		// import does not fail in renderer test environments (see loadBrowserWindow).
		const BrowserWindowCtor = loadBrowserWindow();
		this._window = new BrowserWindowCtor({
			show: false,
			width: 1,
			height: 1,
			webPreferences: {
				session,
				backgroundThrottling: false
			}
		});
		this._debugger = this._window.webContents.debugger;

		this._register({
			dispose: () => {
				try {
					if (this._attached && !this._window.webContents.isDestroyed()) {
						this._debugger.detach();
					}
				} catch {
					// WebContents may already be destroyed
				}
				if (!this._window.isDestroyed()) {
					this._window.destroy();
				}
			}
		});
	}

	/**
	 * Attach the debugger if not already attached.
	 */
	async attach(): Promise<void> {
		if (this._attached) {
			return;
		}
		this._debugger.attach('1.3');
		this._attached = true;
	}

	/**
	 * Send a CDP command. Attaches the debugger on first use.
	 */
	async sendCommand(method: string, params?: unknown): Promise<unknown> {
		await this.attach();
		return this._debugger.sendCommand(method, params);
	}

	/**
	 * Write a single cookie via `Network.setCookie`. Returns `{ ok: true }`
	 * on success, or `{ ok: false, error }` with the CDP error message.
	 */
	async writeCookie(params: Record<string, unknown>): Promise<ICookieWriteResult> {
		try {
			const result = await this.sendCommand('Network.setCookie', params) as { success?: boolean };
			if (result.success === false) {
				return { ok: false, error: 'Network.setCookie returned success:false' };
			}
			return { ok: true };
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			getLogger().warn(`Network.setCookie failed: ${message}`);
			return { ok: false, error: message };
		}
	}

	/**
	 * Snapshot the entire cookie jar for this session.
	 */
	async getAllCookies(): Promise<ICdpCookie[]> {
		const result = await this.sendCommand('Network.getAllCookies') as { cookies: ICdpCookie[] };
		return result.cookies;
	}

	/**
	 * Delete a cookie by identity via `Network.deleteCookies`.
	 */
	async deleteCookie(identity: ICookieIdentity): Promise<void> {
		await this.sendCommand('Network.deleteCookies', {
			name: identity.name,
			url: identity.url,
			domain: identity.domain,
			path: identity.path
		});
	}
}

// Re-export pure helpers from the zero-dependency module so existing callers
// (orchestrator, clear module) continue to work without import changes.
// Tests that only need these helpers should import directly from
// browserCookieImportHelpers.ts to avoid pulling in the electron dependency.
export { cookieIdentityUrl, buildSetCookieParams } from './browserCookieImportHelpers.js';
