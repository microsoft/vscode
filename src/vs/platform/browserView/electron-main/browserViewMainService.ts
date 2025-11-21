/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyboardInputEvent, WebContentsView, webContents, session } from 'electron';
import { Disposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { IBrowserViewBounds, IBrowserViewPaintEvent, IBrowserViewFocusEvent, IBrowserViewKeyDownEvent, IBrowserViewState, IBrowserViewCreateOptions, IBrowserViewNavigationEvent, IBrowserViewLoadingEvent, IBrowserViewTitleChangeEvent, IBrowserViewFaviconChangeEvent } from '../common/browserView.js';
import { IBrowserViewMainService } from './browserView.js';
import { SCAN_CODE_STR_TO_EVENT_KEY_CODE } from '../../../base/common/keyCodes.js';
import { VSBuffer } from '../../../base/common/buffer.js';
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

	private readonly browserViews = new Map<string, WebContentsView>();
	private readonly browserViewWindows = new Map<string, IBaseWindow>();
	private readonly browserViewDisposables = new Map<string, DisposableStore>();
	private readonly faviconCache = new Map<string, string>();
	private readonly knownSessions = new WeakSet<Electron.Session>();
	private _isSendingKeyEvent = false;

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

	private readonly _onDidPaint = this._register(new Emitter<IBrowserViewPaintEvent>());
	readonly onDidPaint: Event<IBrowserViewPaintEvent> = this._onDidPaint.event;

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

	private readonly _onDidChangeFavicons = this._register(new Emitter<IBrowserViewFaviconChangeEvent>());
	readonly onDidChangeFavicons: Event<IBrowserViewFaviconChangeEvent> = this._onDidChangeFavicons.event;

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
				window = this.codeWindowById(auxWindow?.parentId);
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

	async getOrCreateBrowserView(id: string, windowId: number, { offscreen = false }: IBrowserViewCreateOptions = {}): Promise<IBrowserViewState> {
		const window = this.windowById(windowId);
		if (!window) {
			const message = `Window ${windowId} not found for browser view ${id}`;
			this.logService.error(message);
			throw new Error(message);
		}

		if (this.browserViews.has(id)) {
			if (this.browserViewWindows.get(id)?.id !== windowId) {
				// Move windows
				const oldWindow = this.browserViewWindows.get(id);
				if (oldWindow) {
					oldWindow.win?.contentView.removeChildView(this.browserViews.get(id)!);
				}
				this.browserViewWindows.set(id, window);
				window.win?.contentView.addChildView(this.browserViews.get(id)!);
			}
			const view = this.browserViews.get(id)!;
			return {
				url: view.webContents.getURL(),
				title: view.webContents.getTitle(),
				canGoBack: view.webContents.navigationHistory.canGoBack(),
				canGoForward: view.webContents.navigationHistory.canGoForward(),
				loading: view.webContents.isLoading()
			};
		}

		const viewDisposables = new DisposableStore();
		this.browserViewDisposables.set(id, viewDisposables);

		const viewSession = this.getSession(id, windowId);
		this.knownSessions.add(viewSession);

		const view = new WebContentsView({
			webPreferences: {
				nodeIntegration: false,
				contextIsolation: true,
				sandbox: true,
				webviewTag: false,
				offscreen: offscreen ? {
					useSharedTexture: true
				} : undefined,
				session: viewSession
			}
		});

		this.browserViews.set(id, view);
		this.browserViewWindows.set(id, window);
		window.win?.contentView.addChildView(view);

		// Set up event listeners
		const webContents = view.webContents;

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
					this.logService.warn('browserViewMainService.fetchFaviconFailed', error);
					return;
				}
			}

			this._onDidChangeFavicons.fire({ id, favicon: this.faviconCache.get(found)! });
		});

		webContents.on('page-title-updated', (_event, title) => {
			this._onDidChangeTitle.fire({ id, title });
		});

		if (offscreen) {
			webContents.on('paint', (_event, _dirtyRect, image) => {
				const jpegBuffer = image.toJPEG(50);
				const base64 = jpegBuffer.toString('base64');
				const dataUrl = `data:image/jpeg;base64,${base64}`;
				this._onDidPaint.fire({ id, dataUrl });
			});
		}

		const fireNavigationEvent = () => {
			this._onDidNavigate.fire({
				id,
				url: webContents.getURL(),
				canGoBack: webContents.navigationHistory.canGoBack(),
				canGoForward: webContents.navigationHistory.canGoForward()
			});
		};

		const fireLoadingEvent = (loading: boolean) => {
			this._onDidChangeLoadingState.fire({ id, loading });
		};

		// Loading state events
		webContents.on('did-start-loading', () => fireLoadingEvent(true));
		webContents.on('did-finish-load', () => fireLoadingEvent(false));
		webContents.on('did-fail-load', () => fireLoadingEvent(false));

		// Navigation events (when URL actually changes)
		webContents.on('did-navigate', fireNavigationEvent);
		webContents.on('did-navigate-in-page', fireNavigationEvent);

		// Create and register plugins for this web contents
		viewDisposables.add(new ThemePlugin(webContents, this.themeMainService, this.logService));

		// Focus events
		webContents.on('focus', () => {
			this._onDidChangeFocus.fire({ id, focused: true });
		});

		webContents.on('blur', () => {
			this._onDidChangeFocus.fire({ id, focused: false });
		});

		// Key down events - listen for raw key input events
		webContents.on('before-input-event', async (event, input) => {
			if (input.type === 'keyDown' && (input.control || input.alt || input.meta) && !this._isSendingKeyEvent) {
				event.preventDefault();
				this._onDidKeyCommand.fire({
					viewId: id,
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

		return {
			url: webContents.getURL(),
			title: webContents.getTitle(),
			canGoBack: webContents.navigationHistory.canGoBack(),
			canGoForward: webContents.navigationHistory.canGoForward(),
			loading: webContents.isLoading()
		};
	}

	async destroyBrowserView(id: string): Promise<void> {
		const view = this.browserViews.get(id);
		if (!view) {
			return;
		}

		// Remove from parent window
		const window = this.browserViewWindows.get(id);
		if (window) {
			window.win?.contentView.removeChildView(view);
		}

		// Clean up the view and all its event listeners
		// Note: webContents.close() automatically removes all event listeners
		view.webContents.close();
		this.browserViews.delete(id);
		this.browserViewWindows.delete(id);
		this.browserViewDisposables.get(id)?.dispose();
		this.browserViewDisposables.delete(id);
	}

	async layout(id: string, bounds: IBrowserViewBounds): Promise<void> {
		const view = this.browserViews.get(id);
		if (!view) {
			throw new Error(`Browser view ${id} not found`);
		}

		view.webContents.setZoomFactor(bounds.zoomFactor);
		view.setBounds({
			x: Math.round(bounds.x * bounds.zoomFactor),
			y: Math.round(bounds.y * bounds.zoomFactor),
			width: Math.round(bounds.width * bounds.zoomFactor),
			height: Math.round(bounds.height * bounds.zoomFactor)
		});
	}

	async setVisible(id: string, visible: boolean): Promise<void> {
		const view = this.browserViews.get(id);
		if (!view) {
			throw new Error(`Browser view ${id} not found`);
		}

		if (!visible && view.webContents.isFocused()) {
			const window = this.browserViewWindows.get(id);
			if (window) {
				window.win?.webContents.focus();
			}
		}

		view.setVisible(visible);
	}

	async loadURL(id: string, url: string): Promise<void> {
		const view = this.browserViews.get(id);
		if (!view) {
			throw new Error(`Browser view ${id} not found`);
		}

		await view.webContents.loadURL(url);
	}

	async getURL(id: string): Promise<string> {
		const view = this.browserViews.get(id);
		if (!view) {
			throw new Error(`Browser view ${id} not found`);
		}

		return view.webContents.getURL();
	}

	async goBack(id: string): Promise<void> {
		const view = this.browserViews.get(id);
		if (!view) {
			throw new Error(`Browser view ${id} not found`);
		}

		if (view.webContents.navigationHistory.canGoBack()) {
			view.webContents.navigationHistory.goBack();
		}
	}

	async goForward(id: string): Promise<void> {
		const view = this.browserViews.get(id);
		if (!view) {
			throw new Error(`Browser view ${id} not found`);
		}

		if (view.webContents.navigationHistory.canGoForward()) {
			view.webContents.navigationHistory.goForward();
		}
	}

	async reload(id: string): Promise<void> {
		const view = this.browserViews.get(id);

		if (!view) {
			throw new Error(`Browser view ${id} not found`);
		}

		view.webContents.reload();
	}

	async canGoBack(id: string): Promise<boolean> {
		const view = this.browserViews.get(id);
		if (!view) {
			return false;
		}

		return view.webContents.navigationHistory.canGoBack();
	}

	async canGoForward(id: string): Promise<boolean> {
		const view = this.browserViews.get(id);
		if (!view) {
			return false;
		}

		return view.webContents.navigationHistory.canGoForward();
	}

	async captureScreenshot(id: string, quality = 80): Promise<VSBuffer | undefined> {
		const view = this.browserViews.get(id);
		if (!view) {
			return undefined;
		}

		const image = await view.webContents.capturePage(undefined, {
			stayHidden: true,
			stayAwake: true
		});
		const buffer = image.toJPEG(quality);
		return VSBuffer.wrap(buffer);
	}

	async dispatchKeyEvent(viewId: string, keyEvent: IBrowserViewKeyDownEvent): Promise<void> {
		const view = this.browserViews.get(viewId);
		if (!view) {
			throw new Error(`Browser view ${viewId} not found`);
		}
		const event: KeyboardInputEvent = {
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
			await view.webContents.sendInputEvent(event);
		} finally {
			this._isSendingKeyEvent = false;
		}
	}

	async setZoomFactor(id: string, zoomFactor: number): Promise<void> {
		const view = this.browserViews.get(id);
		if (!view) {
			throw new Error(`Browser view ${id} not found`);
		}

		await view.webContents.setZoomFactor(zoomFactor);
	}

	override dispose(): void {
		// Clean up all browser views
		for (const id of this.browserViews.keys()) {
			this.destroyBrowserView(id);
		}
		super.dispose();
	}
}
