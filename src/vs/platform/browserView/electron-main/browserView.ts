/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { screen, WebContentsView, webContents } from 'electron';
import { Disposable } from '../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { VSBuffer } from '../../../base/common/buffer.js';
import { IBrowserViewBounds, IBrowserViewDevToolsStateEvent, IBrowserViewFocusEvent, IBrowserViewKeyDownEvent, IBrowserViewState, IBrowserViewNavigationEvent, IBrowserViewLoadingEvent, IBrowserViewLoadError, IBrowserViewTitleChangeEvent, IBrowserViewFaviconChangeEvent, IBrowserViewCaptureScreenshotOptions, IBrowserViewFindInPageOptions, IBrowserViewFindInPageResult, IBrowserViewVisibilityEvent, browserViewIsolatedWorldId, browserZoomFactors, browserZoomDefaultIndex, IBrowserViewOwner, IBrowserViewOpenOptions } from '../common/browserView.js';
import { BrowserViewEmulator } from './browserViewEmulator.js';
import { BrowserViewInspector } from './browserViewInspector.js';
import { IWindowsMainService } from '../../windows/electron-main/windows.js';
import { ICodeWindow, LoadReason } from '../../window/electron-main/window.js';
import { IAuxiliaryWindowsMainService } from '../../auxiliaryWindow/electron-main/auxiliaryWindows.js';
import { BrowserViewDebugger } from './browserViewDebugger.js';
import { ILogService } from '../../log/common/log.js';
import { BrowserSession } from './browserSession.js';
import { IBrowserHistoryItemHandle } from '../common/browserHistory.js';
import { IAuxiliaryWindow } from '../../auxiliaryWindow/electron-main/auxiliaryWindow.js';
import { SCAN_CODE_STR_TO_EVENT_KEY_CODE } from '../../../base/common/keyCodes.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { logBrowserOpen } from '../common/browserViewTelemetry.js';

enum NewPageLocation {
	Foreground = 'foreground',
	Background = 'background',
	NewWindow = 'newWindow'
}

/**
 * Represents a single browser view instance with its WebContentsView and all associated logic.
 * This class encapsulates all operations and events for a single browser view.
 */
export class BrowserView extends Disposable {
	private readonly _view: WebContentsView;
	private readonly _faviconRequestCache = new Map<string, Promise<string>>();

	private _lastScreenshot: VSBuffer | undefined = undefined;
	private _lastFavicon: string | undefined = undefined;
	private _lastError: IBrowserViewLoadError | undefined = undefined;
	private _lastUserGestureTimestamp: number = -Infinity;
	private _browserZoomIndex: number = browserZoomDefaultIndex;

	private _currentHistoryHandle: IBrowserHistoryItemHandle | undefined;
	private _explicitNavigationPending = false;

	readonly debugger: BrowserViewDebugger;
	readonly emulator: BrowserViewEmulator;
	readonly inspector: BrowserViewInspector;

	private _ownerWindow: ICodeWindow;
	private _currentWindow: ICodeWindow | IAuxiliaryWindow | undefined;
	private _isDisposed = false;

	private static readonly MAX_CONSOLE_LOG_ENTRIES = 1000;
	private readonly _consoleLogs: string[] = [];

	/**
	 * Resize a full-page screenshot so its largest dimension never exceeds this many pixels. A very tall
	 * or wide page would otherwise request an enormous bitmap, which is costly to allocate/encode and
	 * can stress the browser process. We downscale via `scale` (rather than cropping) so the whole page
	 * still fits in the result.
	 */
	private static readonly MAX_FULL_PAGE_SCREENSHOT_DIMENSION = 2576;

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

	private readonly _onDidFindInPage = this._register(new Emitter<IBrowserViewFindInPageResult>());
	readonly onDidFindInPage: Event<IBrowserViewFindInPageResult> = this._onDidFindInPage.event;

	private readonly _onDidClose = this._register(new Emitter<void>());
	readonly onDidClose: Event<void> = this._onDidClose.event;

	constructor(
		public readonly id: string,
		public readonly owner: IBrowserViewOwner,
		public readonly session: BrowserSession,
		createChildView: (url: string, electronOptions: Electron.WebContentsViewConstructorOptions | undefined, openOptions: IBrowserViewOpenOptions) => BrowserView,
		openContextMenu: (view: BrowserView, params: Electron.ContextMenuParams) => void,
		options: Electron.WebContentsViewConstructorOptions | undefined,
		@IWindowsMainService private readonly windowsMainService: IWindowsMainService,
		@IAuxiliaryWindowsMainService private readonly auxiliaryWindowsMainService: IAuxiliaryWindowsMainService,
		@ILogService private readonly logService: ILogService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) {
		super();

		const webPreferences: Electron.WebPreferences = {
			...options?.webPreferences,

			nodeIntegration: false,
			contextIsolation: true,
			sandbox: true,

			// NOTE: When `sandbox` is enabled, `nodeIntegrationInSubFrames` doesn't actually enable node integration or prevent sandboxing.
			//       It allows preload scripts to run in subframes, which is important for our features like keyboard shortcut forwarding.
			nodeIntegrationInSubFrames: true,

			webviewTag: false,
			session: this.session.electronSession,

			focusOnNavigation: false
		};

		this._view = new WebContentsView({
			webPreferences,
			// Passing an `undefined` webContents triggers an error in Electron.
			...(options?.webContents ? { webContents: options.webContents } : {})
		});

		// Use a default size of 1024x768.
		this._view.setBounds({ x: -10000, y: -10000, width: 1024, height: 768 });
		this._view.setBackgroundColor('#FFFFFF');

		this._ownerWindow = this.windowsMainService.getWindowById(owner.mainWindowId)!;
		if (!this._ownerWindow) {
			throw new Error(`Window with ID ${owner.mainWindowId} not found`);
		}
		this._register(this._ownerWindow.onDidClose(() => this.dispose()));
		this._register(this._ownerWindow.onWillLoad((e) => {
			if (e.reason === LoadReason.LOAD) {
				this.dispose(); // Dispose when switching workspaces.
			} else if (e.reason === LoadReason.RELOAD) {
				this.setVisible(false); // Hide when reloading.
			}
		}));

		this._view.setVisible(false);
		this._ownerWindow.win?.contentView.addChildView(this._view);

		this._view.webContents.setWindowOpenHandler((details) => {
			const location = (() => {
				switch (details.disposition) {
					case 'background-tab': return NewPageLocation.Background;
					case 'foreground-tab': return NewPageLocation.Foreground;
					case 'new-window': return NewPageLocation.NewWindow;
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
					logBrowserOpen(this.telemetryService, (() => {
						switch (location) {
							case NewPageLocation.NewWindow: return 'browserLinkNewWindow';
							case NewPageLocation.Background: return 'browserLinkBackground';
							case NewPageLocation.Foreground: return 'browserLinkForeground';
						}
					})());

					const childView = createChildView(details.url, options, {
						pinned: true,
						background: location === NewPageLocation.Background,
						parentViewId: id,
						auxiliaryWindow: location === NewPageLocation.NewWindow
							? { x: options.x, y: options.y, width: options.width, height: options.height }
							: undefined,
					});

					// Return the webContents so Electron can complete the window.open() call
					return childView.webContents;
				},

				// We want the standard browser behavior as opposed to Electron's default of closing the new window when the parent is closed
				outlivesOpener: true
			};
		});

		this._view.webContents.on('context-menu', (_event, params) => {
			openContextMenu(this, params);
		});

		this._view.webContents.on('destroyed', () => {
			this.dispose();
		});

		this.debugger = new BrowserViewDebugger(this, this.logService);
		this.emulator = this._register(new BrowserViewEmulator(this, this.logService));
		this.inspector = this._register(new BrowserViewInspector(this));

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
					this._currentHistoryHandle?.update({ favicon: this._lastFavicon });
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
				this._currentHistoryHandle?.update({ favicon: null });
			}
		});
		webContents.on('will-navigate', (event) => {
			// URL.parse (vs `new URL`) tolerates about:/blob:/empty strings without throwing.
			const host = URL.parse(event.url)?.host;
			const currHost = URL.parse(this.webContents.getURL())?.host;
			if (host !== currHost) {
				this._lastFavicon = undefined;
			}
		});

		// Title events
		webContents.on('page-title-updated', (_event, title) => {
			this._onDidChangeTitle.fire({ title });
			this._currentHistoryHandle?.update({ title });
		});

		const fireNavigationEvent = (url: string, createNewHistoryItem: boolean) => {
			this._onDidNavigate.fire({
				url,
				title: webContents.getTitle(),
				canGoBack: webContents.navigationHistory.canGoBack(),
				canGoForward: webContents.navigationHistory.canGoForward(),
				certificateError: this.session.trust.getCertificateError(url)
			});
			if (createNewHistoryItem) {
				this._trackVisit(url);
			} else {
				this._currentHistoryHandle?.update({ url });
			}
		};

		const fireLoadingEvent = (loading: boolean) => {
			this._onDidChangeLoadingState.fire({ loading, error: this._lastError });
		};

		// Loading state events
		webContents.on('did-start-loading', () => {
			this._lastError = undefined;

			// Don't fire loading events for e.g. same-document navigations
			if (webContents.isLoadingMainFrame()) {
				fireLoadingEvent(true);
			}
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

		webContents.on('login', (event, _details, authInfo, callback) => {
			// Automatically supply proxy auth credentials for the tunnel proxy.
			if (this.session.remote.proxy) {
				const { username, password } = this.session.remote.proxy.credentials;
				const proxyPort = this.session.remote.proxy.port;
				if (authInfo.isProxy && authInfo.host === '127.0.0.1' && authInfo.port === proxyPort) {
					event.preventDefault();
					callback(username, password);
				}
			}
		});

		webContents.on('render-process-gone', (_event, details) => {
			this._lastError = {
				url: webContents.getURL(),
				errorCode: details.exitCode,
				errorDescription: `Render process gone: ${details.reason}`
			};

			fireLoadingEvent(false);
		});

		// Navigation events (when URL actually changes)
		webContents.on('did-navigate', (_, url) => fireNavigationEvent(url, true));
		webContents.on('did-navigate-in-page', (_, url) => fireNavigationEvent(url, false));

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

		const onCommandKeydown = (_event: unknown, keyEvent: IBrowserViewKeyDownEvent) => {
			this._onDidKeyCommand.fire(keyEvent);
		};

		// Forward key down events that weren't handled by the page to the workbench for shortcut handling.
		webContents.ipc.on('vscode:browserView:keydown', onCommandKeydown);
		webContents.on('devtools-opened', () => {
			// Avoid double-registration if the webContents is reused.
			webContents.devToolsWebContents?.ipc.off('vscode:browserView:keydown', onCommandKeydown);
			webContents.devToolsWebContents?.ipc.on('vscode:browserView:keydown', onCommandKeydown);
		});

		// If the page won't be able to handle events, forward key down events directly.
		webContents.on('before-input-event', (event, input) => {
			if (input.type !== 'keyDown') {
				return;
			}

			const pageIsAvailable = this._view.getVisible()
				&& !webContents.isCrashed()
				&& !this.debugger.isPaused;
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

	private consumePopupPermission(location: NewPageLocation): boolean {
		switch (location) {
			case NewPageLocation.Foreground:
			case NewPageLocation.Background:
				return true;
			case NewPageLocation.NewWindow:
				// Each user gesture allows one popup window within 1 second
				if (this._lastUserGestureTimestamp > Date.now() - 1000) {
					this._lastUserGestureTimestamp = -Infinity;
					return true;
				}

				return false;
		}
	}

	/**
	 * Record a successful navigation in the session's history and remember the
	 * resulting handle so subsequent title/favicon updates can refine it.
	 */
	private _trackVisit(url: string): void {
		if (!isTrackableHistoryUrl(url)) {
			this._currentHistoryHandle = undefined;
			return;
		}
		const userInitiated = this._explicitNavigationPending;
		this._explicitNavigationPending = false;
		this._currentHistoryHandle = this.session.history.add(
			url,
			this._view.webContents.getTitle(),
			this._lastFavicon,
			userInitiated,
		);
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
			storageKeys: this.session.history.storageKeys,
			browserZoomIndex: this._browserZoomIndex,
			isElementSelectionActive: this.inspector.isElementSelectionActive,
			isRemoteSession: !!this.session.remote.proxyId,
			isAreaSelectionActive: this.inspector.isAreaSelectionActive,
			device: this.emulator.device
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
		if (this._currentWindow?.win?.id !== bounds.windowId) {
			const newWindow = this._windowById(bounds.windowId);
			if (newWindow) {
				this._currentWindow?.win?.contentView.removeChildView(this._view);
				this._currentWindow = newWindow;
				newWindow.win?.contentView.addChildView(this._view);
			}
		}

		this._view.setBorderRadius(Math.round(bounds.cornerRadius * bounds.zoomFactor));

		if (bounds.emulation) {
			this.emulator.applyScreenEmulation(bounds.width, bounds.height, bounds.emulation.scale, bounds.zoomFactor);
		}

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
			this._currentWindow?.win?.webContents.focus();
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
	 * Load a URL in this view
	 */
	async loadURL(url: string): Promise<void> {
		this._explicitNavigationPending = true;
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
		if (!this._view.getVisible()) {
			// This ensures the webContents rendering pipeline is ready so background tabs can be captured too.
			this._view.setVisible(true);
			this._view.setVisible(false);
		}

		const quality = options?.quality ?? 80;
		const format = options?.format ?? 'jpeg';

		if (options?.fullPage && !options.screenRect && !options.pageRect) {
			return this._captureFullPageScreenshot(format, quality);
		}

		if (options?.pageRect) {
			const zoomFactor = this._view.webContents.getZoomFactor();
			// The visual viewport scale accounts for pinch-to-zoom magnification, which is separate from the regular zoom factor.
			const visualViewportScale = await this.inspector.getVisualViewportScale();
			const emulationScale = this.emulator.emulatedScaleFactor;
			options.screenRect = {
				x: options.pageRect.x * visualViewportScale * zoomFactor * emulationScale,
				y: options.pageRect.y * visualViewportScale * zoomFactor * emulationScale,
				width: options.pageRect.width * visualViewportScale * zoomFactor * emulationScale,
				height: options.pageRect.height * visualViewportScale * zoomFactor * emulationScale
			};
		}
		if (options?.awaitNextPaint) {
			await this._waitForNextPaint();
		}
		const image = await this._view.webContents.capturePage(options?.screenRect, {
			stayHidden: true
		});
		const buffer = format === 'png' ? image.toPNG() : image.toJPEG(quality);
		const screenshot = VSBuffer.wrap(buffer);
		// Only update _lastScreenshot if capturing the full view
		if (!options?.screenRect) {
			this._lastScreenshot = screenshot;
		}
		return screenshot;
	}

	// Capture a screenshot of the full scrollable document (beyond the viewport) via CDP.
	private async _captureFullPageScreenshot(format: 'jpeg' | 'png', quality: number): Promise<VSBuffer> {
		const metrics = await this.debugger.sendCommand('Page.getLayoutMetrics') as { cssContentSize?: { width: number; height: number } };
		// Size in CSS pixels
		const size = metrics.cssContentSize;
		if (!size) {
			throw new Error('Page.getLayoutMetrics did not return a cssContentSize');
		}
		const zoomFactor = this._view.webContents.getZoomFactor();
		const clipWidth = size.width * zoomFactor;
		const clipHeight = size.height * zoomFactor;
		// CDP renders the screenshot at device pixels, so the output bitmap dimensions are roughly
		// `clip.width * scale * devicePixelRatio`. Divide by DPR here so `MAX_FULL_PAGE_SCREENSHOT_DIMENSION`
		// is an upper bound on the final image pixel size (not just the CSS-pixel clip size).
		// We read the DPR from the display hosting the view's window (rather than evaluating
		// `window.devicePixelRatio` in the page) so this works without a renderer round-trip and
		// while the page is paused at a breakpoint. Fall back to the primary display if no host
		// window can be resolved (e.g. during teardown).
		const hostWindow = this._hostWindow;
		const display = hostWindow ? screen.getDisplayMatching(hostWindow.getBounds()) : screen.getPrimaryDisplay();
		const devicePixelRatio = display.scaleFactor;
		const maxClipDimension = BrowserView.MAX_FULL_PAGE_SCREENSHOT_DIMENSION / Math.max(devicePixelRatio, 1);
		const scale = Math.min(1, maxClipDimension / Math.max(clipWidth, clipHeight));
		try {
			const result = await this.debugger.sendCommand('Page.captureScreenshot', {
				format,
				...(format === 'jpeg' ? { quality } : {}),
				captureBeyondViewport: true,
				// In theory, `clip` defaults to the full area when not explicitly passed, but in practice it doesn't work when
				// the zoom level isn't 100, because it doesn't multiply the width and height by zoomFactor like we do here.
				// Setting the clip explicitly, we can multiply by zoomFactor and thus work around this Chromium bug.
				// Note that even with this workaround, we often see that the page isn't fully captured and might repeat
				// visual content from the top at the bottom, instead of showing the bottom of the page.
				// - Another sidenote: Currently the scrollbar width isn't accounted for. If a scrollbar exists, we should add the
				//   vertical scrollbar's width and horizontal scrollbar's height to the clip dimensions, since the image is currently
				//   clipped by that amount (this also happens when no clip parameter is provided; ideally it should be fixed upstream
				//   in Chromium).
				clip: { x: 0, y: 0, width: clipWidth, height: clipHeight, scale }
			}) as { data: string };
			return VSBuffer.wrap(Buffer.from(result.data, 'base64'));
		} finally {
			// `Page.captureScreenshot` with `captureBeyondViewport` resets and
			// disables pinch-to-zoom until the next navigation. Re-enable it so
			// the user can still pinch-to-zoom even immediately after
			// capturing a full-page screenshot.
			void this._view.webContents.setVisualZoomLevelLimits(1, 3).catch(error => {
				this.logService.error('Failed to restore visual zoom level limits after full-page screenshot.', error);
			});
		}
	}

	private async _waitForNextPaint(): Promise<void> {
		const WAIT_TIMEOUT_MS = 100;
		try {
			await Promise.race([
				this.debugger.sendCommand('Runtime.evaluate', {
					expression: 'new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))',
					awaitPromise: true
				}),
				new Promise<void>(resolve => setTimeout(resolve, WAIT_TIMEOUT_MS))
			]);
		} catch {
			// `Runtime.evaluate` can throw if the page navigates while we're waiting;
			// just proceed in that case.
		}
	}

	/**
	 * Focus this view
	 */
	async focus(force?: boolean): Promise<void> {
		// By default, only focus the view if its window is already focused.
		if (!force && !this._currentWindow?.win?.isFocused()) {
			return;
		}
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
		return this._currentWindow?.win ?? undefined;
	}

	/**
	 * The Electron window that currently hosts this view, if any. Before `layout()` is first
	 * called this is the owner window; after that it's whichever window the view was last moved
	 * to. Returns `undefined` if no host window can be resolved (e.g. during teardown).
	 */
	private get _hostWindow(): Electron.BrowserWindow | undefined {
		return this._currentWindow?.win ?? this._ownerWindow.win ?? undefined;
	}

	override dispose(): void {
		if (this._isDisposed) {
			return;
		}
		this._isDisposed = true;

		// Dispose debugger. This detaches debug sessions first.
		this.debugger.dispose();

		// Remove from parent window (guard against already-destroyed window)
		const currentWin = this._currentWindow?.win;
		if (currentWin && !currentWin.isDestroyed()) {
			currentWin.contentView.removeChildView(this._view);
		}

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

/** True iff this URL should be recorded in browser history. */
function isTrackableHistoryUrl(url: string): boolean {
	if (!url) {
		return false;
	}
	// Cheap scheme filter avoids URL parsing on the hot path.
	const colon = url.indexOf(':');
	if (colon <= 0) {
		return false;
	}
	const scheme = url.substring(0, colon).toLowerCase();
	return scheme === 'http' || scheme === 'https' || scheme === 'file';
}
