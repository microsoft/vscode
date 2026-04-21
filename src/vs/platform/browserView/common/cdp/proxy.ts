/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { ICDPTarget, CDPRequest, CDPResponse, CDPEvent, CDPError, CDPErrorCode, CDPServerError, CDPMethodNotFoundError, CDPInvalidParamsError, ICDPConnection, ICDPBrowserTarget } from './types.js';

/**
 * CDP protocol handler for browser-level connections.
 * Manages Browser.* and Target.* domains, routes page-level commands
 * to the appropriate attached session by sessionId.
 */
export class CDPBrowserProxy extends Disposable implements ICDPConnection {
	readonly sessionId = `browser-session-${generateUuid()}`;
	get targetId() {
		return this.browserTarget.targetInfo.targetId;
	}

	// Browser session state
	private _isAttachedToBrowserTarget = false;
	private _autoAttach = false;
	private _discover = false;

	/**
	 * All sessions known to this proxy, keyed by sessionId.
	 * Includes sessions from explicit attach, proxy auto-attach,
	 * and client auto-attach children.
	 */
	private readonly _sessions = this._register(new DisposableMap<string, ICDPConnection>());
	private readonly _targets = this._register(new DisposableMap<string, ICDPTarget>());

	// Only auto-attach once per target.
	private readonly _autoAttachments = new WeakSet<ICDPTarget>();

	// CDP method handlers map
	private readonly _handlers = new Map<string, (params: unknown, sessionId?: string) => Promise<object> | object>([
		// Browser.* methods (https://chromedevtools.github.io/devtools-protocol/tot/Browser/)
		['Browser.addPrivacySandboxCoordinatorKeyConfig', () => ({})],
		['Browser.addPrivacySandboxEnrollmentOverride', () => ({})],
		['Browser.close', () => ({})],
		['Browser.getVersion', () => this.browserTarget.getVersion()],
		['Browser.resetPermissions', () => ({})],
		['Browser.getWindowForTarget', (p, s) => this.handleBrowserGetWindowForTarget(p as { targetId?: string; sessionId?: string }, s)],
		['Browser.setDownloadBehavior', () => ({})],
		['Browser.setWindowBounds', () => ({})],
		// Target.* methods (https://chromedevtools.github.io/devtools-protocol/tot/Target/)
		['Target.activateTarget', (p) => this.handleTargetActivateTarget(p as { targetId: string })],
		['Target.attachToTarget', (p) => this.handleTargetAttachToTarget(p as { targetId: string; flatten?: boolean })],
		['Target.closeTarget', (p) => this.handleTargetCloseTarget(p as { targetId: string })],
		['Target.createBrowserContext', () => this.handleTargetCreateBrowserContext()],
		['Target.createTarget', (p) => this.handleTargetCreateTarget(p as { url?: string; browserContextId?: string })],
		['Target.detachFromTarget', (p) => this.handleTargetDetachFromTarget(p as { sessionId: string })],
		['Target.disposeBrowserContext', (p) => this.handleTargetDisposeBrowserContext(p as { browserContextId: string })],
		['Target.getBrowserContexts', () => this.handleTargetGetBrowserContexts()],
		['Target.getTargets', () => this.handleTargetGetTargets()],
		['Target.setAutoAttach', (p, s) => this.handleTargetSetAutoAttach(p as { autoAttach?: boolean; flatten?: boolean }, s)],
		['Target.setDiscoverTargets', (p) => this.handleTargetSetDiscoverTargets(p as { discover?: boolean })],
		['Target.attachToBrowserTarget', () => this.handleTargetAttachToBrowserTarget()],
		['Target.getTargetInfo', (p) => this.handleTargetGetTargetInfo(p as { targetId?: string } | undefined)],
	]);

	constructor(
		private readonly browserTarget: ICDPBrowserTarget,
	) {
		super();
	}

	registerTarget(target: ICDPTarget): void {
		const targetInfo = target.targetInfo;
		if (this._targets.has(targetInfo.targetId)) {
			return;
		}
		this._targets.set(targetInfo.targetId, target);

		if (this._discover) {
			this.sendEvent('Target.targetCreated', {
				targetInfo: target.targetInfo,
			});
		}
		if (this._autoAttach && !this._autoAttachments.has(target)) {
			this._autoAttachments.add(target);
			void target.attach();
		}

		target.onClose(() => {
			this._targets.deleteAndDispose(targetInfo.targetId);
			if (this._discover) {
				this.sendEvent('Target.targetDestroyed', { targetId: targetInfo.targetId });
			}
		});

		target.onTargetInfoChanged(info => {
			if (this._discover) {
				this.sendEvent('Target.targetInfoChanged', { targetInfo: info });
			}
		});

		for (const [, session] of target.sessions) {
			this.registerSession(session, false);
		}
		target.onSessionCreated(({ session, waitingForDebugger }) => {
			this.registerSession(session, waitingForDebugger);
		});
	}

	notifySessionCreated(session: ICDPConnection, waitingForDebugger: boolean): void {
		if (this._sessions.has(session.sessionId)) {
			return; // We already know about it.
		}
		if (!session.parentSessionId) {
			return; // Created globally -- we don't care about it.
		}
		if (!this._sessions.has(session.parentSessionId)) {
			return; // Not from one of our sessions -- ignore it.
		}
		const target = this._targets.get(session.targetId);
		if (!target) {
			return; // Target isn't known -- ignore it.
		}
		target.notifySessionCreated(session, waitingForDebugger);
	}

	private registerSession(session: ICDPConnection, waitingForDebugger: boolean): void {
		if (this._sessions.has(session.sessionId)) {
			return;
		}
		this._sessions.set(session.sessionId, session);

		const target = this._targets.get(session.targetId);
		if (!target) {
			throw new CDPServerError(`Unable to resolve target for session ${session.sessionId}`);
		}

		this.sendEvent('Target.attachedToTarget', {
			sessionId: session.sessionId,
			targetInfo: target.targetInfo,
			waitingForDebugger
		}, session.parentSessionId);

		// Forward non-Target events from the session to the external client.
		// Target domain events are suppressed — the proxy emits its own
		// lifecycle events (attachedToTarget, detachedFromTarget, etc.)
		// via registerSession / onClose / sendEvent.
		session.onEvent(event => {
			if (event.method.startsWith('Target.')) {
				return;
			}
			this.sendEvent(event.method, event.params, event.sessionId ?? session.sessionId);
		});

		session.onClose(() => {
			this._sessions.deleteAndDispose(session.sessionId);

			this.sendEvent('Target.detachedFromTarget', {
				sessionId: session.sessionId,
				targetId: session.targetId
			}, session.parentSessionId);
		});
	}

	/** Send a browser-level event to the client */
	private sendEvent(method: string, params: unknown, sessionId?: string): void {
		sessionId ||= (this._isAttachedToBrowserTarget ? this.sessionId : undefined);
		this._onMessage.fire({ method, params, sessionId });
		this._onEvent.fire({ method, params, sessionId });
	}

	// #region Public API

	// Events to external clients
	private readonly _onEvent = this._register(new Emitter<CDPEvent>());
	readonly onEvent: Event<CDPEvent> = this._onEvent.event;
	private readonly _onClose = this._register(new Emitter<void>());
	readonly onClose: Event<void> = this._onClose.event;
	private readonly _onMessage = this._register(new Emitter<CDPResponse | CDPEvent>());
	readonly onMessage: Event<CDPResponse | CDPEvent> = this._onMessage.event;

	/**
	 * Send a CDP command and await the result.
	 * Browser-level handlers (Browser.*, Target.*) are checked first.
	 * Other commands are routed to the page session identified by sessionId.
	 */
	async sendCommand(method: string, params: unknown = {}, sessionId?: string): Promise<unknown> {
		try {
			// Browser-level command handling
			if (
				!sessionId ||
				sessionId === this.sessionId ||
				method.startsWith('Browser.') ||
				method.startsWith('Target.')
			) {
				const handler = this._handlers.get(method);
				if (!handler) {
					throw new CDPMethodNotFoundError(method);
				}
				return await handler(params, sessionId);
			}

			const connection = this._sessions.get(sessionId);
			if (!connection) {
				throw new CDPServerError(`Session not found: ${sessionId}`);
			}

			const result = await connection.sendCommand(method, params);
			return result ?? {};
		} catch (error) {
			if (error instanceof CDPError) {
				throw error;
			}
			throw new CDPServerError(error instanceof Error ? error.message : 'Unknown error');
		}
	}

	/**
	 * Accept a CDP request from a message-based transport (WebSocket, IPC, etc.), route it,
	 * and deliver the response or error via {@link onMessage}.
	 */
	async sendMessage({ id, method, params, sessionId }: CDPRequest): Promise<void> {
		return this.sendCommand(method, params, sessionId)
			.then(result => {
				this._onMessage.fire({ id, result, sessionId });
			})
			.catch((error: Error) => {
				this._onMessage.fire({
					id,
					error: {
						code: error instanceof CDPError ? error.code : CDPErrorCode.ServerError,
						message: error.message || 'Unknown error'
					},
					sessionId
				});
			});
	}

	// #endregion

	// #region CDP Commands

	private handleBrowserGetWindowForTarget({ targetId }: { targetId?: string }, sessionId?: string) {
		const resolvedTargetId = (sessionId && this._sessions.get(sessionId)?.targetId) ?? targetId;
		if (!resolvedTargetId) {
			throw new CDPServerError('Unable to resolve target');
		}

		const target = this._targets.get(resolvedTargetId);
		if (!target) {
			throw new CDPServerError('Unable to resolve target');
		}

		return this.browserTarget.getWindowForTarget(target);
	}

	private handleTargetGetBrowserContexts() {
		return { browserContextIds: this.browserTarget.getBrowserContexts() };
	}

	private async handleTargetCreateBrowserContext() {
		const browserContextId = await this.browserTarget.createBrowserContext();
		return { browserContextId };
	}

	private async handleTargetDisposeBrowserContext({ browserContextId }: { browserContextId: string }) {
		await this.browserTarget.disposeBrowserContext(browserContextId);
		return {};
	}

	private handleTargetAttachToBrowserTarget() {
		this.sendEvent('Target.attachedToTarget', {
			sessionId: this.sessionId,
			targetInfo: this.browserTarget.targetInfo,
			waitingForDebugger: false
		});
		this._isAttachedToBrowserTarget = true;
		return { sessionId: this.sessionId };
	}

	private handleTargetActivateTarget({ targetId }: { targetId: string }) {
		const target = this._targets.get(targetId);
		if (!target) {
			throw new CDPServerError('Unable to resolve target');
		}
		return this.browserTarget.activateTarget(target);
	}

	private async handleTargetSetAutoAttach(params: { autoAttach?: boolean; flatten?: boolean }, sessionId?: string) {
		if (sessionId && sessionId !== this.sessionId) {
			const connection = this._sessions.get(sessionId);
			if (!connection) {
				throw new CDPServerError(`Session not found: ${sessionId}`);
			}
			return connection.sendCommand('Target.setAutoAttach', params);
		}

		if (!params.flatten) {
			throw new CDPInvalidParamsError('This implementation only supports auto-attach with flatten=true');
		}

		// Proxy-level auto-attach: attach to new targets as they are registered.
		this._autoAttach = params.autoAttach ?? false;

		return {};
	}

	private async handleTargetSetDiscoverTargets({ discover = false }: { discover?: boolean }) {
		if (discover !== this._discover) {
			this._discover = discover;

			if (this._discover) {
				// Announce all existing targets
				for (const target of this._targets.values()) {
					this.sendEvent('Target.targetCreated', { targetInfo: target.targetInfo });
				}
			}
		}

		return {};
	}

	private async handleTargetGetTargets() {
		return { targetInfos: Array.from(this._targets.values()).map(target => target.targetInfo) };
	}

	private async handleTargetGetTargetInfo({ targetId }: { targetId?: string } = {}) {
		if (!targetId) {
			// No targetId specified -- return info about the browser target itself
			return { targetInfo: this.browserTarget.targetInfo };
		}

		const target = this._targets.get(targetId);
		if (!target) {
			throw new CDPServerError('Unable to resolve target');
		}
		return { targetInfo: target.targetInfo };
	}

	private async handleTargetAttachToTarget({ targetId, flatten }: { targetId: string; flatten?: boolean }) {
		if (!flatten) {
			throw new CDPInvalidParamsError('This implementation only supports attachToTarget with flatten=true');
		}

		const target = this._targets.get(targetId);
		if (!target) {
			throw new CDPServerError('Unable to resolve target');
		}
		const connection = await target.attach();
		return { sessionId: connection.sessionId };
	}

	private async handleTargetDetachFromTarget({ sessionId }: { sessionId: string }) {
		const connection = this._sessions.get(sessionId);
		if (!connection) {
			throw new CDPServerError(`Session not found: ${sessionId}`);
		}

		connection.dispose();
		return {};
	}

	private async handleTargetCreateTarget({ url, browserContextId }: { url?: string; browserContextId?: string }) {
		const target = await this.browserTarget.createTarget(url || 'about:blank', browserContextId);
		this.registerTarget(target);

		// Playwright expects the attachment to happen before createTarget returns.
		if (this._autoAttach && !this._autoAttachments.has(target)) {
			this._autoAttachments.add(target);
			await target.attach();
		}

		return { targetId: target.targetInfo.targetId };
	}

	private async handleTargetCloseTarget({ targetId }: { targetId: string }) {
		try {
			const target = this._targets.get(targetId);
			if (!target) {
				throw new CDPServerError('Unable to resolve target');
			}
			await this.browserTarget.closeTarget(target);
			return { success: true };
		} catch {
			return { success: false };
		}
	}

	// #endregion
}
