/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../base/common/event.js';
import { Disposable, DisposableMap } from '../../../base/common/lifecycle.js';
import { ILogService } from '../../log/common/log.js';
import { CDPEvent, CDPTargetInfo, ICDPConnection, ICDPTarget } from '../common/cdp/types.js';
import { BrowserView } from './browserView.js';

/**
 * Wraps a browser view's Electron debugger with per-client session management.
 *
 * Each client gets their own Electron debugger session, providing true isolation
 * just like connecting multiple DevTools clients to a real Chrome instance.
 */
export class BrowserViewDebugger extends Disposable implements ICDPTarget {

	/** Map from CDP sessionId to the per-connection event emitter */
	private readonly _sessions = this._register(new DisposableMap<string, DebugSession>());

	/**
	 * The real CDP targetId discovered from Target.getTargets().
	 * Ideally this could be fetched synchronously from the WebContents,
	 * but in practice we need to query Electron's debugger API asynchronously to find it.
	 */
	private _realTargetId: string | undefined;
	private _initializePromise: Promise<void> | undefined;
	private readonly _messageHandler: (event: Electron.Event, method: string, params: unknown, sessionId?: string) => void;
	private readonly _electronDebugger: Electron.Debugger;

	constructor(
		private readonly view: BrowserView,
		private readonly logService: ILogService
	) {
		super();

		this._electronDebugger = view.webContents.debugger;

		// Set up message handler bound to this instance - note the sessionId parameter
		this._messageHandler = (_event: Electron.Event, method: string, params: unknown, sessionId?: string) => {
			this.routeCDPEvent(method, params, sessionId);
		};
	}

	/**
	 * Attach to this debugger.
	 * Creates a dedicated CDP session and returns a connection.
	 * Dispose the returned connection to detach.
	 */
	async attach(): Promise<ICDPConnection> {
		// Ensure initialized
		await this.initialize();

		// Create a dedicated Electron session
		const result = await this._electronDebugger.sendCommand('Target.attachToTarget', {
			targetId: this._realTargetId,
			flatten: true
		}) as { sessionId: string };

		const sessionId = result.sessionId;
		const session = new DebugSession(sessionId, this._electronDebugger);
		this._sessions.set(sessionId, session);
		session.onClose(() => this._sessions.deleteAndDispose(sessionId));

		return session;
	}

	/**
	 * Get CDP target info.
	 * Initializes the debugger if not already done.
	 */
	async getTargetInfo(): Promise<CDPTargetInfo> {
		// Ensure initialized
		await this.initialize();

		const url = this.view.webContents.getURL() || 'about:blank';
		const title = this.view.webContents.getTitle() || url;

		return {
			targetId: this._realTargetId!,
			type: 'page',
			title,
			url,
			attached: this._sessions.size > 0,
			canAccessOpener: false,
			browserContextId: this.view.session.id
		};
	}

	/**
	 * Initialize the debugger early to discover the real targetId.
	 */
	private initialize(): Promise<void> {
		if (!this._initializePromise) {
			this._initializePromise = (async () => {
				this.attachElectronDebugger();
				await this.discoverRealTargetId();

				if (!this._realTargetId) {
					this._initializePromise = undefined; // Allow retry on failure
					throw new Error('Could not discover real targetId for this WebContents');
				}
			})();
		}
		return this._initializePromise;
	}

	/**
	 * Discover the real targetId for this WebContents
	 */
	private async discoverRealTargetId(): Promise<void> {
		try {
			const result = await this._electronDebugger.sendCommand('Target.getTargetInfo') as { targetInfo: CDPTargetInfo };
			this._realTargetId = result.targetInfo.targetId;
		} catch (error) {
			this.logService.error(`[BrowserViewDebugger] Error discovering real targetId:`, error);
		}
	}

	/**
	 * Attach to the Electron debugger
	 */
	private attachElectronDebugger(): void {
		if (this._electronDebugger.isAttached()) {
			return;
		}

		this._electronDebugger.attach('1.3');
		this._electronDebugger.on('message', this._messageHandler);
	}

	/**
	 * Route a CDP event to the correct connection by sessionId.
	 * Fires on the per-connection session for the proxy to handle.
	 */
	private routeCDPEvent(method: string, params: unknown, sessionId?: string): void {
		if (!sessionId) {
			// Events without a sessionId are managed at a higher level, so we can ignore them here.
			return;
		}

		// Find the session for this sessionId and fire the event
		const session = this._sessions.get(sessionId);
		if (session) {
			session.emitEvent({ method, params, sessionId });
		}
	}

	/**
	 * Detach from the Electron debugger
	 */
	private detachElectronDebugger(): void {
		if (!this._electronDebugger.isAttached()) {
			return;
		}

		this._electronDebugger.removeListener('message', this._messageHandler);
		try {
			this._electronDebugger.detach();
		} catch (error) {
			this.logService.error(`[BrowserViewDebugger] Error detaching from WebContents:`, error);
		}
	}

	override dispose(): void {
		this.detachElectronDebugger();
		super.dispose();
	}
}

class DebugSession extends Disposable implements ICDPConnection {
	private readonly _onEvent = this._register(new Emitter<CDPEvent>());
	readonly onEvent = this._onEvent.event;
	readonly emitEvent = (event: CDPEvent) => this._onEvent.fire(event);

	private readonly _onClose = this._register(new Emitter<void>());
	readonly onClose = this._onClose.event;

	private _isDisposed = false;

	constructor(
		public readonly sessionId: string,
		private readonly _electronDebugger: Electron.Debugger
	) {
		super();
	}

	async sendMessage(method: string, params?: unknown, _sessionId?: string): Promise<unknown> {
		// This crashes Electron. Don't pass it through.
		if (method === 'Emulation.setDeviceMetricsOverride') {
			return Promise.resolve({});
		}

		return this._electronDebugger.sendCommand(method, params, this.sessionId);
	}

	override dispose(): void {
		if (this._isDisposed) {
			return;
		}
		this._isDisposed = true;

		// Detach from the Electron session (fire and forget)
		this._electronDebugger.sendCommand('Target.detachFromTarget', { sessionId: this.sessionId }).catch(() => { });

		this._onClose.fire();
		super.dispose();
	}
}
