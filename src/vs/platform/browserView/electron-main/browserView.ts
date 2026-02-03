/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WebContentsView, webContents } from 'electron';
import { Disposable } from '../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { VSBuffer } from '../../../base/common/buffer.js';
import { IBrowserViewBounds, IBrowserViewDevToolsStateEvent, IBrowserViewFocusEvent, IBrowserViewKeyDownEvent, IBrowserViewState, IBrowserViewNavigationEvent, IBrowserViewLoadingEvent, IBrowserViewLoadError, IBrowserViewTitleChangeEvent, IBrowserViewFaviconChangeEvent, IBrowserViewNewPageRequest, BrowserViewStorageScope, IBrowserViewCaptureScreenshotOptions, IBrowserViewFindInPageOptions, IBrowserViewFindInPageResult, IBrowserViewVisibilityEvent, BrowserNewPageLocation } from '../common/browserView.js';
import { EVENT_KEY_CODE_MAP, KeyCode, KeyMod, SCAN_CODE_STR_TO_EVENT_KEY_CODE } from '../../../base/common/keyCodes.js';
import { IWindowsMainService } from '../../windows/electron-main/windows.js';
import { IBaseWindow, ICodeWindow } from '../../window/electron-main/window.js';
import { IAuxiliaryWindowsMainService } from '../../auxiliaryWindow/electron-main/auxiliaryWindows.js';
import { IAuxiliaryWindow } from '../../auxiliaryWindow/electron-main/auxiliaryWindow.js';
import { isMacintosh } from '../../../base/common/platform.js';
import { BrowserViewUri } from '../common/browserViewUri.js';

/** Key combinations that are used in system-level shortcuts. */
const nativeShortcuts = new Set([
	KeyMod.CtrlCmd | KeyCode.KeyA,
	KeyMod.CtrlCmd | KeyCode.KeyC,
	KeyMod.CtrlCmd | KeyCode.KeyV,
	KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyV,
	KeyMod.CtrlCmd | KeyCode.KeyX,
	...(isMacintosh ? [] : [KeyMod.CtrlCmd | KeyCode.KeyY]),
	KeyMod.CtrlCmd | KeyCode.KeyZ,
	KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyZ
]);

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

	private _window: IBaseWindow | undefined;
	private _isSendingKeyEvent = false;

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
		private readonly viewSession: Electron.Session,
		private readonly storageScope: BrowserViewStorageScope,
		createChildView: (options?: Electron.WebContentsViewConstructorOptions) => BrowserView,
		options: Electron.WebContentsViewConstructorOptions | undefined,
		@IWindowsMainService private readonly windowsMainService: IWindowsMainService,
		@IAuxiliaryWindowsMainService private readonly auxiliaryWindowsMainService: IAuxiliaryWindowsMainService
	) {
		super();

		const webPreferences: Electron.WebPreferences & { type: ReturnType<Electron.WebContents['getType']> } = {
			...options?.webPreferences,

			nodeIntegration: false,
			contextIsolation: true,
			sandbox: true,
			webviewTag: false,
			session: viewSession,

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
					const resource = BrowserViewUri.forUrl(details.url, childView.id);

					// Fire event for the workbench to open this view
					this._onDidRequestNewPage.fire({
						resource,
						location,
						position: { x: options.x, y: options.y, width: options.width, height: options.height }
					});

					// Return the webContents so Electron can complete the window.open() call
					return childView.webContents;
				}
			};
		});

		this._view.webContents.on('destroyed', () => {
			this._onDidClose.fire();
		});

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
				// Ignore ERR_ABORTED (-3) which is the expected error when user stops a page load.
				if (errorCode === -3) {
					fireLoadingEvent(false);
					return;
				}

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
				if (this.tryHandleCommand(input)) {
					event.preventDefault();
				}
			}
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
		return {
			url: webContents.getURL(),
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
	 * Clear all storage data for this browser view's session
	 */
	async clearStorage(): Promise<void> {
		await this.viewSession.clearData();
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

	/**
	 * Potentially handle an input event as a VS Code command.
	 * Returns `true` if the event was forwarded to VS Code and should not be handled natively.
	 */
	private tryHandleCommand(input: Electron.Input): boolean {
		const eventKeyCode = SCAN_CODE_STR_TO_EVENT_KEY_CODE[input.code] || 0;
		const keyCode = EVENT_KEY_CODE_MAP[eventKeyCode] || KeyCode.Unknown;

		const isArrowKey = keyCode >= KeyCode.LeftArrow && keyCode <= KeyCode.DownArrow;
		const isNonEditingKey =
			keyCode === KeyCode.Escape ||
			keyCode >= KeyCode.F1 && keyCode <= KeyCode.F24 ||
			keyCode >= KeyCode.AudioVolumeMute;

		// Ignore most Alt-only inputs (often used for accented characters or menu accelerators)
		const isAltOnlyInput = input.alt && !input.control && !input.meta;
		if (isAltOnlyInput && !isNonEditingKey && !isArrowKey) {
			return false;
		}

		// Only reroute if there's a command modifier or it's a non-editing key
		const hasCommandModifier = input.control || input.alt || input.meta;
		if (!hasCommandModifier && !isNonEditingKey) {
			return false;
		}

		// Ignore Ctrl/Cmd + [A,C,V,X,Z] shortcuts to allow native handling (e.g. copy/paste)
		const isControlInput = isMacintosh ? input.meta : input.control;
		const modifiedKeyCode = keyCode |
			(isControlInput ? KeyMod.CtrlCmd : 0) |
			(input.shift ? KeyMod.Shift : 0) |
			(input.alt ? KeyMod.Alt : 0);
		if (nativeShortcuts.has(modifiedKeyCode)) {
			return false;
		}

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
		return true;
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
