/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { ICDPTarget, CDPEvent, CDPError, CDPServerError, CDPMethodNotFoundError, CDPInvalidParamsError, ICDPConnection, CDPTargetInfo, ICDPBrowserTarget } from './types.js';

/**
 * CDP protocol handler for browser-level connections.
 * Manages Browser.* and Target.* domains, routes page-level commands
 * to the appropriate attached session by sessionId.
 */
export class CDPBrowserProxy extends Disposable implements ICDPConnection {
	readonly sessionId = `browser-session-${generateUuid()}`;

	// Browser session state
	private _isAttachedToBrowserTarget = false;
	private _autoAttach = false;
	private _discover = false;

	private readonly _targets = this._register(new TargetManager());

	// sessionId -> ICDPConnection (keyed by real session ID from target)
	private readonly _sessions = this._register(new DisposableMap<string, ICDPConnection>());
	private readonly _sessionTargetIds = new WeakMap<ICDPConnection, string>();
	// Only auto-attach once per target.
	private readonly _autoAttachments = new WeakMap<ICDPTarget, Promise<ICDPConnection>>();

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
		['Target.setAutoAttach', (p) => this.handleTargetSetAutoAttach(p as { autoAttach?: boolean; flatten?: boolean })],
		['Target.setDiscoverTargets', (p) => this.handleTargetSetDiscoverTargets(p as { discover?: boolean })],
		['Target.attachToBrowserTarget', () => this.handleTargetAttachToBrowserTarget()],
		['Target.getTargetInfo', (p) => this.handleTargetGetTargetInfo(p as { targetId?: string } | undefined)],
	]);

	constructor(
		private readonly browserTarget: ICDPBrowserTarget,
	) {
		super();

		this._targets.onDidRegisterTarget(async ({ targetInfo }) => {
			if (this._discover) {
				this.sendBrowserEvent('Target.targetCreated', { targetInfo });
			}
			if (this._autoAttach) {
				await this.attachToTarget(targetInfo.targetId, true);
			}
		});
		this._targets.onDidUnregisterTarget(async ({ targetInfo }) => {
			if (this._discover) {
				this.sendBrowserEvent('Target.targetDestroyed', { targetId: targetInfo.targetId });
			}
		});

		// Subscribe to browser target events
		this._register(this.browserTarget.onTargetCreated(target => this._targets.register(target)));
		this._register(this.browserTarget.onTargetDestroyed(target => this._targets.unregister(target)));

		// Register existing targets
		for (const target of this.browserTarget.getTargets()) {
			void this._targets.register(target);
		}
	}

	// #region Public API

	// Events to external client (ICDPConnection)
	private readonly _onEvent = this._register(new Emitter<CDPEvent>());
	readonly onEvent: Event<CDPEvent> = this._onEvent.event;
	private readonly _onClose = this._register(new Emitter<void>());
	readonly onClose: Event<void> = this._onClose.event;

	/**
	 * Send a CDP message and await the result.
	 * Browser-level handlers (Browser.*, Target.*) are checked first.
	 * Other commands are routed to the page session identified by sessionId.
	 */
	async sendMessage(method: string, params: unknown = {}, sessionId?: string): Promise<unknown> {
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

			const result = await connection.sendMessage(method, params);
			return result ?? {};
		} catch (error) {
			if (error instanceof CDPError) {
				throw error;
			}
			throw new CDPServerError(error instanceof Error ? error.message : 'Unknown error');
		}
	}

	// #endregion

	// #region CDP Commands

	private handleBrowserGetWindowForTarget({ targetId }: { targetId?: string }, sessionId?: string) {
		const resolvedTargetId = (sessionId && this.findTargetIdForSession(sessionId)) ?? targetId;
		if (!resolvedTargetId) {
			throw new CDPServerError('Unable to resolve target');
		}

		const target = this._targets.getById(resolvedTargetId);
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
		this._isAttachedToBrowserTarget = true;
		return { sessionId: this.sessionId };
	}

	private handleTargetActivateTarget({ targetId }: { targetId: string }) {
		const target = this._targets.getById(targetId);
		return this.browserTarget.activateTarget(target);
	}

	private async handleTargetSetAutoAttach({ autoAttach = false, flatten }: { autoAttach?: boolean; flatten?: boolean }) {
		if (!flatten) {
			throw new CDPInvalidParamsError('This implementation only supports auto-attach with flatten=true');
		}

		// Note: auto-attach only attaches to new targets, not to existing ones.
		this._autoAttach = autoAttach;

		return {};
	}

	private async handleTargetSetDiscoverTargets({ discover = false }: { discover?: boolean }) {
		if (discover !== this._discover) {
			this._discover = discover;

			if (this._discover) {
				// Announce all existing targets
				for (const targetInfo of this._targets.getAllInfos()) {
					this.sendBrowserEvent('Target.targetCreated', { targetInfo });
				}
			}
		}

		return {};
	}

	private async handleTargetGetTargets() {
		return { targetInfos: this._targets.getAllInfos() };
	}

	private async handleTargetGetTargetInfo({ targetId }: { targetId?: string } = {}) {
		if (!targetId) {
			// No targetId specified -- return info about the browser target itself
			return { targetInfo: await this.browserTarget.getTargetInfo() };
		}

		const target = this._targets.getById(targetId);
		return { targetInfo: await target.getTargetInfo() };
	}

	private async handleTargetAttachToTarget({ targetId, flatten }: { targetId: string; flatten?: boolean }) {
		if (!flatten) {
			throw new CDPInvalidParamsError('This implementation only supports attachToTarget with flatten=true');
		}

		const connection = await this.attachToTarget(targetId, false);
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
		const targetInfo = await this._targets.register(target);

		// Playwright expects the attachment to happen before createTarget returns.
		if (this._autoAttach) {
			await this.attachToTarget(targetInfo.targetId, true);
		}

		return { targetId: targetInfo.targetId };
	}

	private async handleTargetCloseTarget({ targetId }: { targetId: string }) {
		try {
			await this.browserTarget.closeTarget(this._targets.getById(targetId));
			return { success: true };
		} catch {
			return { success: false };
		}
	}

	// #endregion

	// #region Internal Helpers

	/** Find the targetId for a given sessionId */
	private findTargetIdForSession(sessionId: string): string | undefined {
		const connection = this._sessions.get(sessionId);
		if (!connection) {
			return undefined;
		}
		return this._sessionTargetIds.get(connection);
	}

	/** Send a browser-level event to the client */
	private sendBrowserEvent(method: string, params: unknown): void {
		const sessionId = this._isAttachedToBrowserTarget ? this.sessionId : undefined;
		this._onEvent.fire({ method, params, sessionId });
	}

	/** Attach to a target, creating a named session */
	private async attachToTarget(targetId: string, isAutoAttach: boolean): Promise<ICDPConnection> {
		const target = this._targets.getById(targetId);
		if (isAutoAttach) {
			if (this._autoAttachments.has(target)) {
				return this._autoAttachments.get(target)!;
			}
		}

		const attachmentPromise = (async () => {
			const connection = await target.attach();
			const sessionId = connection.sessionId;

			this._sessions.set(sessionId, connection);
			this._sessionTargetIds.set(connection, targetId);

			const targetInfo = await target.getTargetInfo();

			// Forward non-Target.* events to the external client, tagged with the sessionId.
			connection.onEvent(event => {
				if (!event.method.startsWith('Target.')) {
					this._onEvent.fire({
						method: event.method,
						params: event.params,
						sessionId
					});
				}
			});
			connection.onClose(() => {
				this.sendBrowserEvent('Target.detachedFromTarget', { sessionId, targetId });
				this._sessions.deleteAndDispose(sessionId);
				this._sessionTargetIds.delete(connection);

				if (this._autoAttachments.get(target) === attachmentPromise) {
					this._autoAttachments.delete(target);
				}
			});

			this.sendBrowserEvent('Target.attachedToTarget', {
				sessionId,
				targetInfo: { ...targetInfo, attached: true },

				// Normally this would be configured by the client in `Target.setAutoAttach`,
				// but Electron doesn't allow us to control this, so we hardcode it to false.
				waitingForDebugger: false
			});

			return connection;
		})();

		if (isAutoAttach) {
			this._autoAttachments.set(target, attachmentPromise);
		}

		return attachmentPromise;
	}

	// #endregion
}

/**
 * Getting target info is an asynchronous operation, but we want to avoid emitting duplicate events
 * if the same target object is registered multiple times before getTargetInfo resolves.
 *
 * This class manages that deduplication and maintains the mapping between target objects and their resolved target info.
 */
class TargetManager extends Disposable {
	// Synchronous dedup: tracks target objects we have already started processing.
	private readonly _knownTargets = new WeakSet<ICDPTarget>();
	// target object -> targetInfo (populated async after getTargetInfo)
	private readonly _targetInfos = new WeakMap<ICDPTarget, CDPTargetInfo>();
	// targetId -> target object (reverse lookup, populated alongside _targetInfos)
	private readonly _targetsByID = new Map<string, ICDPTarget>();

	private readonly _onDidRegisterTarget = this._register(new Emitter<{ target: ICDPTarget; targetInfo: CDPTargetInfo }>());
	readonly onDidRegisterTarget: Event<{ target: ICDPTarget; targetInfo: CDPTargetInfo }> = this._onDidRegisterTarget.event;
	private readonly _onDidUnregisterTarget = this._register(new Emitter<{ target: ICDPTarget; targetInfo: CDPTargetInfo }>());
	readonly onDidUnregisterTarget: Event<{ target: ICDPTarget; targetInfo: CDPTargetInfo }> = this._onDidUnregisterTarget.event;

	getById(targetId: string): ICDPTarget {
		const target = this._targetsByID.get(targetId);
		if (!target) {
			throw new CDPServerError(`Unknown targetId: ${targetId}`);
		}
		return target;
	}

	*getAllInfos(): IterableIterator<CDPTargetInfo> {
		for (const target of this._targetsByID.values()) {
			yield this._targetInfos.get(target)!;
		}
	}

	async register(target: ICDPTarget): Promise<CDPTargetInfo> {
		// Synchronous dedup - if this target object was already seen, just
		// return its info without emitting duplicate events.
		if (this._knownTargets.has(target)) {
			return target.getTargetInfo();
		}
		this._knownTargets.add(target);

		// Resolve the targetId asynchronously
		const targetInfo = await target.getTargetInfo();
		if (!this._knownTargets.has(target)) {
			// Target was unregistered before getTargetInfo resolved. Don't register or emit events.
			return targetInfo;
		}

		this._targetInfos.set(target, targetInfo);
		this._targetsByID.set(targetInfo.targetId, target);

		// Emit creation event
		this._onDidRegisterTarget.fire({ target, targetInfo });

		return targetInfo;
	}

	async unregister(target: ICDPTarget): Promise<void> {
		if (!this._knownTargets.has(target)) {
			return;
		}
		this._knownTargets.delete(target);

		const targetInfo = this._targetInfos.get(target);
		if (targetInfo) {
			this._targetInfos.delete(target);
			this._targetsByID.delete(targetInfo.targetId);
			this._onDidUnregisterTarget.fire({ target, targetInfo });
		}
	}
}
