/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WebContentsView, webContents } from 'electron';
import { Disposable } from '../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { VSBuffer } from '../../../base/common/buffer.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { IBrowserViewBounds, IBrowserViewDevToolsStateEvent, IBrowserViewFocusEvent, IBrowserViewKeyDownEvent, IBrowserViewState, IBrowserViewNavigationEvent, IBrowserViewLoadingEvent, IBrowserViewLoadError, IBrowserViewTitleChangeEvent, IBrowserViewFaviconChangeEvent, IBrowserViewNewPageRequest, IBrowserViewCaptureScreenshotOptions, IBrowserViewFindInPageOptions, IBrowserViewFindInPageResult, IBrowserViewVisibilityEvent, BrowserNewPageLocation, browserViewIsolatedWorldId, browserZoomFactors, browserZoomDefaultIndex } from '../common/browserView.js';
import { IElementData } from '../../browserElements/common/browserElements.js';
import { BrowserViewElementInspector } from './browserViewElementInspector.js';
import { IWindowsMainService } from '../../windows/electron-main/windows.js';
import { ICodeWindow } from '../../window/electron-main/window.js';
import { IAuxiliaryWindowsMainService } from '../../auxiliaryWindow/electron-main/auxiliaryWindows.js';
import { BrowserViewUri } from '../common/browserViewUri.js';
import { BrowserViewDebugger } from './browserViewDebugger.js';
import { ILogService } from '../../log/common/log.js';
import { ICDPTarget, ICDPConnection, CDPTargetInfo } from '../common/cdp/types.js';
import { BrowserSession } from './browserSession.js';
import { IAuxiliaryWindow } from '../../auxiliaryWindow/electron-main/auxiliaryWindow.js';
import { hasKey } from '../../../base/common/types.js';
import { SCAN_CODE_STR_TO_EVENT_KEY_CODE } from '../../../base/common/keyCodes.js';

/**
 * Represents a single browser view instance with its WebContentsView and all associated logic.
 * This class encapsulates all operations and events for a single browser view.
 */
export class BrowserView extends Disposable implements ICDPTarget {
	private readonly _view: WebContentsView;
	private readonly _faviconRequestCache = new Map<string, Promise<string>>();

	private _lastScreenshot: VSBuffer | undefined = undefined;
	private _lastFavicon: string | undefined = undefined;
	private _lastError: IBrowserViewLoadError | undefined = undefined;
	private _lastUserGestureTimestamp: number = -Infinity;
	private _browserZoomIndex: number = browserZoomDefaultIndex;

	private readonly _debugger: BrowserViewDebugger;
	private readonly _inspector: BrowserViewElementInspector;
	private _window: ICodeWindow | IAuxiliaryWindow | undefined;
	private _isDisposed = false;

	private static readonly MAX_CONSOLE_LOG_ENTRIES = 1000;
	private readonly _consoleLogs: string[] = [];

	private readonly _onDidNavigate = this._register(new Emitter<IBrowserViewNavigationEvent>());
	readonly onDidNavigate: Event<IBrowserViewNavigationEvent> = this._onDidNavigate.event;

	private readonly _onDidChangeLoadingState = this._register(new Emitter<IBrowserViewLoadingEvent>());
	readonly onDidChangeLoadingState: Event<IBrowserViewLoadingEvent> = this._onDidChangeLoadingState.event;

	private readonly _onDidChangeFocus = this._register(new Emitter<IBrowserViewFocusEvent>());
	readonly onDidChangeFocus: Event<IBrowserViewFocusEvent> = this._onDidChangeFocus.event;

	private readonly _onDidChangeVisibility = this._register(new Emitter<IBrowserViewVisibilityEvent>());
	readonly onDidChangeVisibility: Event<IBrowserViewVisibilityEvent> = this._onDidChangeVisibility.event;

	private readonly _onDidChangeDevToolsState = this._register(new Emitter<IBrowserViewDevToolsStateEvent>());
	readonly onDidChangeDevToolsState: Event<IBrowserViewDevToolsStateEvent> = this._onDidChangeDevToolsState.event;

	private readonly _onDidKeyCommand = this._register(new Emitter<IBrowserViewKeyDownEvent>());
	readonly onDidKeyCommand: Event<IBrowserViewKeyDownEvent> = this._onDidKeyCommand.event;

	private readonly _onDidChangeTitle = this._register(new Emitter<IBrowserViewTitleChangeEvent>());
	readonly onDidChangeTitle: Event<IBrowserViewTitleChangeEvent> = this._onDidChangeTitle.event;

	private readonly _onDidChangeFavicon = this._register(new Emitter<IBrowserViewFaviconChangeEvent>());
	readonly onDidChangeFavicon: Event<IBrowserViewFaviconChangeEvent> = this._onDidChangeFavicon.event;

	private readonly _onDidRequestNewPage = this._register(new Emitter<IBrowserViewNewPageRequest>());
	readonly onDidRequestNewPage: Event<IBrowserViewNewPageRequest> = this._onDidRequestNewPage.event;

	private readonly _onDidFindInPage = this._register(new Emitter<IBrowserViewFindInPageResult>());
	readonly onDidFindInPage: Event<IBrowserViewFindInPageResult> = this._onDidFindInPage.event;

	private readonly _onDidClose = this._register(new Emitter<void>());
	readonly onDidClose: Event<void> = this._onDidClose.event;

	constructor(
		public readonly id: string,
		public readonly session: BrowserSession,
		createChildView: (options?: Electron.WebContentsViewConstructorOptions) => BrowserView,
		openContextMenu: (view: BrowserView, params: Electron.ContextMenuParams) => void,
		options: Electron.WebContentsViewConstructorOptions | undefined,
		@IWindowsMainService private readonly windowsMainService: IWindowsMainService,
		@IAuxiliaryWindowsMainService private readonly auxiliaryWindowsMainService: IAuxiliaryWindowsMainService,
		@ILogService private readonly logService: ILogService
	) {
		super();

		const webPreferences: Electron.WebPreferences & { type: ReturnType<Electron.WebContents['getType']> } = {
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

	private setupEventListeners(): void {
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
					this._lastFavicon = await this._faviconRequestCache.get(url)!;
					this._onDidChangeFavicon.fire({ favicon: this._lastFavicon });
					// On success, stop searching
					return;
				} catch (e) {
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

		const fireLoadingEvent = (loading: boolean) => {
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

		// Chromium resets the zoom factor to its per-origin default (100%) when
		// navigating to a new document. Re-apply our stored zoom to override it.
		webContents.on('did-navigate', () => {
			this._consoleLogs.length = 0; // Clear console logs on navigation since they are per-page
			this._view.webContents.setZoomFactor(browserZoomFactors[this._browserZoomIndex]);
		});

		// Focus events
		webContents.on('focus', () => {
			this._onDidChangeFocus.fire({ focused: true });
		});

		webContents.on('blur', () => {
			this._onDidChangeFocus.fire({ focused: false });
		});

		// Forward key down events that weren't handled by the page to the workbench for shortcut handling.
		webContents.ipc.on('vscode:browserView:keydown', (_event, keyEvent: IBrowserViewKeyDownEvent) => {
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
			if (this._consoleLogs.length > BrowserView.MAX_CONSOLE_LOG_ENTRIES) {
				this._consoleLogs.splice(0, this._consoleLogs.length - BrowserView.MAX_CONSOLE_LOG_ENTRIES);
			}
		});
	}

	private consumePopupPermission(location: BrowserNewPageLocation): boolean {
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

	get webContents(): Electron.WebContents {
		return this._view.webContents;
	}

	/**
	 * Get the current state of this browser view
	 */
	getState(): IBrowserViewState {
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
	toggleDevTools(): void {
		this._view.webContents.toggleDevTools();
	}

	/**
	 * Update the layout bounds of this view
	 */
	layout(bounds: IBrowserViewBounds): void {
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

	setBrowserZoomIndex(zoomIndex: number): void {
		this._browserZoomIndex = Math.max(0, Math.min(zoomIndex, browserZoomFactors.length - 1));
		const browserZoomFactor = browserZoomFactors[this._browserZoomIndex];
		this._view.webContents.setZoomFactor(browserZoomFactor);
	}

	/**
	 * Set the visibility of this view
	 */
	setVisible(visible: boolean): void {
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
	getConsoleLogs(): string {
		return this._consoleLogs.join('\n');
	}

	/**
	 * Start element inspection mode. Sets up a CDP overlay that highlights elements
	 * on hover. When the user clicks, the element data is returned and the overlay is removed.
	 * @param token Cancellation token to abort the inspection.
	 */
	async getElementData(token: CancellationToken): Promise<IElementData | undefined> {
		return this._inspector.getElementData(token);
	}

	/**
	 * Get element data for the currently focused element.
	 */
	async getFocusedElementData(): Promise<IElementData | undefined> {
		return this._inspector.getFocusedElementData();
	}

	/**
	 * Load a URL in this view
	 */
	async loadURL(url: string): Promise<void> {
		await this._view.webContents.loadURL(url);
	}

	/**
	 * Get the current URL
	 */
	getURL(): string {
		return this._view.webContents.getURL();
	}

	/**
	 * Navigate back in history
	 */
	goBack(): void {
		if (this._view.webContents.navigationHistory.canGoBack()) {
			this._view.webContents.navigationHistory.goBack();
		}
	}

	/**
	 * Navigate forward in history
	 */
	goForward(): void {
		if (this._view.webContents.navigationHistory.canGoForward()) {
			this._view.webContents.navigationHistory.goForward();
		}
	}

	/**
	 * Reload the current page
	 */
	reload(hard?: boolean): void {
		if (hard) {
			this._view.webContents.reloadIgnoringCache();
		} else {
			this._view.webContents.reload();
		}
	}

	/**
	 * Check if the view can navigate back
	 */
	canGoBack(): boolean {
		return this._view.webContents.navigationHistory.canGoBack();
	}

	/**
	 * Check if the view can navigate forward
	 */
	canGoForward(): boolean {
		return this._view.webContents.navigationHistory.canGoForward();
	}

	/**
	 * Capture a screenshot of this view
	 */
	async captureScreenshot(options?: IBrowserViewCaptureScreenshotOptions): Promise<VSBuffer> {
		const quality = options?.quality ?? 80;
		if (options?.pageRect) {
			const zoomFactor = this._view.webContents.getZoomFactor();
			options.screenRect = {
				x: options.pageRect.x * zoomFactor,
				y: options.pageRect.y * zoomFactor,
				width: options.pageRect.width * zoomFactor,
				height: options.pageRect.height * zoomFactor
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
	async focus(): Promise<void> {
		this._view.webContents.focus();
	}

	/**
	 * Find text in the page
	 */
	async findInPage(text: string, options?: IBrowserViewFindInPageOptions): Promise<void> {
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
	async stopFindInPage(keepSelection?: boolean): Promise<void> {
		this._view.webContents.stopFindInPage(keepSelection ? 'keepSelection' : 'clearSelection');
	}

	/**
	 * Get the currently selected text in the browser view.
	 * Returns immediately with empty string if the page is still loading.
	 */
	async getSelectedText(): Promise<string> {
		// we don't want to wait for the page to finish loading, which executeJavaScript normally does.
		if (this._view.webContents.isLoading()) {
			return '';
		}
		try {
			// Uses our preloaded contextBridge-exposed API.
			return await this._view.webContents.executeJavaScriptInIsolatedWorld(browserViewIsolatedWorldId, [{ code: 'window.browserViewAPI?.getSelectedText?.() ?? ""' }]);
		} catch {
			return '';
		}
	}

	/**
	 * Clear all storage data for this browser view's session
	 */
	async clearStorage(): Promise<void> {
		await this.session.clearData();
	}

	/**
	 * Trust a certificate for a given host and reload the page.
	 */
	async trustCertificate(host: string, fingerprint: string): Promise<void> {
		await this.session.trust.trustCertificate(host, fingerprint);
		this._view.webContents.reload();
	}

	/**
	 * Revoke trust for a previously trusted certificate and close the view.
	 */
	async untrustCertificate(host: string, fingerprint: string): Promise<void> {
		await this.session.trust.untrustCertificate(host, fingerprint);
		this.dispose();
	}

	/**
	 * Get the underlying WebContentsView
	 */
	getWebContentsView(): WebContentsView {
		return this._view;
	}

	/**
	 * Get the hosting Electron window for this view, if any.
	 * This can be an auxiliary window, depending on where the view is currently hosted.
	 */
	getElectronWindow(): Electron.BrowserWindow | undefined {
		return this._window?.win ?? undefined;
	}

	/**
	 * Get the main code window hosting this browser view, if any. This is used for routing commands from the browser view to the correct window.
	 * If the browser view is hosted in an auxiliary window, this will return the parent code window of that auxiliary window.
	 */
	getTopCodeWindow(): ICodeWindow | undefined {
		return this._window && hasKey(this._window, { parentId: true }) ? this._codeWindowById(this._window.parentId) : undefined;
	}

	// ============ ICDPTarget implementation ============

	/**
	 * Get CDP target info using Electron's real targetId.
	 */
	getTargetInfo(): Promise<CDPTargetInfo> {
		return this._debugger.getTargetInfo();
	}

	/**
	 * Attach to receive debugger events.
	 * @returns A connection that can be disposed to detach
	 */
	attach(): Promise<ICDPConnection> {
		return this._debugger.attach();
	}

	override dispose(): void {
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

	private _windowById(windowId: number | undefined): ICodeWindow | IAuxiliaryWindow | undefined {
		return this._codeWindowById(windowId) ?? this._auxiliaryWindowById(windowId);
	}

	private _codeWindowById(windowId: number | undefined): ICodeWindow | undefined {
		if (typeof windowId !== 'number') {
			return undefined;
		}

		return this.windowsMainService.getWindowById(windowId);
	}

	private _auxiliaryWindowById(windowId: number | undefined): IAuxiliaryWindow | undefined {
		if (typeof windowId !== 'number') {
			return undefined;
		}

		const contents = webContents.fromId(windowId);
		if (!contents) {
			return undefined;
		}

		return this.auxiliaryWindowsMainService.getWindowByWebContents(contents);
	}
}
