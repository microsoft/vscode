/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap, DisposableStore } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { ICDPTarget, CDPRequest, CDPResponse, CDPEvent, CDPError, CDPErrorCode, CDPServerError, CDPMethodNotFoundError, CDPInvalidParamsError, ICDPConnection, ICDPBrowserTarget } from './types.js';

/** The id of the connection's implicit root session, which needs no attach. */
const ROOT_SESSION_ID = '';

/** Per-browser-session subscription state. */
interface IBrowserSessionState {
	/** Session on which this browser session's lifecycle events are delivered. */
	lifecycleSessionId: string | undefined;
	/** Whether the session subscribed to target discovery. */
	discover: boolean;
	/**
	 * The attachments made to satisfy the session's auto-attach subscription,
	 * keyed by target, or `undefined` if it did not subscribe.
	 */
	autoAttachments: Map<ICDPTarget, Promise<ICDPConnection>> | undefined;
	/** Target sessions created through this browser session. */
	sessionIds: Set<string>;
}

/**
 * CDP protocol handler for browser-level connections.
 * Manages Browser.* and Target.* domains, routes page-level commands
 * to the appropriate attached session by sessionId.
 */
export class CDPBrowserProxy extends Disposable implements ICDPConnection {
	readonly sessionId = ROOT_SESSION_ID;
	get targetId() {
		return this.browserTarget.targetInfo.targetId;
	}

	/**
	 * Browser-level sessions, keyed by session ID.
	 *
	 * `Target.setAutoAttach` and `Target.setDiscoverTargets` are per-session in
	 * CDP, and a client observes events on the session it subscribed from, so
	 * each session's subscriptions are tracked separately. The root session is
	 * always present: it is the connection itself, which needs no attach.
	 */
	private readonly _browserSessions = new Map<string, IBrowserSessionState>([
		[ROOT_SESSION_ID, { lifecycleSessionId: undefined, discover: false, autoAttachments: undefined, sessionIds: new Set() }]
	]);

	/**
	 * All sessions known to this proxy, keyed by sessionId.
	 * Includes sessions from explicit attach, proxy auto-attach,
	 * and client auto-attach children.
	 */
	private readonly _sessions = this._register(new DisposableMap<string, ICDPConnection>());
	private readonly _targets = this._register(new DisposableMap<string, ICDPTarget>());

	/**
	 * Listeners on targets and sessions, which the proxy observes but does not
	 * own. Scoped to how long the proxy tracks each one.
	 */
	private readonly _targetListeners = this._register(new DisposableMap<string, DisposableStore>());
	private readonly _sessionListeners = this._register(new DisposableMap<string, DisposableStore>());

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
		['Target.attachToTarget', (p, s) => this.handleTargetAttachToTarget(p as { targetId: string; flatten?: boolean }, s)],
		['Target.closeTarget', (p) => this.handleTargetCloseTarget(p as { targetId: string })],
		['Target.createBrowserContext', () => this.handleTargetCreateBrowserContext()],
		['Target.createTarget', (p) => this.handleTargetCreateTarget(p as { url?: string; browserContextId?: string })],
		['Target.detachFromTarget', (p) => this.handleTargetDetachFromTarget(p as { sessionId: string })],
		['Target.disposeBrowserContext', (p) => this.handleTargetDisposeBrowserContext(p as { browserContextId: string })],
		['Target.getBrowserContexts', () => this.handleTargetGetBrowserContexts()],
		['Target.getTargets', () => this.handleTargetGetTargets()],
		['Target.setAutoAttach', (p, s) => this.handleTargetSetAutoAttach(p as { autoAttach?: boolean; flatten?: boolean }, s)],
		['Target.setDiscoverTargets', (p, s) => this.handleTargetSetDiscoverTargets(p as { discover?: boolean }, s)],
		['Target.attachToBrowserTarget', (_p, s) => this.handleTargetAttachToBrowserTarget(s)],
		['Target.getTargetInfo', (p, s) => this.handleTargetGetTargetInfo(p as { targetId?: string } | undefined, s)],
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

		const listeners = new DisposableStore();
		this._targetListeners.set(targetInfo.targetId, listeners);

		listeners.add(target.onClose(() => {
			for (const [sessionId, state] of this._browserSessions) {
				state.autoAttachments?.delete(target);
				if (state.discover) {
					this.sendEvent('Target.targetDestroyed', { targetId: targetInfo.targetId }, sessionId);
				}
			}
			this._targets.deleteAndDispose(targetInfo.targetId);
			this._targetListeners.deleteAndDispose(targetInfo.targetId);
		}));

		listeners.add(target.onTargetInfoChanged(info => {
			for (const [sessionId, state] of this._browserSessions) {
				if (state.discover) {
					this.sendEvent('Target.targetInfoChanged', { targetInfo: info }, sessionId);
				}
			}
		}));

		for (const [, session] of target.sessions) {
			this.registerSession(session, false);
		}
		listeners.add(target.onSessionCreated(({ session, waitingForDebugger, requesterSessionId }) => {
			this.registerSession(session, waitingForDebugger, requesterSessionId);
		}));

		// Announce and attach only once the listeners are in place, so a session
		// created synchronously by the attach is still correlated to its requester.
		for (const [sessionId, state] of this._browserSessions) {
			if (state.discover) {
				this.sendEvent('Target.targetCreated', { targetInfo: target.targetInfo }, sessionId);
			}
			if (state.autoAttachments) {
				void this.autoAttachTarget(target, sessionId).catch(() => { /* surfaced to the client as a failed attach */ });
			}
		}
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

	private registerSession(session: ICDPConnection, waitingForDebugger: boolean, requesterSessionId?: string): void {
		if (this._sessions.has(session.sessionId)) {
			return;
		}

		const target = this._targets.get(session.targetId);
		if (!target) {
			throw new CDPServerError(`Unable to resolve target for session ${session.sessionId}`);
		}

		const lifecycleSessionId = requesterSessionId ?? session.parentSessionId;
		const ownerSessionId = this.resolveBrowserSessionId(lifecycleSessionId);
		this._browserSessions.get(ownerSessionId)!.sessionIds.add(session.sessionId);
		this._sessions.set(session.sessionId, session);

		const listeners = new DisposableStore();
		this._sessionListeners.set(session.sessionId, listeners);

		// Forward non-Target events from the session to the external client.
		// Target domain events are suppressed — the proxy emits its own
		// lifecycle events (attachedToTarget, detachedFromTarget, etc.)
		// via registerSession / onClose / sendEvent.
		listeners.add(session.onEvent(event => {
			if (event.method.startsWith('Target.')) {
				return;
			}
			this.sendEvent(event.method, event.params, event.sessionId || session.sessionId);
		}));

		listeners.add(session.onClose(() => {
			this._browserSessions.get(ownerSessionId)?.sessionIds.delete(session.sessionId);
			this._sessions.deleteAndDispose(session.sessionId);

			this.sendEvent('Target.detachedFromTarget', {
				sessionId: session.sessionId,
				targetId: session.targetId
			}, lifecycleSessionId);
			this._sessionListeners.deleteAndDispose(session.sessionId);
		}));

		this.sendEvent('Target.attachedToTarget', {
			sessionId: session.sessionId,
			targetInfo: target.targetInfo,
			waitingForDebugger
		}, lifecycleSessionId);
	}

	private resolveBrowserSessionId(sessionId: string | undefined): string {
		if (this._browserSessions.has(sessionId ?? ROOT_SESSION_ID)) {
			return sessionId ?? ROOT_SESSION_ID;
		}
		if (sessionId) {
			for (const [browserSessionId, state] of this._browserSessions) {
				if (state.sessionIds.has(sessionId)) {
					return browserSessionId;
				}
			}
		}
		return ROOT_SESSION_ID;
	}

	/**
	 * Send an event to the client.
	 *
	 * `sessionId` is always explicit: events belong to whichever session the
	 * client subscribed from, so there is no single "current" destination to
	 * fall back on.
	 */
	private sendEvent(method: string, params: unknown, sessionId: string | undefined): void {
		const externalSessionId = sessionId === ROOT_SESSION_ID ? undefined : sessionId;
		this._onMessage.fire({ method, params, sessionId: externalSessionId });
		this._onEvent.fire({ method, params, sessionId: externalSessionId });
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
			if (sessionId !== undefined && !this._browserSessions.has(sessionId) && !this._sessions.has(sessionId)) {
				throw new CDPServerError(`Session not found: ${sessionId}`);
			}

			// Browser-level command handling
			if (
				this._browserSessions.has(sessionId ?? ROOT_SESSION_ID) ||
				method.startsWith('Browser.') ||
				method.startsWith('Target.')
			) {
				const handler = this._handlers.get(method);
				if (!handler) {
					throw new CDPMethodNotFoundError(method);
				}
				return await handler(params, sessionId);
			}

			const connection = sessionId ? this._sessions.get(sessionId) : undefined;
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

	private handleTargetAttachToBrowserTarget(sessionId?: string) {
		if (sessionId !== undefined && sessionId !== ROOT_SESSION_ID) {
			throw new CDPInvalidParamsError('This implementation only supports attachToBrowserTarget from the root session');
		}

		// Each attach is its own session, per CDP: subscriptions and detach are
		// per-session, so returning a shared ID would let one client's state and
		// teardown clobber another's.
		const browserSessionId = `browser-session-${generateUuid()}`;
		this._browserSessions.set(browserSessionId, { lifecycleSessionId: sessionId, discover: false, autoAttachments: undefined, sessionIds: new Set() });

		// Announce on the session that requested the attach, like any other attach.
		this.sendEvent('Target.attachedToTarget', {
			sessionId: browserSessionId,
			targetInfo: this.browserTarget.targetInfo,
			waitingForDebugger: false
		}, sessionId);
		return { sessionId: browserSessionId };
	}

	private handleTargetActivateTarget({ targetId }: { targetId: string }) {
		const target = this._targets.get(targetId);
		if (!target) {
			throw new CDPServerError('Unable to resolve target');
		}
		return this.browserTarget.activateTarget(target);
	}

	private async handleTargetSetAutoAttach(params: { autoAttach?: boolean; flatten?: boolean }, sessionId?: string) {
		const browserSession = this._browserSessions.get(sessionId ?? ROOT_SESSION_ID);
		if (!browserSession) {
			const connection = this._sessions.get(sessionId!);
			if (!connection) {
				throw new CDPServerError(`Session not found: ${sessionId}`);
			}
			return connection.sendCommand('Target.setAutoAttach', params);
		}

		if (!params.flatten) {
			throw new CDPInvalidParamsError('This implementation only supports auto-attach with flatten=true');
		}

		// Proxy-level auto-attach: attach to new targets as they are registered.
		if (params.autoAttach) {
			browserSession.autoAttachments ??= new Map();
			await Promise.all([...this._targets.values()].map(target => this.autoAttachTarget(target, sessionId ?? ROOT_SESSION_ID)));
		} else {
			const attachments = [...(browserSession.autoAttachments?.values() ?? [])];
			browserSession.autoAttachments = undefined;
			await Promise.all(attachments.map(async attachment => (await attachment).dispose()));
		}

		return {};
	}

	private autoAttachTarget(target: ICDPTarget, browserSessionId: string): Promise<ICDPConnection> {
		const attachments = this._browserSessions.get(browserSessionId)?.autoAttachments;
		if (!attachments) {
			throw new CDPServerError(`Auto-attach is not enabled for session ${browserSessionId}`);
		}

		const existing = attachments.get(target);
		if (existing) {
			return existing;
		}

		const attachment = target.attach(browserSessionId).catch(error => {
			if (attachments.get(target) === attachment) {
				attachments.delete(target);
			}
			throw error;
		});
		attachments.set(target, attachment);
		return attachment;
	}

	private async handleTargetSetDiscoverTargets({ discover = false }: { discover?: boolean }, sessionId?: string) {
		const browserSession = this._browserSessions.get(sessionId ?? ROOT_SESSION_ID);
		if (!browserSession) {
			throw new CDPServerError(`Session not found: ${sessionId}`);
		}

		if (discover !== browserSession.discover) {
			browserSession.discover = discover;

			if (discover) {
				// Announce all existing targets
				for (const target of this._targets.values()) {
					this.sendEvent('Target.targetCreated', { targetInfo: target.targetInfo }, sessionId);
				}
			}
		}

		return {};
	}

	private async handleTargetGetTargets() {
		return { targetInfos: Array.from(this._targets.values()).map(target => target.targetInfo) };
	}

	private async handleTargetGetTargetInfo({ targetId }: { targetId?: string } = {}, sessionId?: string) {
		targetId ??= sessionId ? this._sessions.get(sessionId)?.targetId : undefined;
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

	private async handleTargetAttachToTarget({ targetId, flatten }: { targetId: string; flatten?: boolean }, sessionId?: string) {
		if (!flatten) {
			throw new CDPInvalidParamsError('This implementation only supports attachToTarget with flatten=true');
		}

		const target = this._targets.get(targetId);
		if (!target) {
			throw new CDPServerError('Unable to resolve target');
		}
		const connection = await target.attach(sessionId);
		return { sessionId: connection.sessionId };
	}

	private async handleTargetDetachFromTarget({ sessionId }: { sessionId: string }) {
		const browserSession = this._browserSessions.get(sessionId);
		if (browserSession && sessionId !== ROOT_SESSION_ID) {
			const attachments = [...(browserSession.autoAttachments?.values() ?? [])];
			await Promise.all(attachments.map(async attachment => (await attachment).dispose()));
			for (const ownedSessionId of [...browserSession.sessionIds]) {
				this._sessions.get(ownedSessionId)?.dispose();
			}
			this.sendEvent('Target.detachedFromTarget', {
				sessionId,
				targetId: this.targetId
			}, browserSession.lifecycleSessionId);
			this._browserSessions.delete(sessionId);
			return {};
		}

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
		await Promise.all([...this._browserSessions]
			.filter(([, state]) => state.autoAttachments)
			.map(([browserSessionId]) => this.autoAttachTarget(target, browserSessionId)));

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
