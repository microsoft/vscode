/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WebContentsView, webContents } from 'electron';
import { Disposable } from '../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { VSBuffer } from '../../../base/common/buffer.js';
import { IBrowserViewBounds, IBrowserViewDevToolsStateEvent, IBrowserViewFocusEvent, IBrowserViewKeyDownEvent, IBrowserViewState, IBrowserViewNavigationEvent, IBrowserViewLoadingEvent, IBrowserViewLoadError, IBrowserViewTitleChangeEvent, IBrowserViewFaviconChangeEvent, IBrowserViewNewPageRequest, BrowserViewStorageScope, IBrowserViewCaptureScreenshotOptions } from '../common/browserView.js';
import { EVENT_KEY_CODE_MAP, KeyCode, SCAN_CODE_STR_TO_EVENT_KEY_CODE } from '../../../base/common/keyCodes.js';
import { IThemeMainService } from '../../theme/electron-main/themeMainService.js';
import { IWindowsMainService } from '../../windows/electron-main/windows.js';
import { IBaseWindow, ICodeWindow } from '../../window/electron-main/window.js';
import { IAuxiliaryWindowsMainService } from '../../auxiliaryWindow/electron-main/auxiliaryWindows.js';
import { IAuxiliaryWindow } from '../../auxiliaryWindow/electron-main/auxiliaryWindow.js';
import { ILogService } from '../../log/common/log.js';
import { isMacintosh } from '../../../base/common/platform.js';

const nativeShortcutKeys = new Set(['KeyA', 'KeyC', 'KeyV', 'KeyX', 'KeyZ']);
function shouldIgnoreNativeShortcut(input: Electron.Input): boolean {
	const isControlInput = isMacintosh ? input.meta : input.control;
	const isAltOnlyInput = input.alt && !input.control && !input.meta;

	// Ignore Alt-only inputs (often used for accented characters or menu accelerators)
	if (isAltOnlyInput) {
		return true;
	}

	// Ignore Ctrl/Cmd + [A,C,V,X,Z] shortcuts to allow native handling (e.g. copy/paste)
	return isControlInput && nativeShortcutKeys.has(input.code);
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

	private _window: IBaseWindow | undefined;
	private _isSendingKeyEvent = false;

	private readonly _onDidNavigate = this._register(new Emitter<IBrowserViewNavigationEvent>());
	readonly onDidNavigate: Event<IBrowserViewNavigationEvent> = this._onDidNavigate.event;

	private readonly _onDidChangeLoadingState = this._register(new Emitter<IBrowserViewLoadingEvent>());
	readonly onDidChangeLoadingState: Event<IBrowserViewLoadingEvent> = this._onDidChangeLoadingState.event;

	private readonly _onDidChangeFocus = this._register(new Emitter<IBrowserViewFocusEvent>());
	readonly onDidChangeFocus: Event<IBrowserViewFocusEvent> = this._onDidChangeFocus.event;

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

	private readonly _onDidClose = this._register(new Emitter<void>());
	readonly onDidClose: Event<void> = this._onDidClose.event;

	constructor(
		viewSession: Electron.Session,
		private readonly storageScope: BrowserViewStorageScope,
		@IThemeMainService private readonly themeMainService: IThemeMainService,
		@IWindowsMainService private readonly windowsMainService: IWindowsMainService,
		@IAuxiliaryWindowsMainService private readonly auxiliaryWindowsMainService: IAuxiliaryWindowsMainService,
		@ILogService private readonly logService: ILogService
	) {
		super();

		this._view = new WebContentsView({
			webPreferences: {
				nodeIntegration: false,
				contextIsolation: true,
				sandbox: true,
				webviewTag: false,
				session: viewSession
			}
		});

		this._view.webContents.setWindowOpenHandler((details) => {
			// For new tab requests, fire event for workbench to handle
			if (details.disposition === 'background-tab' || details.disposition === 'foreground-tab') {
				this._onDidRequestNewPage.fire({
					url: details.url,
					name: details.frameName || undefined,
					background: details.disposition === 'background-tab'
				});
				return { action: 'deny' }; // Deny the default browser behavior since we're handling it
			}

			// Deny other requests like new windows.
			return { action: 'deny' };
		});

		this._view.webContents.on('destroyed', () => {
			this._onDidClose.fire();
		});

		this.setupEventListeners();

		// Create and register plugins for this web contents
		this._register(new ThemePlugin(this._view, this.themeMainService, this.logService));
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
			if (!favicons || favicons.length === 0) {
				return;
			}

			const found = favicons.find(f => this._faviconRequestCache.get(f));
			if (found) {
				// already have a cached request for this favicon, use it
				this._lastFavicon = await this._faviconRequestCache.get(found)!;
				this._onDidChangeFavicon.fire({ favicon: this._lastFavicon });
				return;
			}

			// try each url in order until one works
			for (const url of favicons) {
				const request = (async () => {
					const response = await webContents.session.fetch(url, {
						cache: 'force-cache'
					});
					const type = await response.headers.get('content-type');
					const buffer = await response.arrayBuffer();

					return `data:${type};base64,${Buffer.from(buffer).toString('base64')}`;
				})();

				this._faviconRequestCache.set(url, request);

				try {
					this._lastFavicon = await request;
					this._onDidChangeFavicon.fire({ favicon: this._lastFavicon });
					// On success, leave the promise in the cache and stop looping
					return;
				} catch (e) {
					this._faviconRequestCache.delete(url);
					// On failure, try the next one
				}
			}
		});

		// Title events
		webContents.on('page-title-updated', (_event, title) => {
			this._onDidChangeTitle.fire({ title });
		});

		const fireNavigationEvent = () => {
			this._onDidNavigate.fire({
				url: webContents.getURL(),
				canGoBack: webContents.navigationHistory.canGoBack(),
				canGoForward: webContents.navigationHistory.canGoForward()
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
				this._lastError = {
					url: validatedURL,
					errorCode,
					errorDescription
				};

				fireLoadingEvent(false);
				this._onDidNavigate.fire({
					url: validatedURL,
					canGoBack: webContents.navigationHistory.canGoBack(),
					canGoForward: webContents.navigationHistory.canGoForward()
				});
			}
		});
		webContents.on('did-finish-load', () => fireLoadingEvent(false));

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

		// Focus events
		webContents.on('focus', () => {
			this._onDidChangeFocus.fire({ focused: true });
		});

		webContents.on('blur', () => {
			this._onDidChangeFocus.fire({ focused: false });
		});

		// Key down events - listen for raw key input events
		webContents.on('before-input-event', async (event, input) => {
			if (input.type === 'keyDown' && !this._isSendingKeyEvent) {
				if (shouldIgnoreNativeShortcut(input)) {
					return;
				}
				const eventKeyCode = SCAN_CODE_STR_TO_EVENT_KEY_CODE[input.code] || 0;
				const keyCode = EVENT_KEY_CODE_MAP[eventKeyCode] || KeyCode.Unknown;
				const hasCommandModifier = input.control || input.alt || input.meta;
				const isNonEditingKey =
					keyCode >= KeyCode.F1 && keyCode <= KeyCode.F24 ||
					keyCode >= KeyCode.AudioVolumeMute;

				if (hasCommandModifier || isNonEditingKey) {
					event.preventDefault();
					this._onDidKeyCommand.fire({
						key: input.key,
						keyCode: eventKeyCode,
						code: input.code,
						ctrlKey: input.control || false,
						shiftKey: input.shift || false,
						altKey: input.alt || false,
						metaKey: input.meta || false,
						repeat: input.isAutoRepeat || false
					});
				}
			}
		});

		// For now, always prevent sites from blocking unload.
		// In the future we may want to show a dialog to ask the user,
		// with heavy restrictions regarding interaction and repeated prompts.
		webContents.on('will-prevent-unload', (e) => {
			e.preventDefault();
		});
	}

	/**
	 * Get the current state of this browser view
	 */
	getState(): IBrowserViewState {
		const webContents = this._view.webContents;
		return {
			url: webContents.getURL(),
			title: webContents.getTitle(),
			canGoBack: webContents.navigationHistory.canGoBack(),
			canGoForward: webContents.navigationHistory.canGoForward(),
			loading: webContents.isLoading(),
			isDevToolsOpen: webContents.isDevToolsOpened(),
			lastScreenshot: this._lastScreenshot,
			lastFavicon: this._lastFavicon,
			lastError: this._lastError,
			storageScope: this.storageScope
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
			const newWindow = this.windowById(bounds.windowId);
			if (newWindow) {
				this._window?.win?.contentView.removeChildView(this._view);
				this._window = newWindow;
				newWindow.win?.contentView.addChildView(this._view);
			}
		}

		this._view.webContents.setZoomFactor(bounds.zoomFactor);
		this._view.setBounds({
			x: Math.round(bounds.x * bounds.zoomFactor),
			y: Math.round(bounds.y * bounds.zoomFactor),
			width: Math.round(bounds.width * bounds.zoomFactor),
			height: Math.round(bounds.height * bounds.zoomFactor)
		});
	}

	/**
	 * Set the visibility of this view
	 */
	setVisible(visible: boolean): void {
		// If the view is focused, pass focus back to the window when hiding
		if (!visible && this._view.webContents.isFocused()) {
			this._window?.win?.webContents.focus();
		}

		this._view.setVisible(visible);
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
	reload(): void {
		this._view.webContents.reload();
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
		const image = await this._view.webContents.capturePage(options?.rect, {
			stayHidden: true,
			stayAwake: true
		});
		const buffer = image.toJPEG(quality);
		const screenshot = VSBuffer.wrap(buffer);
		// Only update _lastScreenshot if capturing the full view
		if (!options?.rect) {
			this._lastScreenshot = screenshot;
		}
		return screenshot;
	}

	/**
	 * Dispatch a keyboard event to this view
	 */
	async dispatchKeyEvent(keyEvent: IBrowserViewKeyDownEvent): Promise<void> {
		const event: Electron.KeyboardInputEvent = {
			type: 'keyDown',
			keyCode: keyEvent.key,
			modifiers: []
		};
		if (keyEvent.ctrlKey) {
			event.modifiers!.push('control');
		}
		if (keyEvent.shiftKey) {
			event.modifiers!.push('shift');
		}
		if (keyEvent.altKey) {
			event.modifiers!.push('alt');
		}
		if (keyEvent.metaKey) {
			event.modifiers!.push('meta');
		}
		this._isSendingKeyEvent = true;
		try {
			await this._view.webContents.sendInputEvent(event);
		} finally {
			this._isSendingKeyEvent = false;
		}
	}

	/**
	 * Set the zoom factor of this view
	 */
	async setZoomFactor(zoomFactor: number): Promise<void> {
		await this._view.webContents.setZoomFactor(zoomFactor);
	}

	/**
	 * Focus this view
	 */
	async focus(): Promise<void> {
		this._view.webContents.focus();
	}

	/**
	 * Get the underlying WebContentsView
	 */
	getWebContentsView(): WebContentsView {
		return this._view;
	}

	override dispose(): void {
		// Remove from parent window
		this._window?.win?.contentView.removeChildView(this._view);

		// Clean up the view and all its event listeners
		// Note: webContents.close() automatically removes all event listeners
		this._view.webContents.close({ waitForBeforeUnload: false });

		super.dispose();
	}


	private windowById(windowId: number | undefined): ICodeWindow | IAuxiliaryWindow | undefined {
		return this.codeWindowById(windowId) ?? this.auxiliaryWindowById(windowId);
	}

	private codeWindowById(windowId: number | undefined): ICodeWindow | undefined {
		if (typeof windowId !== 'number') {
			return undefined;
		}

		return this.windowsMainService.getWindowById(windowId);
	}

	private auxiliaryWindowById(windowId: number | undefined): IAuxiliaryWindow | undefined {
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

export class ThemePlugin extends Disposable {
	private readonly _webContents: Electron.WebContents;
	private _injectedCSSKey?: string;

	constructor(
		private readonly _view: Electron.WebContentsView,
		private readonly themeMainService: IThemeMainService,
		private readonly logService: ILogService
	) {
		super();
		this._webContents = _view.webContents;

		// Set view background to match editor background
		this.applyBackgroundColor();

		// Apply theme when page loads
		this._webContents.on('did-finish-load', () => this.applyTheme());

		// Update theme when VS Code theme changes
		this._register(this.themeMainService.onDidChangeColorScheme(() => {
			this.applyBackgroundColor();
			this.applyTheme();
		}));
	}

	private applyBackgroundColor(): void {
		const backgroundColor = this.themeMainService.getBackgroundColor();
		this._view.setBackgroundColor(backgroundColor);
	}

	private async applyTheme(): Promise<void> {
		if (this._webContents.isDestroyed()) {
			return;
		}

		const colorScheme = this.themeMainService.getColorScheme().dark ? 'dark' : 'light';

		try {
			// Remove previous theme CSS if it exists
			if (this._injectedCSSKey) {
				await this._webContents.removeInsertedCSS(this._injectedCSSKey);
			}

			// Insert new theme CSS
			this._injectedCSSKey = await this._webContents.insertCSS(`
				/* VS Code theme override */
				:root {
					color-scheme: ${colorScheme};
				}
			`);
		} catch (error) {
			this.logService.error('ThemePlugin: Failed to inject CSS', error);
		}
	}
}
