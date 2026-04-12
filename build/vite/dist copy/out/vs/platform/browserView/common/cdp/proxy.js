/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Disposable, DisposableMap } from '../../../../base/common/lifecycle.js';
import { Emitter } from '../../../../base/common/event.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { CDPError, CDPErrorCode, CDPServerError, CDPMethodNotFoundError, CDPInvalidParamsError } from './types.js';
/**
 * CDP protocol handler for browser-level connections.
 * Manages Browser.* and Target.* domains, routes page-level commands
 * to the appropriate attached session by sessionId.
 */
export class CDPBrowserProxy extends Disposable {
    constructor(browserTarget) {
        super();
        this.browserTarget = browserTarget;
        this.sessionId = `browser-session-${generateUuid()}`;
        // Browser session state
        this._isAttachedToBrowserTarget = false;
        this._autoAttach = false;
        this._discover = false;
        this._targets = this._register(new TargetManager());
        // sessionId -> ICDPConnection (keyed by real session ID from target)
        this._sessions = this._register(new DisposableMap());
        this._sessionTargetIds = new WeakMap();
        // Only auto-attach once per target.
        this._autoAttachments = new WeakMap();
        // CDP method handlers map
        this._handlers = new Map([
            // Browser.* methods (https://chromedevtools.github.io/devtools-protocol/tot/Browser/)
            ['Browser.addPrivacySandboxCoordinatorKeyConfig', () => ({})],
            ['Browser.addPrivacySandboxEnrollmentOverride', () => ({})],
            ['Browser.close', () => ({})],
            ['Browser.getVersion', () => this.browserTarget.getVersion()],
            ['Browser.resetPermissions', () => ({})],
            ['Browser.getWindowForTarget', (p, s) => this.handleBrowserGetWindowForTarget(p, s)],
            ['Browser.setDownloadBehavior', () => ({})],
            ['Browser.setWindowBounds', () => ({})],
            // Target.* methods (https://chromedevtools.github.io/devtools-protocol/tot/Target/)
            ['Target.activateTarget', (p) => this.handleTargetActivateTarget(p)],
            ['Target.attachToTarget', (p) => this.handleTargetAttachToTarget(p)],
            ['Target.closeTarget', (p) => this.handleTargetCloseTarget(p)],
            ['Target.createBrowserContext', () => this.handleTargetCreateBrowserContext()],
            ['Target.createTarget', (p) => this.handleTargetCreateTarget(p)],
            ['Target.detachFromTarget', (p) => this.handleTargetDetachFromTarget(p)],
            ['Target.disposeBrowserContext', (p) => this.handleTargetDisposeBrowserContext(p)],
            ['Target.getBrowserContexts', () => this.handleTargetGetBrowserContexts()],
            ['Target.getTargets', () => this.handleTargetGetTargets()],
            ['Target.setAutoAttach', (p) => this.handleTargetSetAutoAttach(p)],
            ['Target.setDiscoverTargets', (p) => this.handleTargetSetDiscoverTargets(p)],
            ['Target.attachToBrowserTarget', () => this.handleTargetAttachToBrowserTarget()],
            ['Target.getTargetInfo', (p) => this.handleTargetGetTargetInfo(p)],
        ]);
        // #region Public API
        // Events to external clients
        this._onEvent = this._register(new Emitter());
        this.onEvent = this._onEvent.event;
        this._onClose = this._register(new Emitter());
        this.onClose = this._onClose.event;
        this._onMessage = this._register(new Emitter());
        this.onMessage = this._onMessage.event;
        this._targets.onDidRegisterTarget(async ({ targetInfo }) => {
            if (this._discover) {
                this.sendBrowserEvent('Target.targetCreated', { targetInfo });
            }
            if (this._autoAttach) {
                await this.attachToTarget(targetInfo.targetId, true);
            }
        });
        this._targets.onDidUnregisterTarget(({ targetInfo }) => {
            // Close any sessions attached to the destroyed target. Snapshot first
            // to avoid mutating _sessions while iterating (onClose fires synchronously).
            const toDispose = [];
            for (const [, connection] of this._sessions) {
                if (this._sessionTargetIds.get(connection) === targetInfo.targetId) {
                    toDispose.push(connection);
                }
            }
            for (const connection of toDispose) {
                connection.dispose();
            }
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
        // Mirror typed events to the onMessage channel
        this._register(this._onEvent.event(event => {
            this._onMessage.fire(event);
        }));
    }
    /**
     * Send a CDP command and await the result.
     * Browser-level handlers (Browser.*, Target.*) are checked first.
     * Other commands are routed to the page session identified by sessionId.
     */
    async sendCommand(method, params = {}, sessionId) {
        try {
            // Browser-level command handling
            if (!sessionId ||
                sessionId === this.sessionId ||
                method.startsWith('Browser.') ||
                method.startsWith('Target.')) {
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
        }
        catch (error) {
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
    async sendMessage({ id, method, params, sessionId }) {
        return this.sendCommand(method, params, sessionId)
            .then(result => {
            this._onMessage.fire({ id, result, sessionId });
        })
            .catch((error) => {
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
    handleBrowserGetWindowForTarget({ targetId }, sessionId) {
        const resolvedTargetId = (sessionId && this.findTargetIdForSession(sessionId)) ?? targetId;
        if (!resolvedTargetId) {
            throw new CDPServerError('Unable to resolve target');
        }
        const target = this._targets.getById(resolvedTargetId);
        return this.browserTarget.getWindowForTarget(target);
    }
    handleTargetGetBrowserContexts() {
        return { browserContextIds: this.browserTarget.getBrowserContexts() };
    }
    async handleTargetCreateBrowserContext() {
        const browserContextId = await this.browserTarget.createBrowserContext();
        return { browserContextId };
    }
    async handleTargetDisposeBrowserContext({ browserContextId }) {
        await this.browserTarget.disposeBrowserContext(browserContextId);
        return {};
    }
    handleTargetAttachToBrowserTarget() {
        this._isAttachedToBrowserTarget = true;
        return { sessionId: this.sessionId };
    }
    handleTargetActivateTarget({ targetId }) {
        const target = this._targets.getById(targetId);
        return this.browserTarget.activateTarget(target);
    }
    async handleTargetSetAutoAttach({ autoAttach = false, flatten }) {
        if (!flatten) {
            throw new CDPInvalidParamsError('This implementation only supports auto-attach with flatten=true');
        }
        // Note: auto-attach only attaches to new targets, not to existing ones.
        this._autoAttach = autoAttach;
        return {};
    }
    async handleTargetSetDiscoverTargets({ discover = false }) {
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
    async handleTargetGetTargets() {
        return { targetInfos: Array.from(this._targets.getAllInfos()) };
    }
    async handleTargetGetTargetInfo({ targetId } = {}) {
        if (!targetId) {
            // No targetId specified -- return info about the browser target itself
            return { targetInfo: await this.browserTarget.getTargetInfo() };
        }
        const target = this._targets.getById(targetId);
        return { targetInfo: await target.getTargetInfo() };
    }
    async handleTargetAttachToTarget({ targetId, flatten }) {
        if (!flatten) {
            throw new CDPInvalidParamsError('This implementation only supports attachToTarget with flatten=true');
        }
        const connection = await this.attachToTarget(targetId, false);
        return { sessionId: connection.sessionId };
    }
    async handleTargetDetachFromTarget({ sessionId }) {
        const connection = this._sessions.get(sessionId);
        if (!connection) {
            throw new CDPServerError(`Session not found: ${sessionId}`);
        }
        connection.dispose();
        return {};
    }
    async handleTargetCreateTarget({ url, browserContextId }) {
        const target = await this.browserTarget.createTarget(url || 'about:blank', browserContextId);
        const targetInfo = await this._targets.register(target);
        // Playwright expects the attachment to happen before createTarget returns.
        if (this._autoAttach) {
            await this.attachToTarget(targetInfo.targetId, true);
        }
        return { targetId: targetInfo.targetId };
    }
    async handleTargetCloseTarget({ targetId }) {
        try {
            await this.browserTarget.closeTarget(this._targets.getById(targetId));
            return { success: true };
        }
        catch {
            return { success: false };
        }
    }
    // #endregion
    // #region Internal Helpers
    /** Find the targetId for a given sessionId */
    findTargetIdForSession(sessionId) {
        const connection = this._sessions.get(sessionId);
        if (!connection) {
            return undefined;
        }
        return this._sessionTargetIds.get(connection);
    }
    /** Send a browser-level event to the client */
    sendBrowserEvent(method, params) {
        const sessionId = this._isAttachedToBrowserTarget ? this.sessionId : undefined;
        this._onEvent.fire({ method, params, sessionId });
    }
    /** Attach to a target, creating a named session */
    async attachToTarget(targetId, isAutoAttach) {
        const target = this._targets.getById(targetId);
        if (isAutoAttach) {
            if (this._autoAttachments.has(target)) {
                return this._autoAttachments.get(target);
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
}
/**
 * Getting target info is an asynchronous operation, but we want to avoid emitting duplicate events
 * if the same target object is registered multiple times before getTargetInfo resolves.
 *
 * This class manages that deduplication and maintains the mapping between target objects and their resolved target info.
 */
class TargetManager extends Disposable {
    constructor() {
        super(...arguments);
        // Synchronous dedup: tracks target objects we have already started processing.
        this._knownTargets = new WeakSet();
        // target object -> targetInfo (populated async after getTargetInfo)
        this._targetInfos = new WeakMap();
        // targetId -> target object (reverse lookup, populated alongside _targetInfos)
        this._targetsByID = new Map();
        this._onDidRegisterTarget = this._register(new Emitter());
        this.onDidRegisterTarget = this._onDidRegisterTarget.event;
        this._onDidUnregisterTarget = this._register(new Emitter());
        this.onDidUnregisterTarget = this._onDidUnregisterTarget.event;
    }
    getById(targetId) {
        const target = this._targetsByID.get(targetId);
        if (!target) {
            throw new CDPServerError(`Unknown targetId: ${targetId}`);
        }
        return target;
    }
    *getAllInfos() {
        for (const target of this._targetsByID.values()) {
            yield this._targetInfos.get(target);
        }
    }
    async register(target) {
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
    async unregister(target) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJveHkuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9icm93c2VyVmlldy9jb21tb24vY2RwL3Byb3h5LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxVQUFVLEVBQUUsYUFBYSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDakYsT0FBTyxFQUFFLE9BQU8sRUFBUyxNQUFNLGtDQUFrQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUMvRCxPQUFPLEVBQWlELFFBQVEsRUFBRSxZQUFZLEVBQUUsY0FBYyxFQUFFLHNCQUFzQixFQUFFLHFCQUFxQixFQUFvRCxNQUFNLFlBQVksQ0FBQztBQUVwTjs7OztHQUlHO0FBQ0gsTUFBTSxPQUFPLGVBQWdCLFNBQVEsVUFBVTtJQTJDOUMsWUFDa0IsYUFBZ0M7UUFFakQsS0FBSyxFQUFFLENBQUM7UUFGUyxrQkFBYSxHQUFiLGFBQWEsQ0FBbUI7UUEzQ3pDLGNBQVMsR0FBRyxtQkFBbUIsWUFBWSxFQUFFLEVBQUUsQ0FBQztRQUV6RCx3QkFBd0I7UUFDaEIsK0JBQTBCLEdBQUcsS0FBSyxDQUFDO1FBQ25DLGdCQUFXLEdBQUcsS0FBSyxDQUFDO1FBQ3BCLGNBQVMsR0FBRyxLQUFLLENBQUM7UUFFVCxhQUFRLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLGFBQWEsRUFBRSxDQUFDLENBQUM7UUFFaEUscUVBQXFFO1FBQ3BELGNBQVMsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksYUFBYSxFQUEwQixDQUFDLENBQUM7UUFDeEUsc0JBQWlCLEdBQUcsSUFBSSxPQUFPLEVBQTBCLENBQUM7UUFDM0Usb0NBQW9DO1FBQ25CLHFCQUFnQixHQUFHLElBQUksT0FBTyxFQUF1QyxDQUFDO1FBRXZGLDBCQUEwQjtRQUNU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