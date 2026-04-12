/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var BrowserView_1;
import { WebContentsView, webContents } from 'electron';
import { Disposable } from '../../../base/common/lifecycle.js';
import { Emitter } from '../../../base/common/event.js';
import { VSBuffer } from '../../../base/common/buffer.js';
import { BrowserNewPageLocation, browserViewIsolatedWorldId, browserZoomFactors, browserZoomDefaultIndex } from '../common/browserView.js';
import { BrowserViewElementInspector } from './browserViewElementInspector.js';
import { IWindowsMainService } from '../../windows/electron-main/windows.js';
import { IAuxiliaryWindowsMainService } from '../../auxiliaryWindow/electron-main/auxiliaryWindows.js';
import { BrowserViewUri } from '../common/browserViewUri.js';
import { BrowserViewDebugger } from './browserViewDebugger.js';
import { ILogService } from '../../log/common/log.js';
import { hasKey } from '../../../base/common/types.js';
import { SCAN_CODE_STR_TO_EVENT_KEY_CODE } from '../../../base/common/keyCodes.js';
/**
 * Represents a single browser view instance with its WebContentsView and all associated logic.
 * This class encapsulates all operations and events for a single browser view.
 */
let BrowserView = class BrowserView extends Disposable {
    static { BrowserView_1 = this; }
    static { this.MAX_CONSOLE_LOG_ENTRIES = 1000; }
    constructor(id, session, createChildView, openContextMenu, options, windowsMainService, auxiliaryWindowsMainService, logService) {
        super();
        this.id = id;
        this.session = session;
        this.windowsMainService = windowsMainService;
        this.auxiliaryWindowsMainService = auxiliaryWindowsMainService;
        this.logService = logService;
        this._faviconRequestCache = new Map();
        this._lastScreenshot = undefined;
        this._lastFavicon = undefined;
        this._lastError = undefined;
        this._lastUserGestureTimestamp = -Infinity;
        this._browserZoomIndex = browserZoomDefaultIndex;
        this._isDisposed = false;
        this._consoleLogs = [];
        this._onDidNavigate = this._register(new Emitter());
        this.onDidNavigate = this._onDidNavigate.event;
        this._onDidChangeLoadingState = this._register(new Emitter());
        this.onDidChangeLoadingState = this._onDidChangeLoadingState.event;
        this._onDidChangeFocus = this._register(new Emitter());
        this.onDidChangeFocus = this._onDidChangeFocus.event;
        this._onDidChangeVisibility = this._register(new Emitter());
        this.onDidChangeVisibility = this._onDidChangeVisibility.event;
        this._onDidChangeDevToolsState = this._register(new Emitter());
        this.onDidChangeDevToolsState = this._onDidChangeDevToolsState.event;
        this._onDidKeyCommand = this._register(new Emitter());
        this.onDidKeyCommand = this._onDidKeyCommand.event;
        this._onDidChangeTitle = this._register(new Emitter());
        this.onDidChangeTitle = this._onDidChangeTitle.event;
        this._onDidChangeFavicon = this._register(new Emitter());
        this.onDidChangeFavicon = this._onDidChangeFavicon.event;
        this._onDidRequestNewPage = this._register(new Emitter());
        this.onDidRequestNewPage = this._onDidRequestNewPage.event;
        this._onDidFindInPage = this._register(new Emitter());
        this.onDidFindInPage = this._onDidFindInPage.event;
        this._onDidClose = this._register(new Emitter());
        this.onDidClose = this._onDidClose.event;
        const webPreferences = {
            ...options?.webPreferences,
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            webviewTag: false,
            session: this.session.electronSession,
            // TODO@kycutler: Remove this once https://github.com/electron/electron/issues/42578 is fixed
            type: 'browserView'
        };
        this._view = new WebContentsView({
            webPreferences,
            // Passing an `undefined` webContents triggers an error in Electron.
            ...(options?.webContents ? { webContents: options.webContents } : {})
        });
        this._view.setBackgroundColor('#FFFFFF');
        this._view.webContents.setWindowOpenHandler((details) => {
            const location = (() => {
                switch (details.disposition) {
                    case 'background-tab': return BrowserNewPageLocation.Background;
                    case 'foreground-tab': return BrowserNewPageLocation.Foreground;
                    case 'new-window': return BrowserNewPageLocation.NewWindow;
                    default: return undefined;
                }
            })();
            if (!location || !this.consumePopupPermission(location)) {
                // Eventually we may want to surface this. For now, just silently block it.
                return { action: 'deny' };
            }
            return {
                action: 'allow',
                createWindow: (options) => {
                    const childView = createChildView(options);
                    const resource = BrowserViewUri.forId(childView.id);
                    // Fire event for the workbench to open this view
                    this._onDidRequestNewPage.fire({
                        resource,
                        url: details.url,
                        location,
                        position: { x: options.x, y: options.y, width: options.width, height: options.height }
                    });
                    // Return the webContents so Electron can complete the window.open() call
                    return childView.webContents;
                }
            };
        });
        this._view.webContents.on('context-menu', (_event, params) => {
            openContextMenu(this, params);
        });
        this._view.webContents.on('destroyed', () => {
            this.dispose();
        });
        this._debugger = new BrowserViewDebugger(this, this.logService);
        this._inspector = this._register(new BrowserViewElementInspector(this));
        this.setupEventListeners();
    }
    setupEventListeners() {
        const webContents = this._view.webContents;
        // DevTools state events
        webContents.on('devtools-opened', () => {
            this._onDidChangeDevToolsState.fire({ isDevToolsOpen: true });
        });
        webContents.on('devtools-closed', () => {
            this._onDidChangeDevToolsState.fire({ isDevToolsOpen: false });
        });
        // Favicon events
        webContents.on('page-favicon-updated', async (_event, favicons) => {
            // try each url in order until one works
            for (const url of favicons) {
                if (!this._faviconRequestCache.has(url)) {
                    this._faviconRequestCache.set(url, (async () => {
                        if (url.startsWith('data:image/')) {
                            return url;
                        }
                        const response = await webContents.session.fetch(url, {
                            cache: 'force-cache'
                        });
                        if (!response.ok) {
                            throw new Error(`Failed to fetch favicon: ${response.status} ${response.statusText}`);
                        }
                        const type = await response.headers.get('content-type');
                        if (!type?.startsWith('image/')) {
                            throw new Error(`Favicon is not an image: ${type}`);
                        }
                        const buffer = await response.arrayBuffer();
                        return `data:${type};base64,${Buffer.from(buffer).toString('base64')}`;
                    })());
                }
                try {
                    this._lastFavicon = await this._faviconRequestCache.get(url);
                    this._onDidChangeFavicon.fire({ favicon: this._lastFavicon });
                    // On success, stop searching
                    return;
                }
                catch (e) {
                    // On failure, just try the next one
                }
            }
            // If we searched all favicons and none worked, clear the favicon
            if (this._lastFavicon) {
                this._lastFavicon = undefined;
                this._onDidChangeFavicon.fire({ favicon: this._lastFavicon });
            }
        });
        // Title events
        webContents.on('page-title-updated', (_event, title) => {
            this._onDidChangeTitle.fire({ title });
        });
        const fireNavigationEvent = () => {
            const url = webContents.getURL();
            this._onDidNavigate.fire({
                url,
                title: webContents.getTitle(),
                canGoBack: webContents.navigationHistory.canGoBack(),
                canGoForward: webContents.navigationHistory.canGoForward(),
                certificateError: this.session.trust.getCertificateError(url)
            });
        };
        const fireLoadingEvent = (loading) => {
            this._onDidChangeLoadingState.fire({ loading, error: this._lastError });
        };
        // Loading state events
        webContents.on('did-start-loading', () => {
            this._lastError = undefined;
            fireLoadingEvent(true);
        });
        webContents.on('did-stop-loading', () => fireLoadingEvent(false));
        webContents.on('did-fail-load', (e, errorCode, errorDescription, validatedURL, isMainFrame) => {
            if (isMainFrame) {
                // Ignore ERR_ABORTED (-3) which is the expected error when user stops a page load.
                if (errorCode === -3) {
                    fireLoadingEvent(false);
                    return;
                }
                this._lastError = {
                    url: validatedURL,
                    errorCode,
                    errorDescription,
                    // -200 - -220 are the range of certificate errors in Chromium.
                    certificateError: errorCode <= -200 && errorCode >= -220 ? this.session.trust.getCertificateError(validatedURL) : undefined
                };
                fireLoadingEvent(false);
                this._onDidNavigate.fire({
                    url: validatedURL,
                    title: '',
                    canGoBack: webContents.navigationHistory.canGoBack(),
                    canGoForward: webContents.navigationHistory.canGoForward(),
                    certificateError: this.session.trust.getCertificateError(validatedURL)
                });
            }
        });
        webContents.on('did-finish-load', () => fireLoadingEvent(false));
        this.session.trust.installCertErrorHandler(webContents);
        webContents.on('render-process-gone', (_event, details) => {
            this._lastError = {
                url: webContents.getURL(),
                errorCode: details.exitCode,
                errorDescription: `Render process gone: ${details.reason}`
            };
            fireLoadingEvent(false);
        });
        // Navigation events (when URL actually changes)
        webContents.on('did-navigate', fireNavigationEvent);
        webContents.on('did-navigate-in-page', fireNavigationEvent);
        webContents.on('did-navigate', () => {
            // Chromium resets the zoom factor to its per-origin default (100%) when
            // navigating to a new document. Re-apply our stored zoom to override it.
            this._consoleLogs.length = 0; // Clear console logs on navigation since they are per-page
            this._view.webContents.setZoomFactor(browserZoomFactors[this._browserZoomIndex]);
            // Enable pinch-to-zoom
            void this._view.webContents.setVisualZoomLevelLimits(1, 3).catch(error => {
                this.logService.error('Failed to set visual zoom level limits for browser view webContents.', error);
            });
        });
        // Focus events
        webContents.on('focus', () => {
            this._onDidChangeFocus.fire({ focused: true });
        });
        webContents.on('blur', () => {
            this._onDidChangeFocus.fire({ focused: false });
        });
        // Forward key down events that weren't handled by the page to the workbench for shortcut handling.
        webContents.ipc.on('vscode:browserView:keydown', (_event, keyEvent) => {
            this._onDidKeyCommand.fire(keyEvent);
        });
        // If the page won't be able to handle events, forward key down events directly.
        webContents.on('before-input-event', (event, input) => {
            if (input.type !== 'keyDown') {
                return;
            }
            const pageIsAvailable = this._view.getVisible()
                && !webContents.isCrashed()
                && !this._debugger.isPaused;
            if (pageIsAvailable) {
                return;
            }
            // This logic should mirror that in preload-browserView.ts.
            if (!(input.control || input.alt || input.meta) && input.key.length === 1) {
                return;
            }
            event.preventDefault();
            const eventKeyCode = SCAN_CODE_STR_TO_EVENT_KEY_CODE[input.code] || 0;
            this._onDidKeyCommand.fire({
                key: input.key,
                keyCode: eventKeyCode,
                code: input.code,
                ctrlKey: input.control,
                shiftKey: input.shift,
                altKey: input.alt,
                metaKey: input.meta,
                repeat: input.isAutoRepeat
            });
        });
        // Track user gestures for popup blocking logic.
        // Roughly based on https://html.spec.whatwg.org/multipage/interaction.html#tracking-user-activation.
        webContents.on('input-event', (_event, input) => {
            switch (input.type) {
                case 'rawKeyDown':
                case 'keyDown':
                case 'mouseDown':
                case 'pointerDown':
                case 'pointerUp':
                case 'touchEnd':
                    this._lastUserGestureTimestamp = Date.now();
            }
        });
        // For now, always prevent sites from blocking unload.
        // In the future we may want to show a dialog to ask the user,
        // with heavy restrictions regarding interaction and repeated prompts.
        webContents.on('will-prevent-unload', (e) => {
            e.preventDefault();
        });
        // Find in page events
        webContents.on('found-in-page', (_event, result) => {
            this._onDidFindInPage.fire({
                activeMatchOrdinal: result.activeMatchOrdinal,
                matches: result.matches,
                selectionArea: result.selectionArea,
                finalUpdate: result.finalUpdate
            });
        });
        // Capture console messages for sharing with chat
        this._view.webContents.on('console-message', (event) => {
            this._consoleLogs.push(`[${event.level}] ${event.message}`);
            if (this._consoleLogs.length > BrowserView_1.MAX_CONSOLE_LOG_ENTRIES) {
                this._consoleLogs.splice(0, this._consoleLogs.length - BrowserView_1.MAX_CONSOLE_LOG_ENTRIES);
            }
        });
    }
    consumePopupPermission(location) {
        switch (location) {
            case BrowserNewPageLocation.Foreground:
            case BrowserNewPageLocation.Background:
                return true;
            case BrowserNewPageLocation.NewWindow:
                // Each user gesture allows one popup window within 1 second
                if (this._lastUserGestureTimestamp > Date.now() - 1000) {
                    this._lastUserGestureTimestamp = -Infinity;
                    return true;
                }
                return false;
        }
    }
    get webContents() {
        return this._view.webContents;
    }
    /**
     * Get the current state of this browser view
     */
    getState() {
        const webContents = this._view.webContents;
        const url = webContents.getURL();
        return {
            url,
            title: webContents.getTitle(),
            canGoBack: webContents.navigationHistory.canGoBack(),
            canGoForward: webContents.navigationHistory.canGoForward(),
            loading: webContents.isLoading(),
            focused: webContents.isFocused(),
            visible: this._view.getVisible(),
            isDevToolsOpen: webContents.isDevToolsOpened(),
            lastScreenshot: this._lastScreenshot,
            lastFavicon: this._lastFavicon,
            lastError: this._lastError,
            certificateError: this.session.trust.getCertificateError(url),
            storageScope: this.session.storageScope,
            browserZoomIndex: this._browserZoomIndex
        };
    }
    /**
     * Toggle developer tools for this browser view.
     */
    toggleDevTools() {
        this._view.webContents.toggleDevTools();
    }
    /**
     * Update the layout bounds of this view
     */
    layout(bounds) {
        if (this._window?.win?.id !== bounds.windowId) {
            const newWindow = this._windowById(bounds.windowId);
            if (newWindow) {
                this._window?.win?.contentView.removeChildView(this._view);
                this._window = newWindow;
                newWindow.win?.contentView.addChildView(this._view);
            }
        }
        this._view.setBorderRadius(Math.round(bounds.cornerRadius * bounds.zoomFactor));
        this._view.setBounds({
            x: Math.round(bounds.x * bounds.zoomFactor),
            y: Math.round(bounds.y * bounds.zoomFactor),
            width: Math.round(bounds.width * bounds.zoomFactor),
            height: Math.round(bounds.height * bounds.zoomFactor)
        });
    }
    setBrowserZoomIndex(zoomIndex) {
        this._browserZoomIndex = Math.max(0, Math.min(zoomIndex, browserZoomFactors.length - 1));
        const browserZoomFactor = browserZoomFactors[this._browserZoomIndex];
        this._view.webContents.setZoomFactor(browserZoomFactor);
    }
    /**
     * Set the visibility of this view
     */
    setVisible(visible) {
        if (this._view.getVisible() === visible) {
            return;
        }
        // If the view is focused, pass focus back to the window when hiding
        if (!visible && this._view.webContents.isFocused()) {
            this._window?.win?.webContents.focus();
        }
        this._view.setVisible(visible);
        this._onDidChangeVisibility.fire({ visible });
    }
    /**
     * Get captured console logs.
     */
    getConsoleLogs() {
        return this._consoleLogs.join('\n');
    }
    /**
     * Start element inspection mode. Sets up a CDP overlay that highlights elements
     * on hover. When the user clicks, the element data is returned and the overlay is removed.
     * @param token Cancellation token to abort the inspection.
     */
    async getElementData(token) {
        return this._inspector.getElementData(token);
    }
    /**
     * Get element data for the currently focused element.
     */
    async getFocusedElementData() {
        return this._inspector.getFocusedElementData();
    }
    /**
     * Load a URL in this view
     */
    async loadURL(url) {
        await this._view.webContents.loadURL(url);
    }
    /**
     * Get the current URL
     */
    getURL() {
        return this._view.webContents.getURL();
    }
    /**
     * Navigate back in history
     */
    goBack() {
        if (this._view.webContents.navigationHistory.canGoBack()) {
            this._view.webContents.navigationHistory.goBack();
        }
    }
    /**
     * Navigate forward in history
     */
    goForward() {
        if (this._view.webContents.navigationHistory.canGoForward()) {
            this._view.webContents.navigationHistory.goForward();
        }
    }
    /**
     * Reload the current page
     */
    reload(hard) {
        if (hard) {
            this._view.webContents.reloadIgnoringCache();
        }
        else {
            this._view.webContents.reload();
        }
    }
    /**
     * Check if the view can navigate back
     */
    canGoBack() {
        return this._view.webContents.navigationHistory.canGoBack();
    }
    /**
     * Check if the view can navigate forward
     */
    canGoForward() {
        return this._view.webContents.navigationHistory.canGoForward();
    }
    /**
     * Capture a screenshot of this view
     */
    async captureScreenshot(options) {
        const quality = options?.quality ?? 80;
        if (options?.pageRect) {
            const zoomFactor = this._view.webContents.getZoomFactor();
            // The visual viewport scale accounts for pinch-to-zoom magnification, which is separate from the regular zoom factor.
            const visualViewportScale = await this._inspector.getVisualViewportScale();
            options.screenRect = {
                x: options.pageRect.x * visualViewportScale * zoomFactor,
                y: options.pageRect.y * visualViewportScale * zoomFactor,
                width: options.pageRect.width * visualViewportScale * zoomFactor,
                height: options.pageRect.height * visualViewportScale * zoomFactor
            };
        }
        const image = await this._view.webContents.capturePage(options?.screenRect, {
            stayHidden: true
        });
        const buffer = image.toJPEG(quality);
        const screenshot = VSBuffer.wrap(buffer);
        // Only update _lastScreenshot if capturing the full view
        if (!options?.screenRect) {
            this._lastScreenshot = screenshot;
        }
        return screenshot;
    }
    /**
     * Focus this view
     */
    async focus() {
        this._view.webContents.focus();
    }
    /**
     * Find text in the page
     */
    async findInPage(text, options) {
        this._view.webContents.findInPage(text, {
            matchCase: options?.matchCase ?? false,
            forward: options?.forward ?? true,
            // `findNext` is not very clearly named. From Electron docs: `Whether to begin a new text finding session with this request`.
            // It needs to be set to `true` if we want a new search to be performed, such as when the text changes.
            // We name it `recompute` in our internal options to better reflect its purpose / behavior.
            findNext: options?.recompute ?? false
        });
    }
    /**
     * Stop finding in page
     */
    async stopFindInPage(keepSelection) {
        this._view.webContents.stopFindInPage(keepSelection ? 'keepSelection' : 'clearSelection');
    }
    /**
     * Get the currently selected text in the browser view.
     * Returns immediately with empty string if the page is still loading.
     */
    async getSelectedText() {
        // we don't want to wait for the page to finish loading, which executeJavaScript normally does.
        if (this._view.webContents.isLoading()) {
            return '';
        }
        try {
            // Uses our preloaded contextBridge-exposed API.
            return await this._view.webContents.executeJavaScriptInIsolatedWorld(browserViewIsolatedWorldId, [{ code: 'window.browserViewAPI?.getSelectedText?.() ?? ""' }]);
        }
        catch {
            return '';
        }
    }
    /**
     * Clear all storage data for this browser view's session
     */
    async clearStorage() {
        await this.session.clearData();
    }
    /**
     * Trust a certificate for a given host and reload the page.
     */
    async trustCertificate(host, fingerprint) {
        await this.session.trust.trustCertificate(host, fingerprint);
        this._view.webContents.reload();
    }
    /**
     * Revoke trust for a previously trusted certificate and close the view.
     */
    async untrustCertificate(host, fingerprint) {
        await this.session.trust.untrustCertificate(host, fingerprint);
        this.dispose();
    }
    /**
     * Get the underlying WebContentsView
     */
    getWebContentsView() {
        return this._view;
    }
    /**
     * Get the hosting Electron window for this view, if any.
     * This can be an auxiliary window, depending on where the view is currently hosted.
     */
    getElectronWindow() {
        return this._window?.win ?? undefined;
    }
    /**
     * Get the main code window hosting this browser view, if any. This is used for routing commands from the browser view to the correct window.
     * If the browser view is hosted in an auxiliary window, this will return the parent code window of that auxiliary window.
     */
    getTopCodeWindow() {
        return this._window && hasKey(this._window, { parentId: true }) ? this._codeWindowById(this._window.parentId) : undefined;
    }
    // ============ ICDPTarget implementation ============
    /**
     * Get CDP target info using Electron's real targetId.
     */
    getTargetInfo() {
        return this._debugger.getTargetInfo();
    }
    /**
     * Attach to receive debugger events.
     * @returns A connection that can be disposed to detach
     */
    attach() {
        return this._debugger.attach();
    }
    dispose() {
        if (this._isDisposed) {
            return;
        }
        this._isDisposed = true;
        // Dispose debugger. This detaches debug sessions first.
        this._debugger.dispose();
        // Remove from parent window
        this._window?.win?.contentView.removeChildView(this._view);
        // Fire close event BEFORE disposing emitters. This signals the view has been destroyed.
        this._onDidClose.fire();
        // Clean up the view and all its event listeners
        if (!this._view.webContents.isDestroyed()) {
            this._view.webContents.close({ waitForBeforeUnload: false });
        }
        super.dispose();
    }
    _windowById(windowId) {
        return this._codeWindowById(windowId) ?? this._auxiliaryWindowById(windowId);
    }
    _codeWindowById(windowId) {
        if (typeof windowId !== 'number') {
            return undefined;
        }
        return this.windowsMainService.getWindowById(windowId);
    }
    _auxiliaryWindowById(windowId) {
        if (typeof windowId !== 'number') {
            return undefined;
        }
        const contents = webContents.fromId(windowId);
        if (!contents) {
            return undefined;
        }
        return this.auxiliaryWindowsMainService.getWindowByWebContents(contents);
    }
};
BrowserView = BrowserView_1 = __decorate([
    __param(5, IWindowsMainService),
    __param(6, IAuxiliaryWindowsMainService),
    __param(7, ILogService)
], BrowserView);
export { BrowserView };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnJvd3NlclZpZXcuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9icm93c2VyVmlldy9lbGVjdHJvbi1tYWluL2Jyb3dzZXJWaWV3LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsZUFBZSxFQUFFLFdBQVcsRUFBRSxNQUFNLFVBQVUsQ0FBQztBQUN4RCxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDL0QsT0FBTyxFQUFFLE9BQU8sRUFBUyxNQUFNLCtCQUErQixDQUFDO0FBQy9ELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUUxRCxPQUFPLEVBQW1hLHNCQUFzQixFQUFFLDBCQUEwQixFQUFFLGtCQUFrQixFQUFFLHVCQUF1QixFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFFNWlCLE9BQU8sRUFBRSwyQkFBMkIsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQy9FLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBRTdFLE9BQU8sRUFBRSw0QkFBNEIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQ3ZHLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUM3RCxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUMvRCxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFJdEQsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ3ZELE9BQU8sRUFBRSwrQkFBK0IsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBRW5GOzs7R0FHRztBQUNJLElBQU0sV0FBVyxHQUFqQixNQUFNLFdBQVksU0FBUSxVQUFVOzthQWVsQiw0QkFBdUIsR0FBRyxJQUFJLEFBQVAsQ0FBUTtJQW9DdkQsWUFDaUIsRUFBVSxFQUNWLE9BQXVCLEVBQ3ZDLGVBQXNGLEVBQ3RGLGVBQWdGLEVBQ2hGLE9BQStELEVBQzFDLGtCQUF3RCxFQUMvQywyQkFBMEUsRUFDM0YsVUFBd0M7UUFFckQsS0FBSyxFQUFFLENBQUM7UUFUUSxPQUFFLEdBQUYsRUFBRSxDQUFRO1FBQ1YsWUFBTyxHQUFQLE9BQU8sQ0FBZ0I7UUFJRCx1QkFBa0IsR0FBbEIsa0JBQWtCLENBQXFCO1FBQzlCLGdDQUEyQixHQUEzQiwyQkFBMkIsQ0FBOEI7UUFDMUUsZUFBVSxHQUFWLFVBQVUsQ0FBYTtRQXpEckMseUJBQW9CLEdBQUcsSUFBSSxHQUFHLEVBQTJCLENBQUM7UUFFbkUsb0JBQWUsR0FBeUIsU0FBUyxDQUFDO1FBQ2xELGlCQUFZLEdBQXVCLFNBQVMsQ0FBQztRQUM3QyxlQUFVLEdBQXNDLFNBQVMsQ0FBQztRQUMxRCw4QkFBeUIsR0FBVyxDQUFDLFFBQVEsQ0FBQztRQUM5QyxzQkFBaUIsR0FBVyx1QkFBdUIsQ0FBQztRQUtwRCxnQkFBVyxHQUFHLEtBQUssQ0FBQztRQUdYLGlCQUFZLEdBQWEsRUFBRSxDQUFDO1FBRTVCLG1CQUFjLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLE9BQU8sRUFBK0IsQ0FBQyxDQUFDO1FBQ3BGLGtCQUFhLEdBQXVDLElBQUksQ0FBQyxjQUFjLENBQUMsS0FBSyxDQUFDO1FBRXRFLDZCQUF3QixHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLEVBQTRCLENBQUMsQ0FBQztRQUMzRiw0QkFBdUIsR0FBb0MsSUFBSSxDQUFDLHdCQUF3QixDQUFDLEtBQUssQ0FBQztRQUV2RixzQkFBaUIsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksT0FBTyxFQUEwQixDQUFDLENBQUM7UUFDbEYscUJBQWdCLEdBQWtDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxLQUFLLENBQUM7UUFFdkUsMkJBQXNCLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLE9BQU8sRUFBK0IsQ0FBQyxDQUFDO1FBQzVGLDBCQUFxQixHQUF1QyxJQUFJLENBQUMsc0JBQXNCLENBQUMsS0FBSyxDQUFDO1FBRXRGLDhCQUF5QixHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLEVBQWtDLENBQUMsQ0FBQztRQUNsRyw2QkFBd0IsR0FBMEMsSUFBSSxDQUFDLHlCQUF5QixDQUFDLEtBQUssQ0FBQztRQUUvRixxQkFBZ0IsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksT0FBTyxFQUE0QixDQUFDLENBQUM7UUFDbkYsb0JBQWUsR0FBb0MsSUFBSSxDQUFDLGdCQUFnQixDQUFDLEtBQUssQ0FBQztRQUV2RSxzQkFBaUIsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksT0FBTyxFQUFnQyxDQUFDLENBQUM7UUFDeEYscUJBQWdCLEdBQXdDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxLQUFLLENBQUM7UUFFN0Usd0JBQW1CLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLE9BQU8sRUFBa0MsQ0FBQyxDQUFDO1FBQzVGLHVCQUFrQixHQUEwQyxJQUFJLENBQUMsbUJBQW1CLENBQUMsS0FBSyxDQUFDO1FBRW5GLHlCQUFvQixHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLEVBQThCLENBQUMsQ0FBQztRQUN6Rix3QkFBbUIsR0FBc0MsSUFBSSxDQUFDLG9CQUFvQixDQUFDLEtBQUssQ0FBQztRQUVqRixxQkFBZ0IsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksT0FBTyxFQUFnQyxDQUFDLENBQUM7UUFDdkYsb0JBQWUsR0FBd0MsSUFBSSxDQUFDLGdCQUFnQixDQUFDLEtBQUssQ0FBQztRQUUzRSxnQkFBVyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLEVBQVEsQ0FBQyxDQUFDO1FBQzFELGVBQVUsR0FBZ0IsSUFBSSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUM7UUFjekQsTUFBTSxjQUFjLEdBQW9GO1lBQ3ZHLEdBQUcsT0FBTyxFQUFFLGNBQWM7WUFFMUIsZUFBZSxFQUFFLEtBQUs7WUFDdEIsZ0JBQWdCLEVBQUUsSUFBSTtZQUN0QixPQUFPLEVBQUUsSUFBSTtZQUNiLFVBQVUsRUFBRSxLQUFLO1lBQ2pCLE9BQU8sRUFBRSxJQUFJLENBQUMsT0FBTyxDQUFDLGVBQWU7WUFFckMsNkZBQTZGO1lBQzdGLElBQUksRUFBRSxhQUFhO1NBQ25CLENBQUM7UUFFRixJQUFJLENBQUMsS0FBSyxHQUFHLElBQUksZUFBZSxDQUFDO1lBQ2hDLGNBQWM7WUFDZCxvRUFBb0U7WUFDcEUsR0FBRyxDQUFDLE9BQU8sRUFBRSxXQUFXLENBQUMsQ0FBQyxDQUFDLEVBQUUsV0FBVyxFQUFFLE9BQU8sQ0FBQyxXQUFXLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO1NBQ3JFLENBQUMsQ0FBQztRQUNILElBQUksQ0FBQyxLQUFLLENBQUMsa0JBQWtCLENBQUMsU0FBUyxDQUFDLENBQUM7UUFFekMsSUFBSSxDQUFDLEtBQUssQ0FBQyxXQUFXLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxPQUFPLEVBQUUsRUFBRTtZQUN2RCxNQUFNLFFBQVEsR0FBRyxDQUFDLEdBQUcsRUFBRTtnQkFDdEIsUUFBUSxPQUFPLENBQUMsV0FBVyxFQUFFLENBQUM7b0JBQzdCLEtBQUssZ0JBQWdCLENBQUMsQ0FBQyxPQUFPLHNCQUFzQixDQUFDLFVBQVUsQ0FBQztvQkFDaEUsS0FBSyxnQkFBZ0IsQ0FBQyxDQUFDLE9BQU8sc0JBQXNCLENBQUMsVUFBVSxDQUFDO29CQUNoRSxLQUFLLFlBQVksQ0FBQyxDQUFDLE9BQU8sc0JBQXNCLENBQUMsU0FBUyxDQUFDO29CQUMzRCxPQUFPLENBQUMsQ0FBQyxPQUFPLFNBQVMsQ0FBQztnQkFDM0IsQ0FBQztZQUNGLENBQUMsQ0FBQyxFQUFFLENBQUM7WUFFTCxJQUFJLENBQUMsUUFBUSxJQUFJLENBQUMsSUFBSSxDQUFDLHNCQUFzQixDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUM7Z0JBQ3pELDJFQUEyRTtnQkFDM0UsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLEVBQUUsQ0FBQztZQUMzQixDQUFDO1lBRUQsT0FBTztnQkFDTixNQUFNLEVBQUUsT0FBTztnQkFDZixZQUFZLEVBQUUsQ0FBQyxPQUFPLEVBQUUsRUFBRTtvQkFDekIsTUFBTSxTQUFTLEdBQUcsZUFBZSxDQUFDLE9BQU8sQ0FBQyxDQUFDO29CQUMzQyxNQUFNLFFBQVEsR0FBRyxjQUFjLENBQUMsS0FBSyxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUMsQ0FBQztvQkFFcEQsaURBQWlEO29CQUNqRCxJQUFJLENBQUMsb0JBQW9CLENBQUMsSUFBSSxDQUFDO3dCQUM5QixRQUFRO3dCQUNSLEdBQUcsRUFBRSxPQUFPLENBQUMsR0FBRzt3QkFDaEIsUUFBUTt3QkFDUixRQUFRLEVBQUUsRUFBRSxDQUFDLEVBQUUsT0FBTyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsT0FBTyxDQUFDLENBQUMsRUFBRSxLQUFLLEVBQUUsT0FBTyxDQUFDLEtBQUssRUFBRSxNQUFNLEVBQUUsT0FBTyxDQUFDLE1BQU0sRUFBRTtxQkFDdEYsQ0FBQyxDQUFDO29CQUVILHlFQUF5RTtvQkFDekUsT0FBTyxTQUFTLENBQUMsV0FBVyxDQUFDO2dCQUM5QixDQUFDO2FBQ0QsQ0FBQztRQUNILENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLEtBQUssQ0FBQyxXQUFXLENBQUMsRUFBRSxDQUFDLGNBQWMsRUFBRSxDQUFDLE1BQU0sRUFBRSxNQUFNLEVBQUUsRUFBRTtZQUM1RCxlQUFlLENBQUMsSUFBSSxFQUFFLE1BQU0sQ0FBQyxDQUFDO1FBQy9CLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLEtBQUssQ0FBQyxXQUFXLENBQUMsRUFBRSxDQUFDLFdBQVcsRUFBRSxHQUFHLEVBQUU7WUFDM0MsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ2hCLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLFNBQVMsR0FBRyxJQUFJLG1CQUFtQixDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDaEUsSUFBSSxDQUFDLFVBQVUsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksMkJBQTJCLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztRQUV4RSxJQUFJLENBQUMsbUJBQW1CLEVBQUUsQ0FBQztJQUM1QixDQUFDO0lBRU8sbUJBQW1CO1FBQzFCLE1BQU0sV0FBVyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsV0FBVyxDQUFDO1FBRTNDLHdCQUF3QjtRQUN4QixXQUFXLENBQUMsRUFBRSxDQUFDLGlCQUFpQixFQUFFLEdBQUcsRUFBRTtZQUN0QyxJQUFJLENBQUMseUJBQXlCLENBQUMsSUFBSSxDQUFDLEVBQUUsY0FBYyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7UUFDL0QsQ0FBQyxDQUFDLENBQUM7UUFFSCxXQUFXLENBQUMsRUFBRSxDQUFDLGlCQUFpQixFQUFFLEdBQUcsRUFBRTtZQUN0QyxJQUFJLENBQUMseUJBQXlCLENBQUMsSUFBSSxDQUFDLEVBQUUsY0FBYyxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUM7UUFDaEUsQ0FBQyxDQUFDLENBQUM7UUFFSCxpQkFBaUI7UUFDakIsV0FBVyxDQUFDLEVBQUUsQ0FBQyxzQkFBc0IsRUFBRSxLQUFLLEVBQUUsTUFBTSxFQUFFLFFBQVEsRUFBRSxFQUFFO1lBQ2pFLHdDQUF3QztZQUN4QyxLQUFLLE1BQU0sR0FBRyxJQUFJLFFBQVEsRUFBRSxDQUFDO2dCQUM1QixJQUFJLENBQUMsSUFBSSxDQUFDLG9CQUFvQixDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDO29CQUN6QyxJQUFJLENBQUMsb0JBQW9CLENBQUMsR0FBRyxDQUFDLEdBQUcsRUFBRSxDQUFDLEtBQUssSUFBSSxFQUFFO3dCQUM5QyxJQUFJLEdBQUcsQ0FBQyxVQUFVLENBQUMsYUFBYSxDQUFDLEVBQUUsQ0FBQzs0QkFDbkMsT0FBTyxHQUFHLENBQUM7d0JBQ1osQ0FBQzt3QkFDRCxNQUFNLFFBQVEsR0FBRyxNQUFNLFdBQVcsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLEdBQUcsRUFBRTs0QkFDckQsS0FBSyxFQUFFLGFBQWE7eUJBQ3BCLENBQUMsQ0FBQzt3QkFDSCxJQUFJLENBQUMsUUFBUSxDQUFDLEVBQUUsRUFBRSxDQUFDOzRCQUNsQixNQUFNLElBQUksS0FBSyxDQUFDLDRCQUE0QixRQUFRLENBQUMsTUFBTSxJQUFJLFFBQVEsQ0FBQyxVQUFVLEVBQUUsQ0FBQyxDQUFDO3dCQUN2RixDQUFDO3dCQUNELE1BQU0sSUFBSSxHQUFHLE1BQU0sUUFBUSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsY0FBYyxDQUFDLENBQUM7d0JBQ3hELElBQUksQ0FBQyxJQUFJLEVBQUUsVUFBVSxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUM7NEJBQ2pDLE1BQU0sSUFBSSxLQUFLLENBQUMsNEJBQTRCLElBQUksRUFBRSxDQUFDLENBQUM7d0JBQ3JELENBQUM7d0JBQ0QsTUFBTSxNQUFNLEdBQUcsTUFBTSxRQUFRLENBQUMsV0FBVyxFQUFFLENBQUM7d0JBRTVDLE9BQU8sUUFBUSxJQUFJLFdBQVcsTUFBTSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQztvQkFDeEUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUNQLENBQUM7Z0JBRUQsSUFBSSxDQUFDO29CQUNKLElBQUksQ0FBQyxZQUFZLEdBQUcsTUFBTSxJQUFJLENBQUMsb0JBQW9CLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBRSxDQUFDO29CQUM5RCxJQUFJLENBQUMsbUJBQW1CLENBQUMsSUFBSSxDQUFDLEVBQUUsT0FBTyxFQUFFLElBQUksQ0FBQyxZQUFZLEVBQUUsQ0FBQyxDQUFDO29CQUM5RCw2QkFBNkI7b0JBQzdCLE9BQU87Z0JBQ1IsQ0FBQztnQkFBQyxPQUFPLENBQUMsRUFBRSxDQUFDO29CQUNaLG9DQUFvQztnQkFDckMsQ0FBQztZQUNGLENBQUM7WUFFRCxpRUFBaUU7WUFDakUsSUFBSSxJQUFJLENBQUMsWUFBWSxFQUFFLENBQUM7Z0JBQ3ZCLElBQUksQ0FBQyxZQUFZLEdBQUcsU0FBUyxDQUFDO2dCQUM5QixJQUFJLENBQUMsbUJBQW1CLENBQUMsSUFBSSxDQUFDLEVBQUUsT0FBTyxFQUFFLElBQUksQ0FBQyxZQUFZLEVBQUUsQ0FBQyxDQUFDO1lBQy9ELENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQztRQUVILGVBQWU7UUFDZixXQUFXLENBQUMsRUFBRSxDQUFDLG9CQUFvQixFQUFFLENBQUMsTUFBTSxFQUFFLEtBQUssRUFBRSxFQUFFO1lBQ3RELElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDO1FBQ3hDLENBQUMsQ0FBQyxDQUFDO1FBRUgsTUFBTSxtQkFBbUIsR0FBRyxHQUFHLEVBQUU7WUFDaEMsTUFBTSxHQUFHLEdBQUcsV0FBVyxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ2pDLElBQUksQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDO2dCQUN4QixHQUFHO2dCQUNILEtBQUssRUFBRSxXQUFXLENBQUMsUUFBUSxFQUFFO2dCQUM3QixTQUFTLEVBQUUsV0FBVyxDQUFDLGlCQUFpQixDQUFDLFNBQVMsRUFBRTtnQkFDcEQsWUFBWSxFQUFFLFdBQVcsQ0FBQyxpQkFBaUIsQ0FBQyxZQUFZLEVBQUU7Z0JBQzFELGdCQUFnQixFQUFFLElBQUksQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLG1CQUFtQixDQUFDLEdBQUcsQ0FBQzthQUM3RCxDQUFDLENBQUM7UUFDSixDQUFDLENBQUM7UUFFRixNQUFNLGdCQUFnQixHQUFHLENBQUMsT0FBZ0IsRUFBRSxFQUFFO1lBQzdDLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxJQUFJLENBQUMsRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQyxDQUFDO1FBQ3pFLENBQUMsQ0FBQztRQUVGLHVCQUF1QjtRQUN2QixXQUFXLENBQUMsRUFBRSxDQUFDLG1CQUFtQixFQUFFLEdBQUcsRUFBRTtZQUN4QyxJQUFJLENBQUMsVUFBVSxHQUFHLFNBQVMsQ0FBQztZQUM1QixnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUN4QixDQUFDLENBQUMsQ0FBQztRQUNILFdBQVcsQ0FBQyxFQUFFLENBQUMsa0JBQWtCLEVBQUUsR0FBRyxFQUFFLENBQUMsZ0JBQWdCLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztRQUNsRSxXQUFXLENBQUMsRUFBRSxDQUFDLGVBQWUsRUFBRSxDQUFDLENBQUMsRUFBRSxTQUFTLEVBQUUsZ0JBQWdCLEVBQUUsWUFBWSxFQUFFLFdBQVcsRUFBRSxFQUFFO1lBQzdGLElBQUksV0FBVyxFQUFFLENBQUM7Z0JBQ2pCLG1GQUFtRjtnQkFDbkYsSUFBSSxTQUFTLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQztvQkFDdEIsZ0JBQWdCLENBQUMsS0FBSyxDQUFDLENBQUM7b0JBQ3hCLE9BQU87Z0JBQ1IsQ0FBQztnQkFFRCxJQUFJLENBQUMsVUFBVSxHQUFHO29CQUNqQixHQUFHLEVBQUUsWUFBWTtvQkFDakIsU0FBUztvQkFDVCxnQkFBZ0I7b0JBQ2hCLCtEQUErRDtvQkFDL0QsZ0JBQWdCLEVBQUUsU0FBUyxJQUFJLENBQUMsR0FBRyxJQUFJLFNBQVMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsbUJBQW1CLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVM7aUJBQzNILENBQUM7Z0JBRUYsZ0JBQWdCLENBQUMsS0FBSyxDQUFDLENBQUM7Z0JBQ3hCLElBQUksQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDO29CQUN4QixHQUFHLEVBQUUsWUFBWTtvQkFDakIsS0FBSyxFQUFFLEVBQUU7b0JBQ1QsU0FBUyxFQUFFLFdBQVcsQ0FBQyxpQkFBaUIsQ0FBQyxTQUFTLEVBQUU7b0JBQ3BELFlBQVksRUFBRSxXQUFXLENBQUMsaUJBQWlCLENBQUMsWUFBWSxFQUFFO29CQUMxRCxnQkFBZ0IsRUFBRSxJQUFJLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxtQkFBbUIsQ0FBQyxZQUFZLENBQUM7aUJBQ3RFLENBQUMsQ0FBQztZQUNKLENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQztRQUNILFdBQVcsQ0FBQyxFQUFFLENBQUMsaUJBQWlCLEVBQUUsR0FBRyxFQUFFLENBQUMsZ0JBQWdCLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztRQUVqRSxJQUFJLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyx1QkFBdUIsQ0FBQyxXQUFXLENBQUMsQ0FBQztRQUV4RCxXQUFXLENBQUMsRUFBRSxDQUFDLHFCQUFxQixFQUFFLENBQUMsTUFBTSxFQUFFLE9BQU8sRUFBRSxFQUFFO1lBQ3pELElBQUksQ0FBQyxVQUFVLEdBQUc7Z0JBQ2pCLEdBQUcsRUFBRSxXQUFXLENBQUMsTUFBTSxFQUFFO2dCQUN6QixTQUFTLEVBQUUsT0FBTyxDQUFDLFFBQVE7Z0JBQzNCLGdCQUFnQixFQUFFLHdCQUF3QixPQUFPLENBQUMsTUFBTSxFQUFFO2FBQzFELENBQUM7WUFFRixnQkFBZ0IsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUN6QixDQUFDLENBQUMsQ0FBQztRQUVILGdEQUFnRDtRQUNoRCxXQUFXLENBQUMsRUFBRSxDQUFDLGNBQWMsRUFBRSxtQkFBbUIsQ0FBQyxDQUFDO1FBQ3BELFdBQVcsQ0FBQyxFQUFFLENBQUMsc0JBQXNCLEVBQUUsbUJBQW1CLENBQUMsQ0FBQztRQUU1RCxXQUFXLENBQUMsRUFBRSxDQUFDLGNBQWMsRUFBRSxHQUFHLEVBQUU7WUFDbkMsd0VBQXdFO1lBQ3hFLHlFQUF5RTtZQUN6RSxJQUFJLENBQUMsWUFBWSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQywyREFBMkQ7WUFDekYsSUFBSSxDQUFDLEtBQUssQ0FBQyxXQUFXLENBQUMsYUFBYSxDQUFDLGtCQUFrQixDQUFDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLENBQUM7WUFFakYsdUJBQXVCO1lBQ3ZCLEtBQUssSUFBSSxDQUFDLEtBQUssQ0FBQyxXQUFXLENBQUMsd0JBQXdCLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsRUFBRTtnQkFDeEUsSUFBSSxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsc0VBQXNFLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDdEcsQ0FBQyxDQUFDLENBQUM7UUFDSixDQUFDLENBQUMsQ0FBQztRQUVILGVBQWU7UUFDZixXQUFXLENBQUMsRUFBRSxDQUFDLE9BQU8sRUFBRSxHQUFHLEVBQUU7WUFDNUIsSUFBSSxDQUFDLGlCQUFpQixDQUFDLElBQUksQ0FBQyxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO1FBQ2hELENBQUMsQ0FBQyxDQUFDO1FBRUgsV0FBVyxDQUFDLEVBQUUsQ0FBQyxNQUFNLEVBQUUsR0FBRyxFQUFFO1lBQzNCLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQztRQUNqRCxDQUFDLENBQUMsQ0FBQztRQUVILG1HQUFtRztRQUNuRyxXQUFXLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyw0QkFBNEIsRUFBRSxDQUFDLE1BQU0sRUFBRSxRQUFrQyxFQUFFLEVBQUU7WUFDL0YsSUFBSSxDQUFDLGdCQUFnQixDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUN0QyxDQUFDLENBQUMsQ0FBQztRQUNILGdGQUFnRjtRQUNoRixXQUFXLENBQUMsRUFBRSxDQUFDLG9CQUFvQixFQUFFLENBQUMsS0FBSyxFQUFFLEtBQUssRUFBRSxFQUFFO1lBQ3JELElBQUksS0FBSyxDQUFDLElBQUksS0FBSyxTQUFTLEVBQUUsQ0FBQztnQkFDOUIsT0FBTztZQUNSLENBQUM7WUFFRCxNQUFNLGVBQWUsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLFVBQVUsRUFBRTttQkFDM0MsQ0FBQyxXQUFXLENBQUMsU0FBUyxFQUFFO21CQUN4QixDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDO1lBQzdCLElBQUksZUFBZSxFQUFFLENBQUM7Z0JBQ3JCLE9BQU87WUFDUixDQUFDO1lBRUQsMkRBQTJEO1lBQzNELElBQUksQ0FBQyxDQUFDLEtBQUssQ0FBQyxPQUFPLElBQUksS0FBSyxDQUFDLEdBQUcsSUFBSSxLQUFLLENBQUMsSUFBSSxDQUFDLElBQUksS0FBSyxDQUFDLEdBQUcsQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFLENBQUM7Z0JBQzNFLE9BQU87WUFDUixDQUFDO1lBRUQsS0FBSyxDQUFDLGNBQWMsRUFBRSxDQUFDO1lBRXZCLE1BQU0sWUFBWSxHQUFHLCtCQUErQixDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDdEUsSUFBSSxDQUFDLGdCQUFnQixDQUFDLElBQUksQ0FBQztnQkFDMUIsR0FBRyxFQUFFLEtBQUssQ0FBQyxHQUFHO2dCQUNkLE9BQU8sRUFBRSxZQUFZO2dCQUNyQixJQUFJLEVBQUUsS0FBSyxDQUFDLElBQUk7Z0JBQ2hCLE9BQU8sRUFBRSxLQUFLLENBQUMsT0FBTztnQkFDdEIsUUFBUSxFQUFFLEtBQUssQ0FBQyxLQUFLO2dCQUNyQixNQUFNLEVBQUUsS0FBSyxDQUFDLEdBQUc7Z0JBQ2pCLE9BQU8sRUFBRSxLQUFLLENBQUMsSUFBSTtnQkFDbkIsTUFBTSxFQUFFLEtBQUssQ0FBQyxZQUFZO2FBQzFCLENBQUMsQ0FBQztRQUNKLENBQUMsQ0FBQyxDQUFDO1FBRUgsZ0RBQWdEO1FBQ2hELHFHQUFxRztRQUNyRyxXQUFXLENBQUMsRUFBRSxDQUFDLGFBQWEsRUFBRSxDQUFDLE1BQU0sRUFBRSxLQUFLLEVBQUUsRUFBRTtZQUMvQyxRQUFRLEtBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQztnQkFDcEIsS0FBSyxZQUFZLENBQUM7Z0JBQ2xCLEtBQUssU0FBUyxDQUFDO2dCQUNmLEtBQUssV0FBVyxDQUFDO2dCQUNqQixLQUFLLGFBQWEsQ0FBQztnQkFDbkIsS0FBSyxXQUFXLENBQUM7Z0JBQ2pCLEtBQUssVUFBVTtvQkFDZCxJQUFJLENBQUMseUJBQXlCLEdBQUcsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDO1lBQzlDLENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQztRQUVILHNEQUFzRDtRQUN0RCw4REFBOEQ7UUFDOUQsc0VBQXNFO1FBQ3RFLFdBQVcsQ0FBQyxFQUFFLENBQUMscUJBQXFCLEVBQUUsQ0FBQyxDQUFDLEVBQUUsRUFBRTtZQUMzQyxDQUFDLENBQUMsY0FBYyxFQUFFLENBQUM7UUFDcEIsQ0FBQyxDQUFDLENBQUM7UUFFSCxzQkFBc0I7UUFDdEIsV0FBVyxDQUFDLEVBQUUsQ0FBQyxlQUFlLEVBQUUsQ0FBQyxNQUFNLEVBQUUsTUFBTSxFQUFFLEVBQUU7WUFDbEQsSUFBSSxDQUFDLGdCQUFnQixDQUFDLElBQUksQ0FBQztnQkFDMUIsa0JBQWtCLEVBQUUsTUFBTSxDQUFDLGtCQUFrQjtnQkFDN0MsT0FBTyxFQUFFLE1BQU0sQ0FBQyxPQUFPO2dCQUN2QixhQUFhLEVBQUUsTUFBTSxDQUFDLGFBQWE7Z0JBQ25DLFdBQVcsRUFBRSxNQUFNLENBQUMsV0FBVzthQUMvQixDQUFDLENBQUM7UUFDSixDQUFDLENBQUMsQ0FBQztRQUVILGlEQUFpRDtRQUNqRCxJQUFJLENBQUMsS0FBSyxDQUFDLFdBQVcsQ0FBQyxFQUFFLENBQUMsaUJBQWlCLEVBQUUsQ0FBQyxLQUFLLEVBQUUsRUFBRTtZQUN0RCxJQUFJLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxJQUFJLEtBQUssQ0FBQyxLQUFLLEtBQUssS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUM7WUFDNUQsSUFBSSxJQUFJLENBQUMsWUFBWSxDQUFDLE1BQU0sR0FBRyxhQUFXLENBQUMsdUJBQXVCLEVBQUUsQ0FBQztnQkFDcEUsSUFBSSxDQUFDLFlBQVksQ0FBQyxNQUFNLENBQUMsQ0FBQyxFQUFFLElBQUksQ0FBQyxZQUFZLENBQUMsTUFBTSxHQUFHLGFBQVcsQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDO1lBQzdGLENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQztJQUNKLENBQUM7SUFFTyxzQkFBc0IsQ0FBQyxRQUFnQztRQUM5RCxRQUFRLFFBQVEsRUFBRSxDQUFDO1lBQ2xCLEtBQUssc0JBQXNCLENBQUMsVUFBVSxDQUFDO1lBQ3ZDLEtBQUssc0JBQXNCLENBQUMsVUFBVTtnQkFDckMsT0FBTyxJQUFJLENBQUM7WUFDYixLQUFLLHNCQUFzQixDQUFDLFNBQVM7Z0JBQ3BDLDREQUE0RDtnQkFDNUQsSUFBSSxJQUFJLENBQUMseUJBQXlCLEdBQUcsSUFBSSxDQUFDLEdBQUcsRUFBRSxHQUFHLElBQUksRUFBRSxDQUFDO29CQUN4RCxJQUFJLENBQUMseUJBQXlCLEdBQUcsQ0FBQyxRQUFRLENBQUM7b0JBQzNDLE9BQU8sSUFBSSxDQUFDO2dCQUNiLENBQUM7Z0JBRUQsT0FBTyxLQUFLLENBQUM7UUFDZixDQUFDO0lBQ0YsQ0FBQztJQUVELElBQUksV0FBVztRQUNkLE9BQU8sSUFBSSxDQUFDLEtBQUssQ0FBQyxXQUFXLENBQUM7SUFDL0IsQ0FBQztJQUVEOztPQUVHO0lBQ0gsUUFBUTtRQUNQLE1BQU0sV0FBVyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsV0FBVyxDQUFDO1FBQzNDLE1BQU0sR0FBRyxHQUFHLFdBQVcsQ0FBQyxNQUFNLEVBQUUsQ0FBQztRQUVqQyxPQUFPO1lBQ04sR0FBRztZQUNILEtBQUssRUFBRSxXQUFXLENBQUMsUUFBUSxFQUFFO1lBQzdCLFNBQVMsRUFBRSxXQUFXLENBQUMsaUJBQWlCLENBQUMsU0FBUyxFQUFFO1lBQ3BELFlBQVksRUFBRSxXQUFXLENBQUMsaUJBQWlCLENBQUMsWUFBWSxFQUFFO1lBQzFELE9BQU8sRUFBRSxXQUFXLENBQUMsU0FBUyxFQUFFO1lBQ2hDLE9BQU8sRUFBRSxXQUFXLENBQUMsU0FBUyxFQUFFO1lBQ2hDLE9BQU8sRUFBRSxJQUFJLENBQUMsS0FBSyxDQUFDLFVBQVUsRUFBRTtZQUNoQyxjQUFjLEVBQUUsV0FBVyxDQUFDLGdCQUFnQixFQUFFO1lBQzlDLGNBQWMsRUFBRSxJQUFJLENBQUMsZUFBZTtZQUNwQyxXQUFXLEVBQUUsSUFBSSxDQUFDLFlBQVk7WUFDOUIsU0FBUyxFQUFFLElBQUksQ0FBQyxVQUFVO1lBQzFCLGdCQUFnQixFQUFFLElBQUksQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLG1CQUFtQixDQUFDLEdBQUcsQ0FBQztZQUM3RCxZQUFZLEVBQUUsSUFBSSxDQUFDLE9BQU8sQ0FBQyxZQUFZO1lBQ3ZDLGdCQUFnQixFQUFFLElBQUksQ0FBQyxpQkFBaUI7U0FDeEMsQ0FBQztJQUNILENBQUM7SUFFRDs7T0FFRztJQUNILGNBQWM7UUFDYixJQUFJLENBQUMsS0FBSyxDQUFDLFdBQVcsQ0FBQyxjQUFjLEVBQUUsQ0FBQztJQUN6QyxDQUFDO0lBRUQ7O09BRUc7SUFDSCxNQUFNLENBQUMsTUFBMEI7UUFDaEMsSUFBSSxJQUFJLENBQUMsT0FBTyxFQUFFLEdBQUcsRUFBRSxFQUFFLEtBQUssTUFBTSxDQUFDLFFBQVEsRUFBRSxDQUFDO1lBQy9DLE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBQ3BELElBQUksU0FBUyxFQUFFLENBQUM7Z0JBQ2YsSUFBSSxDQUFDLE9BQU8sRUFBRSxHQUFHLEVBQUUsV0FBVyxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7Z0JBQzNELElBQUksQ0FBQyxPQUFPLEdBQUcsU0FBUyxDQUFDO2dCQUN6QixTQUFTLENBQUMsR0FBRyxFQUFFLFdBQVcsQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ3JELENBQUM7UUFDRixDQUFDO1FBRUQsSUFBSSxDQUFDLEtBQUssQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsWUFBWSxHQUFHLE1BQU0sQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDO1FBQ2hGLElBQUksQ0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDO1lBQ3BCLENBQUMsRUFBRSxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDLEdBQUcsTUFBTSxDQUFDLFVBQVUsQ0FBQztZQUMzQyxDQUFDLEVBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQyxHQUFHLE1BQU0sQ0FBQyxVQUFVLENBQUM7WUFDM0MsS0FBSyxFQUFFLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLEtBQUssR0FBRyxNQUFNLENBQUMsVUFBVSxDQUFDO1lBQ25ELE1BQU0sRUFBRSxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDLFVBQVUsQ0FBQztTQUNyRCxDQUFDLENBQUM7SUFDSixDQUFDO0lBRUQsbUJBQW1CLENBQUMsU0FBaUI7UUFDcEMsSUFBSSxDQUFDLGlCQUFpQixHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLElBQUksQ0FBQyxHQUFHLENBQUMsU0FBUyxFQUFFLGtCQUFrQixDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3pGLE1BQU0saUJBQWlCLEdBQUcsa0JBQWtCLENBQUMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLENBQUM7UUFDckUsSUFBSSxDQUFDLEtBQUssQ0FBQyxXQUFXLENBQUMsYUFBYSxDQUFDLGlCQUFpQixDQUFDLENBQUM7SUFDekQsQ0FBQztJQUVEOztPQUVHO0lBQ0gsVUFBVSxDQUFDLE9BQWdCO1FBQzFCLElBQUksSUFBSSxDQUFDLEtBQUssQ0FBQyxVQUFVLEVBQUUsS0FBSyxPQUFPLEVBQUUsQ0FBQztZQUN6QyxPQUFPO1FBQ1IsQ0FBQztRQUVELG9FQUFvRTtRQUNwRSxJQUFJLENBQUMsT0FBTyxJQUFJLElBQUksQ0FBQyxLQUFLLENBQUMsV0FBVyxDQUFDLFNBQVMsRUFBRSxFQUFFLENBQUM7WUFDcEQsSUFBSSxDQUFDLE9BQU8sRUFBRSxHQUFHLEVBQUUsV0FBVyxDQUFDLEtBQUssRUFBRSxDQUFDO1FBQ3hDLENBQUM7UUFFRCxJQUFJLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUMvQixJQUFJLENBQUMsc0JBQXNCLENBQUMsSUFBSSxDQUFDLEVBQUUsT0FBTyxFQUFFLENBQUMsQ0FBQztJQUMvQyxDQUFDO0lBRUQ7O09BRUc7SUFDSCxjQUFjO1FBQ2IsT0FBTyxJQUFJLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUNyQyxDQUFDO0lBRUQ7Ozs7T0FJRztJQUNILEtBQUssQ0FBQyxjQUFjLENBQUMsS0FBd0I7UUFDNUMsT0FBTyxJQUFJLENBQUMsVUFBVSxDQUFDLGNBQWMsQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUM5QyxDQUFDO0lBRUQ7O09BRUc7SUFDSCxLQUFLLENBQUMscUJBQXFCO1FBQzFCLE9BQU8sSUFBSSxDQUFDLFVBQVUsQ0FBQyxxQkFBcUIsRUFBRSxDQUFDO0lBQ2hELENBQUM7SUFFRDs7T0FFRztJQUNILEtBQUssQ0FBQyxPQUFPLENBQUMsR0FBVztRQUN4QixNQUFNLElBQUksQ0FBQyxLQUFLLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUMzQyxDQUFDO0lBRUQ7O09BRUc7SUFDSCxNQUFNO1FBQ0wsT0FBTyxJQUFJLENBQUMsS0FBSyxDQUFDLFdBQVcsQ0FBQyxNQUFNLEVBQUUsQ0FBQztJQUN4QyxDQUFDO0lBRUQ7O09BRUc7SUFDSCxNQUFNO1FBQ0wsSUFBSSxJQUFJLENBQUMsS0FBSyxDQUFDLFdBQVcsQ0FBQyxpQkFBaUIsQ0FBQyxTQUFTLEVBQUUsRUFBRSxDQUFDO1lBQzFELElBQUksQ0FBQyxLQUFLLENBQUMsV0FBVyxDQUFDLGlCQUFpQixDQUFDLE1BQU0sRUFBRSxDQUFDO1FBQ25ELENBQUM7SUFDRixDQUFDO0lBRUQ7O09BRUc7SUFDSCxTQUFTO1FBQ1IsSUFBSSxJQUFJLENBQUMsS0FBSyxDQUFDLFdBQVcsQ0FBQyxpQkFBaUIsQ0FBQyxZQUFZLEVBQUUsRUFBRSxDQUFDO1lBQzdELElBQUksQ0FBQyxLQUFLLENBQUMsV0FBVyxDQUFDLGlCQUFpQixDQUFDLFNBQVMsRUFBRSxDQUFDO1FBQ3RELENBQUM7SUFDRixDQUFDO0lBRUQ7O09BRUc7SUFDSCxNQUFNLENBQUMsSUFBYztRQUNwQixJQUFJLElBQUksRUFBRSxDQUFDO1lBQ1YsSUFBSSxDQUFDLEtBQUssQ0FBQyxXQUFXLENBQUMsbUJBQW1CLEVBQUUsQ0FBQztRQUM5QyxDQUFDO2FBQU0sQ0FBQztZQUNQLElBQUksQ0FBQyxLQUFLLENBQUMsV0FBVyxDQUFDLE1BQU0sRUFBRSxDQUFDO1FBQ2pDLENBQUM7SUFDRixDQUFDO0lBRUQ7O09BRUc7SUFDSCxTQUFTO1FBQ1IsT0FBTyxJQUFJLENBQUMsS0FBSyxDQUFDLFdBQVcsQ0FBQyxpQkFBaUIsQ0FBQyxTQUFTLEVBQUUsQ0FBQztJQUM3RCxDQUFDO0lBRUQ7O09BRUc7SUFDSCxZQUFZO1FBQ1gsT0FBTyxJQUFJLENBQUMsS0FBSyxDQUFDLFdBQVcsQ0FBQyxpQkFBaUIsQ0FBQyxZQUFZLEVBQUUsQ0FBQztJQUNoRSxDQUFDO0lBRUQ7O09BRUc7SUFDSCxLQUFLLENBQUMsaUJBQWlCLENBQUMsT0FBOEM7UUFDckUsTUFBTSxPQUFPLEdBQUcsT0FBTyxFQUFFLE9BQU8sSUFBSSxFQUFFLENBQUM7UUFDdkMsSUFBSSxPQUFPLEVBQUUsUUFBUSxFQUFFLENBQUM7WUFDdkIsTUFBTSxVQUFVLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxXQUFXLENBQUMsYUFBYSxFQUFFLENBQUM7WUFDMUQsc0hBQXNIO1lBQ3RILE1BQU0sbUJBQW1CLEdBQUcsTUFBTSxJQUFJLENBQUMsVUFBVSxDQUFDLHNCQUFzQixFQUFFLENBQUM7WUFDM0UsT0FBTyxDQUFDLFVBQVUsR0FBRztnQkFDcEIsQ0FBQyxFQUFFLE9BQU8sQ0FBQyxRQUFRLENBQUMsQ0FBQyxHQUFHLG1CQUFtQixHQUFHLFVBQVU7Z0JBQ3hELENBQUMsRUFBRSxPQUFPLENBQUMsUUFBUSxDQUFDLENBQUMsR0FBRyxtQkFBbUIsR0FBRyxVQUFVO2dCQUN4RCxLQUFLLEVBQUUsT0FBTyxDQUFDLFFBQVEsQ0FBQyxLQUFLLEdBQUcsbUJBQW1CLEdBQUcsVUFBVTtnQkFDaEUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxRQUFRLENBQUMsTUFBTSxHQUFHLG1CQUFtQixHQUFHLFVBQVU7YUFDbEUsQ0FBQztRQUNILENBQUM7UUFDRCxNQUFNLEtBQUssR0FBRyxNQUFNLElBQUksQ0FBQyxLQUFLLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxPQUFPLEVBQUUsVUFBVSxFQUFFO1lBQzNFLFVBQVUsRUFBRSxJQUFJO1NBQ2hCLENBQUMsQ0FBQztRQUNILE1BQU0sTUFBTSxHQUFHLEtBQUssQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDckMsTUFBTSxVQUFVLEdBQUcsUUFBUSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUN6Qyx5REFBeUQ7UUFDekQsSUFBSSxDQUFDLE9BQU8sRUFBRSxVQUFVLEVBQUUsQ0FBQztZQUMxQixJQUFJLENBQUMsZUFBZSxHQUFHLFVBQVUsQ0FBQztRQUNuQyxDQUFDO1FBQ0QsT0FBTyxVQUFVLENBQUM7SUFDbkIsQ0FBQztJQUVEOztPQUVHO0lBQ0gsS0FBSyxDQUFDLEtBQUs7UUFDVixJQUFJLENBQUMsS0FBSyxDQUFDLFdBQVcsQ0FBQyxLQUFLLEVBQUUsQ0FBQztJQUNoQyxDQUFDO0lBRUQ7O09BRUc7SUFDSCxLQUFLLENBQUMsVUFBVSxDQUFDLElBQVksRUFBRSxPQUF1QztRQUNyRSxJQUFJLENBQUMsS0FBSyxDQUFDLFdBQVcsQ0FBQyxVQUFVLENBQUMsSUFBSSxFQUFFO1lBQ3ZDLFNBQVMsRUFBRSxPQUFPLEVBQUUsU0FBUyxJQUFJLEtBQUs7WUFDdEMsT0FBTyxFQUFFLE9BQU8sRUFBRSxPQUFPLElBQUksSUFBSTtZQUVqQyw2SEFBNkg7WUFDN0gsdUdBQXVHO1lBQ3ZHLDJGQUEyRjtZQUMzRixRQUFRLEVBQUUsT0FBTyxFQUFFLFNBQVMsSUFBSSxLQUFLO1NBQ3JDLENBQUMsQ0FBQztJQUNKLENBQUM7SUFFRDs7T0FFRztJQUNILEtBQUssQ0FBQyxjQUFjLENBQUMsYUFBdUI7UUFDM0MsSUFBSSxDQUFDLEtBQUssQ0FBQyxXQUFXLENBQUMsY0FBYyxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUMsZUFBZSxDQUFDLENBQUMsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO0lBQzNGLENBQUM7SUFFRDs7O09BR0c7SUFDSCxLQUFLLENBQUMsZUFBZTtRQUNwQiwrRkFBK0Y7UUFDL0YsSUFBSSxJQUFJLENBQUMsS0FBSyxDQUFDLFdBQVcsQ0FBQyxTQUFTLEVBQUUsRUFBRSxDQUFDO1lBQ3hDLE9BQU8sRUFBRSxDQUFDO1FBQ1gsQ0FBQztRQUNELElBQUksQ0FBQztZQUNKLGdEQUFnRDtZQUNoRCxPQUFPLE1BQU0sSUFBSSxDQUFDLEtBQUssQ0FBQyxXQUFXLENBQUMsZ0NBQWdDLENBQUMsMEJBQTBCLEVBQUUsQ0FBQyxFQUFFLElBQUksRUFBRSxrREFBa0QsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNsSyxDQUFDO1FBQUMsTUFBTSxDQUFDO1lBQ1IsT0FBTyxFQUFFLENBQUM7UUFDWCxDQUFDO0lBQ0YsQ0FBQztJQUVEOztPQUVHO0lBQ0gsS0FBSyxDQUFDLFlBQVk7UUFDakIsTUFBTSxJQUFJLENBQUMsT0FBTyxDQUFDLFNBQVMsRUFBRSxDQUFDO0lBQ2hDLENBQUM7SUFFRDs7T0FFRztJQUNILEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFZLEVBQUUsV0FBbUI7UUFDdkQsTUFBTSxJQUFJLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLEVBQUUsV0FBVyxDQUFDLENBQUM7UUFDN0QsSUFBSSxDQUFDLEtBQUssQ0FBQyxXQUFXLENBQUMsTUFBTSxFQUFFLENBQUM7SUFDakMsQ0FBQztJQUVEOztPQUVHO0lBQ0gsS0FBSyxDQUFDLGtCQUFrQixDQUFDLElBQVksRUFBRSxXQUFtQjtRQUN6RCxNQUFNLElBQUksQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLGtCQUFrQixDQUFDLElBQUksRUFBRSxXQUFXLENBQUMsQ0FBQztRQUMvRCxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDaEIsQ0FBQztJQUVEOztPQUVHO0lBQ0gsa0JBQWtCO1FBQ2pCLE9BQU8sSUFBSSxDQUFDLEtBQUssQ0FBQztJQUNuQixDQUFDO0lBRUQ7OztPQUdHO0lBQ0gsaUJBQWlCO1FBQ2hCLE9BQU8sSUFBSSxDQUFDLE9BQU8sRUFBRSxHQUFHLElBQUksU0FBUyxDQUFDO0lBQ3ZDLENBQUM7SUFFRDs7O09BR0c7SUFDSCxnQkFBZ0I7UUFDZixPQUFPLElBQUksQ0FBQyxPQUFPLElBQUksTUFBTSxDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsRUFBRSxRQUFRLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUM7SUFDM0gsQ0FBQztJQUVELHNEQUFzRDtJQUV0RDs7T0FFRztJQUNILGFBQWE7UUFDWixPQUFPLElBQUksQ0FBQyxTQUFTLENBQUMsYUFBYSxFQUFFLENBQUM7SUFDdkMsQ0FBQztJQUVEOzs7T0FHRztJQUNILE1BQU07UUFDTCxPQUFPLElBQUksQ0FBQyxTQUFTLENBQUMsTUFBTSxFQUFFLENBQUM7SUFDaEMsQ0FBQztJQUVRLE9BQU87UUFDZixJQUFJLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQztZQUN0QixPQUFPO1FBQ1IsQ0FBQztRQUNELElBQUksQ0FBQyxXQUFXLEdBQUcsSUFBSSxDQUFDO1FBRXhCLHdEQUF3RDtRQUN4RCxJQUFJLENBQUMsU0FBUyxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBRXpCLDRCQUE0QjtRQUM1QixJQUFJLENBQUMsT0FBTyxFQUFFLEdBQUcsRUFBRSxXQUFXLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUUzRCx3RkFBd0Y7UUFDeEYsSUFBSSxDQUFDLFdBQVcsQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUV4QixnREFBZ0Q7UUFDaEQsSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsV0FBVyxDQUFDLFdBQVcsRUFBRSxFQUFFLENBQUM7WUFDM0MsSUFBSSxDQUFDLEtBQUssQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLEVBQUUsbUJBQW1CLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQztRQUM5RCxDQUFDO1FBRUQsS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQ2pCLENBQUM7SUFFTyxXQUFXLENBQUMsUUFBNEI7UUFDL0MsT0FBTyxJQUFJLENBQUMsZUFBZSxDQUFDLFFBQVEsQ0FBQyxJQUFJLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxRQUFRLENBQUMsQ0FBQztJQUM5RSxDQUFDO0lBRU8sZUFBZSxDQUFDLFFBQTRCO1FBQ25ELElBQUksT0FBTyxRQUFRLEtBQUssUUFBUSxFQUFFLENBQUM7WUFDbEMsT0FBTyxTQUFTLENBQUM7UUFDbEIsQ0FBQztRQUVELE9BQU8sSUFBSSxDQUFDLGtCQUFrQixDQUFDLGFBQWEsQ0FBQyxRQUFRLENBQUMsQ0FBQztJQUN4RCxDQUFDO0lBRU8sb0JBQW9CLENBQUMsUUFBNEI7UUFDeEQsSUFBSSxPQUFPLFFBQVEsS0FBSyxRQUFRLEVBQUUsQ0FBQztZQUNsQyxPQUFPLFNBQVMsQ0FBQztRQUNsQixDQUFDO1FBRUQsTUFBTSxRQUFRLEdBQUcsV0FBVyxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUM5QyxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUM7WUFDZixPQUFPLFNBQVMsQ0FBQztRQUNsQixDQUFDO1FBRUQsT0FBTyxJQUFJLENBQUMsMkJBQTJCLENBQUMsc0JBQXNCLENBQUMsUUFBUSxDQUFDLENBQUM7SUFDMUUsQ0FBQzs7QUExc0JXLFdBQVc7SUF5RHJCLFdBQUEsbUJBQW1CLENBQUE7SUFDbkIsV0FBQSw0QkFBNEIsQ0FBQTtJQUM1QixXQUFBLFdBQVcsQ0FBQTtHQTNERCxXQUFXLENBMnNCdkIifQ==