/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Emitter } from '../../../base/common/event.js';
import { Disposable, DisposableMap } from '../../../base/common/lifecycle.js';
/**
 * Wraps a browser view's Electron debugger with per-client session management.
 *
 * Each client gets their own Electron debugger session, providing true isolation
 * just like connecting multiple DevTools clients to a real Chrome instance.
 */
export class BrowserViewDebugger extends Disposable {
    get isPaused() { return this._isPaused; }
    constructor(view, logService) {
        super();
        this.view = view;
        this.logService = logService;
        /** Map from CDP sessionId to the per-connection event emitter */
        this._sessions = this._register(new DisposableMap());
        /** Whether any attached debugger session has paused JavaScript execution. */
        this._isPaused = false;
        this._electronDebugger = view.webContents.debugger;
        // Set up message handler bound to this instance - note the sessionId parameter
        this._messageHandler = (_event, method, params, sessionId) => {
            this.routeCDPEvent(method, params, sessionId);
        };
    }
    /**
     * Attach to this debugger.
     * Creates a dedicated CDP session and returns a connection.
     * Dispose the returned connection to detach.
     */
    async attach() {
        // Ensure initialized
        await this.initialize();
        // Create a dedicated Electron session
        const result = await this._electronDebugger.sendCommand('Target.attachToTarget', {
            targetId: this._realTargetId,
            flatten: true
        });
        const sessionId = result.sessionId;
        const session = new DebugSession(sessionId, this.view, this._electronDebugger);
        this._sessions.set(sessionId, session);
        session.onClose(() => this._sessions.deleteAndDispose(sessionId));
        return session;
    }
    /**
     * Get CDP target info.
     * Initializes the debugger if not already done.
     */
    async getTargetInfo() {
        // Ensure initialized
        await this.initialize();
        const url = this.view.webContents.getURL() || 'about:blank';
        const title = this.view.webContents.getTitle() || url;
        return {
            targetId: this._realTargetId,
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
    initialize() {
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
    async discoverRealTargetId() {
        try {
            const result = await this._electronDebugger.sendCommand('Target.getTargetInfo');
            this._realTargetId = result.targetInfo.targetId;
        }
        catch (error) {
            this.logService.error(`[BrowserViewDebugger] Error discovering real targetId:`, error);
        }
    }
    /**
     * Attach to the Electron debugger
     */
    attachElectronDebugger() {
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
    routeCDPEvent(method, params, sessionId) {
        if (!sessionId) {
            // Events without a sessionId are managed at a higher level, so we can ignore them here.
            return;
        }
        // Track debugger pause state
        if (method === 'Debugger.paused') {
            this._isPaused = true;
        }
        else if (method === 'Debugger.resumed') {
            this._isPaused = false;
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
    detachElectronDebugger() {
        if (this.view.webContents.isDestroyed() || !this._electronDebugger.isAttached()) {
            return;
        }
        this._electronDebugger.removeListener('message', this._messageHandler);
        try {
            this._electronDebugger.detach();
        }
        catch (error) {
            this.logService.error(`[BrowserViewDebugger] Error detaching from WebContents:`, error);
        }
    }
    dispose() {
        this.detachElectronDebugger();
        super.dispose();
    }
}
class DebugSession extends Disposable {
    constructor(sessionId, _view, _electronDebugger) {
        super();
        this.sessionId = sessionId;
        this._view = _view;
        this._electronDebugger = _electronDebugger;
        this._onEvent = this._register(new Emitter());
        this.onEvent = this._onEvent.event;
        this.emitEvent = (event) => this._onEvent.fire(event);
        this._onClose = this._register(new Emitter());
        this.onClose = this._onClose.event;
        this._isDisposed = false;
    }
    async sendCommand(method, params, _sessionId) {
        // This crashes Electron. Don't pass it through.
        if (method === 'Emulation.setDeviceMetricsOverride') {
            return Promise.resolve({});
        }
        const result = await this._electronDebugger.sendCommand(method, params, this.sessionId);
        // Electron overrides dialog behavior in a way that this command does not auto-dismiss the dialog.
        // So we manually emit the (internal) event to dismiss open dialogs when this command is sent.
        if (method === 'Page.handleJavaScriptDialog') {
            this._view.webContents.emit('-cancel-dialogs');
        }
        return result;
    }
    dispose() {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnJvd3NlclZpZXdEZWJ1Z2dlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL2Jyb3dzZXJWaWV3L2VsZWN0cm9uLW1haW4vYnJvd3NlclZpZXdEZWJ1Z2dlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDeEQsT0FBTyxFQUFFLFVBQVUsRUFBRSxhQUFhLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUs5RTs7Ozs7R0FLRztBQUNILE1BQU0sT0FBTyxtQkFBb0IsU0FBUSxVQUFVO0lBT2xELElBQUksUUFBUSxLQUFjLE9BQU8sSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7SUFZbEQsWUFDa0IsSUFBaUIsRUFDakIsVUFBdUI7UUFFeEMsS0FBSyxFQUFFLENBQUM7UUFIUyxTQUFJLEdBQUosSUFBSSxDQUFhO1FBQ2pCLGVBQVUsR0FBVixVQUFVLENBQWE7UUFuQnpDLGlFQUFpRTtRQUNoRCxjQUFTLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLGFBQWEsRUFBd0IsQ0FBQyxDQUFDO1FBRXZGLDZFQUE2RTtRQUNyRSxjQUFTLEdBQUcsS0FBSyxDQUFDO1FBbUJ6QixJQUFJLENBQUMsaUJBQWlCLEdBQUcsSUFBSSxDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUM7UUFFbkQsK0VBQStFO1FBQy9FLElBQUksQ0FBQyxlQUFlLEdBQUcsQ0FBQyxNQUFzQixFQUFFLE1BQWMsRUFBRSxNQUFlLEVBQUUsU0FBa0IsRUFBRSxFQUFFO1lBQ3RHLElBQUksQ0FBQyxhQUFhLENBQUMsTUFBTSxFQUFFLE1BQU0sRUFBRSxTQUFTLENBQUMsQ0FBQztRQUMvQyxDQUFDLENBQUM7SUFDSCxDQUFDO0lBRUQ7Ozs7T0FJRztJQUNILEtBQUssQ0FBQyxNQUFNO1FB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