/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WebContentsView, webContents, session } from 'electron';
import { Disposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { IBrowserViewBounds, IBrowserViewFocusEvent, IBrowserViewKeyDownEvent, IBrowserViewState, IBrowserViewNavigationEvent, IBrowserViewLoadingEvent, IBrowserViewTitleChangeEvent, IBrowserViewFaviconChangeEvent } from '../common/browserView.js';
import { IBrowserViewMainService } from './browserView.js';
import { SCAN_CODE_STR_TO_EVENT_KEY_CODE } from '../../../base/common/keyCodes.js';
import { ThemePlugin } from './plugins/themePlugin.js';
import { IThemeMainService } from '../../theme/electron-main/themeMainService.js';
import { IWindowsMainService } from '../../windows/electron-main/windows.js';
import { IBaseWindow, ICodeWindow } from '../../window/electron-main/window.js';
import { IAuxiliaryWindowsMainService } from '../../auxiliaryWindow/electron-main/auxiliaryWindows.js';
import { IAuxiliaryWindow } from '../../auxiliaryWindow/electron-main/auxiliaryWindow.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { joinPath } from '../../../base/common/resources.js';
import { IEnvironmentMainService } from '../../environment/electron-main/environmentMainService.js';
import { ILogService } from '../../log/common/log.js';

export class BrowserViewMainService extends Disposable implements IBrowserViewMainService {
	declare readonly _serviceBrand: undefined;

	private readonly browserViews = new Map<string, BrowserView>();
	private readonly knownSessions = new WeakSet<Electron.Session>();

	constructor(
		@IThemeMainService private readonly themeMainService: IThemeMainService,
		@IWindowsMainService private readonly windowsMainService: IWindowsMainService,
		@IAuxiliaryWindowsMainService private readonly auxiliaryWindowsMainService: IAuxiliaryWindowsMainService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IEnvironmentMainService private readonly environmentMainService: IEnvironmentMainService,
		@ILogService private readonly logService: ILogService
	) {
		super();
	}

	/**
	 * Get the session for a browser view based on data storage setting and workspace
	 */
	private getSession(viewId: string, windowId: number): Electron.Session {
		const dataStorageSetting = this.configurationService.getValue<string>('workbench.browser.dataStorage', { resource: undefined }) ?? 'workspace';
		const workspaceId = this.workspaceIdByWindowId(windowId);

		switch (dataStorageSetting) {
			case 'global':
				return session.fromPartition('persist:vscode-browser');
			case 'workspace':
				if (workspaceId) {
					const storage = joinPath(this.environmentMainService.workspaceStorageHome, workspaceId, 'browserStorage');
					return session.fromPath(storage.fsPath);
				}
			// fallthrough
			case 'ephemeral':
			default:
				return session.fromPartition(`vscode-browser-${viewId}`);
		}
	}

	/**
	 * Check if a webContents belongs to an integrated browser view
	 */
	isBrowserViewWebContents(contents: Electron.WebContents): boolean {
		return this.knownSessions.has(contents.session);
	}

	private workspaceIdByWindowId(windowId: number | undefined): string | undefined {
		let window = this.codeWindowById(windowId);
		if (!window) {
			const auxWindow = this.auxiliaryWindowById(windowId);
			if (auxWindow) {
				window = this.codeWindowById(auxWindow.parentId);
			}
		}
		return window?.openedWorkspace?.id;
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

	async getOrCreateBrowserView(id: string, windowId: number): Promise<IBrowserViewState> {
		const window = this.windowById(windowId);
		if (!window) {
			const message = `Window ${windowId} not found for browser view ${id}`;
			this.logService.error(message);
			throw new Error(message);
		}

		if (this.browserViews.has(id)) {
			const view = this.browserViews.get(id)!;
			// Move to new window if necessary
			view.moveToWindow(window);
			return view.getState();
		}

		const viewSession = this.getSession(id, windowId);
		this.knownSessions.add(viewSession);

		const view = new BrowserView(window, viewSession, this.themeMainService, this.logService);
		this.browserViews.set(id, view);

		return view.getState();
	}

	/**
	 * Get a browser view or throw if not found
	 */
	private _getBrowserView(id: string): BrowserView {
		const view = this.browserViews.get(id);
		if (!view) {
			throw new Error(`Browser view ${id} not found`);
		}
		return view;
	}

	onDynamicDidNavigate(id: string) {
		return this._getBrowserView(id).onDidNavigate;
	}

	onDynamicDidChangeLoadingState(id: string) {
		return this._getBrowserView(id).onDidChangeLoadingState;
	}

	onDynamicDidChangeFocus(id: string) {
		return this._getBrowserView(id).onDidChangeFocus;
	}

	onDynamicDidKeyCommand(id: string) {
		return this._getBrowserView(id).onDidKeyCommand;
	}

	onDynamicDidChangeTitle(id: string) {
		return this._getBrowserView(id).onDidChangeTitle;
	}

	onDynamicDidChangeFavicon(id: string) {
		return this._getBrowserView(id).onDidChangeFavicon;
	}

	async destroyBrowserView(id: string): Promise<void> {
		this._getBrowserView(id).dispose();
		this.browserViews.delete(id);
	}

	async layout(id: string, bounds: IBrowserViewBounds): Promise<void> {
		return this._getBrowserView(id).layout(bounds);
	}

	async setVisible(id: string, visible: boolean): Promise<void> {
		return this._getBrowserView(id).setVisible(visible);
	}

	async loadURL(id: string, url: string): Promise<void> {
		return this._getBrowserView(id).loadURL(url);
	}

	async getURL(id: string): Promise<string> {
		return this._getBrowserView(id).getURL();
	}

	async goBack(id: string): Promise<void> {
		return this._getBrowserView(id).goBack();
	}

	async goForward(id: string): Promise<void> {
		return this._getBrowserView(id).goForward();
	}

	async reload(id: string): Promise<void> {
		return this._getBrowserView(id).reload();
	}

	async canGoBack(id: string): Promise<boolean> {
		return this._getBrowserView(id).canGoBack();
	}

	async canGoForward(id: string): Promise<boolean> {
		return this._getBrowserView(id).canGoForward();
	}

	async captureScreenshot(id: string, quality = 80): Promise<string> {
		return this._getBrowserView(id).captureScreenshot(quality);
	}

	async dispatchKeyEvent(id: string, keyEvent: IBrowserViewKeyDownEvent): Promise<void> {
		return this._getBrowserView(id).dispatchKeyEvent(keyEvent);
	}

	async setZoomFactor(id: string, zoomFactor: number): Promise<void> {
		return this._getBrowserView(id).setZoomFactor(zoomFactor);
	}

	override dispose(): void {
		// Clean up all browser views
		for (const view of this.browserViews.values()) {
			view.dispose();
		}
		this.browserViews.clear();
		super.dispose();
	}
}


/**
 * Represents a single browser view instance with its WebContentsView and all associated logic.
 * This class encapsulates all operations and events for a single browser view.
 */
export class BrowserView extends Disposable {
	private readonly view: WebContentsView;
	private readonly viewDisposables = this._register(new DisposableStore());
	private readonly faviconCache = new Map<string, string>();
	private _isSendingKeyEvent = false;

	private readonly _onDidNavigate = this._register(new Emitter<IBrowserViewNavigationEvent>());
	readonly onDidNavigate: Event<IBrowserViewNavigationEvent> = this._onDidNavigate.event;

	private readonly _onDidChangeLoadingState = this._register(new Emitter<IBrowserViewLoadingEvent>());
	readonly onDidChangeLoadingState: Event<IBrowserViewLoadingEvent> = this._onDidChangeLoadingState.event;

	private readonly _onDidChangeFocus = this._register(new Emitter<IBrowserViewFocusEvent>());
	readonly onDidChangeFocus: Event<IBrowserViewFocusEvent> = this._onDidChangeFocus.event;

	private readonly _onDidKeyCommand = this._register(new Emitter<IBrowserViewKeyDownEvent>());
	readonly onDidKeyCommand: Event<IBrowserViewKeyDownEvent> = this._onDidKeyCommand.event;

	private readonly _onDidChangeTitle = this._register(new Emitter<IBrowserViewTitleChangeEvent>());
	readonly onDidChangeTitle: Event<IBrowserViewTitleChangeEvent> = this._onDidChangeTitle.event;

	private readonly _onDidChangeFavicon = this._register(new Emitter<IBrowserViewFaviconChangeEvent>());
	readonly onDidChangeFavicon: Event<IBrowserViewFaviconChangeEvent> = this._onDidChangeFavicon.event;

	constructor(
		private window: IBaseWindow,
		viewSession: Electron.Session,
		themeMainService: IThemeMainService,
		private readonly logService: ILogService
	) {
		super();

		this.view = new WebContentsView({
			webPreferences: {
				nodeIntegration: false,
				contextIsolation: true,
				sandbox: true,
				webviewTag: false,
				session: viewSession
			}
		});

		window.win?.contentView.addChildView(this.view);

		this.setupEventListeners();

		// Create and register plugins for this web contents
		this.viewDisposables.add(new ThemePlugin(this.view.webContents, themeMainService, this.logService));
	}

	private setupEventListeners(): void {
		const webContents = this.view.webContents;

		// Favicon events
		webContents.on('page-favicon-updated', async (_event, favicons) => {
			if (!favicons || favicons.length === 0) {
				return;
			}

			let found = favicons.find(f => this.faviconCache.get(f));
			if (!found) {
				found = favicons[0];
				try {
					const firstImage = await webContents.session.fetch(found, {
						cache: 'force-cache'
					});
					const type = await firstImage.headers.get('content-type');
					const buffer = await firstImage.arrayBuffer();
					const favicon = `data:${type};base64,${Buffer.from(buffer).toString('base64')}`;
					this.faviconCache.set(found, favicon);
				} catch (error) {
					this.logService.warn('browserView.fetchFaviconFailed', error);
					return;
				}
			}

			this._onDidChangeFavicon.fire({ favicon: this.faviconCache.get(found)! });
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
			this._onDidChangeLoadingState.fire({ loading });
		};

		// Loading state events
		webContents.on('did-start-loading', () => fireLoadingEvent(true));
		webContents.on('did-finish-load', () => fireLoadingEvent(false));
		webContents.on('did-fail-load', () => fireLoadingEvent(false));

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
			if (input.type === 'keyDown' && (input.control || input.alt || input.meta) && !this._isSendingKeyEvent) {
				event.preventDefault();
				this._onDidKeyCommand.fire({
					key: input.key,
					keyCode: SCAN_CODE_STR_TO_EVENT_KEY_CODE[input.code] || 0,
					code: input.code,
					ctrlKey: input.control || false,
					shiftKey: input.shift || false,
					altKey: input.alt || false,
					metaKey: input.meta || false,
					repeat: input.isAutoRepeat || false
				});
			}
		});
	}

	/**
	 * Get the current state of this browser view
	 */
	getState(): IBrowserViewState {
		const webContents = this.view.webContents;
		return {
			url: webContents.getURL(),
			title: webContents.getTitle(),
			canGoBack: webContents.navigationHistory.canGoBack(),
			canGoForward: webContents.navigationHistory.canGoForward(),
			loading: webContents.isLoading()
		};
	}

	/**
	 * Move this view to a different window
	 */
	moveToWindow(newWindow: IBaseWindow): void {
		if (this.window.id === newWindow.id) {
			return;
		}

		this.window.win?.contentView.removeChildView(this.view);
		this.window = newWindow;
		newWindow.win?.contentView.addChildView(this.view);
	}

	/**
	 * Update the layout bounds of this view
	 */
	layout(bounds: IBrowserViewBounds): void {
		this.view.webContents.setZoomFactor(bounds.zoomFactor);
		this.view.setBounds({
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
		if (!visible && this.view.webContents.isFocused()) {
			this.window.win?.webContents.focus();
		}

		this.view.setVisible(visible);
	}

	/**
	 * Load a URL in this view
	 */
	async loadURL(url: string): Promise<void> {
		await this.view.webContents.loadURL(url);
	}

	/**
	 * Get the current URL
	 */
	getURL(): string {
		return this.view.webContents.getURL();
	}

	/**
	 * Navigate back in history
	 */
	goBack(): void {
		if (this.view.webContents.navigationHistory.canGoBack()) {
			this.view.webContents.navigationHistory.goBack();
		}
	}

	/**
	 * Navigate forward in history
	 */
	goForward(): void {
		if (this.view.webContents.navigationHistory.canGoForward()) {
			this.view.webContents.navigationHistory.goForward();
		}
	}

	/**
	 * Reload the current page
	 */
	reload(): void {
		this.view.webContents.reload();
	}

	/**
	 * Check if the view can navigate back
	 */
	canGoBack(): boolean {
		return this.view.webContents.navigationHistory.canGoBack();
	}

	/**
	 * Check if the view can navigate forward
	 */
	canGoForward(): boolean {
		return this.view.webContents.navigationHistory.canGoForward();
	}

	/**
	 * Capture a screenshot of this view
	 */
	async captureScreenshot(quality = 80): Promise<string> {
		const image = await this.view.webContents.capturePage(undefined, {
			stayHidden: true,
			stayAwake: true
		});
		const buffer = image.toJPEG(quality);
		return `data:image/jpeg;base64,${buffer.toString('base64')}`;
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
			await this.view.webContents.sendInputEvent(event);
		} finally {
			this._isSendingKeyEvent = false;
		}
	}

	/**
	 * Set the zoom factor of this view
	 */
	async setZoomFactor(zoomFactor: number): Promise<void> {
		await this.view.webContents.setZoomFactor(zoomFactor);
	}

	/**
	 * Get the underlying WebContentsView
	 */
	getWebContentsView(): WebContentsView {
		return this.view;
	}

	override dispose(): void {
		// Remove from parent window
		this.window.win?.contentView.removeChildView(this.view);

		// Clean up the view and all its event listeners
		// Note: webContents.close() automatically removes all event listeners
		this.view.webContents.close();

		super.dispose();
	}
}
