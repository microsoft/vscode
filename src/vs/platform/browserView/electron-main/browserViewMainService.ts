/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, DisposableMap } from '../../../base/common/lifecycle.js';
import { VSBuffer } from '../../../base/common/buffer.js';
import { IBrowserViewBounds, IBrowserViewState, IBrowserViewService, IBrowserViewCaptureScreenshotOptions, IBrowserViewFindInPageOptions, BrowserViewCommandId, IBrowserViewOwner, IBrowserViewInfo, IBrowserViewCreatedEvent, IBrowserViewOpenOptions, IBrowserViewCreateOptions, IBrowserViewWindowConfiguration, IBrowserDeviceProfile } from '../common/browserView.js';
import { clipboard, Menu, MenuItem } from 'electron';
import { IEnvironmentMainService } from '../../environment/electron-main/environmentMainService.js';
import { createDecorator, IInstantiationService } from '../../instantiation/common/instantiation.js';
import { BrowserView } from './browserView.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { IWindowsMainService } from '../../windows/electron-main/windows.js';
import { BrowserSession } from './browserSession.js';
import { IApplicationStorageMainService } from '../../storage/electron-main/storageMainService.js';
import { IPermissionCategoryState } from '../common/browserPermissions.js';
import { IntegratedBrowserOpenSource, logBrowserOpen } from '../common/browserViewTelemetry.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { localize } from '../../../nls.js';
import { INativeHostMainService } from '../../native/electron-main/nativeHostMainService.js';
import { htmlAttributeEncodeValue } from '../../../base/common/strings.js';
import { BrowserViewInspectElementId } from './browserViewInspector.js';
import { equals } from '../../../base/common/objects.js';

export const IBrowserViewMainService = createDecorator<IBrowserViewMainService>('browserViewMainService');

export interface IBrowserViewMainService extends IBrowserViewService {
	readonly _serviceBrand: undefined;

	tryGetBrowserView(id: string): BrowserView | undefined;

	/** Create a new target and return it. */
	createTarget(url: string, owner: IBrowserViewOwner, browserContextId?: string): Promise<BrowserView>;
}

export class BrowserViewMainService extends Disposable implements IBrowserViewMainService {
	declare readonly _serviceBrand: undefined;

	/**
	 * Check if a webContents belongs to an integrated browser view.
	 * Delegates to {@link BrowserSession.isBrowserViewWebContents}.
	 */
	static isBrowserViewWebContents(contents: Electron.WebContents): boolean {
		return BrowserSession.isBrowserViewWebContents(contents);
	}

	private readonly browserViews = this._register(new DisposableMap<string, BrowserView>());

	/**
	 * Per-window configuration applied to the browser views that window owns.
	 * Entries are dropped when the window is destroyed.
	 */
	private readonly _windowConfigurations = new Map<number, IBrowserViewWindowConfiguration>();
	private readonly _windowCloseSubscriptions = this._register(new DisposableMap<number>());

	private readonly _onDidCreateBrowserView = this._register(new Emitter<IBrowserViewCreatedEvent>());
	readonly onDidCreateBrowserView: Event<IBrowserViewCreatedEvent> = this._onDidCreateBrowserView.event;

	constructor(
		@IEnvironmentMainService private readonly environmentMainService: IEnvironmentMainService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IWindowsMainService private readonly windowsMainService: IWindowsMainService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@INativeHostMainService private readonly nativeHostMainService: INativeHostMainService,
		@IApplicationStorageMainService private readonly applicationStorageMainService: IApplicationStorageMainService
	) {
		super();
	}

	async getOrCreateBrowserView(id: string, options: IBrowserViewCreateOptions): Promise<IBrowserViewState> {
		if (this.browserViews.has(id)) {
			// Note: options will be ignored if the view already exists.
			const view = this.browserViews.get(id)!;
			return view.getState();
		}

		const ownerWindow = this.windowsMainService.getWindowById(options.owner.mainWindowId);
		if (!ownerWindow) {
			throw new Error(`Owner window with ID ${options.owner.mainWindowId} not found`);
		}

		const browserSession = BrowserSession.getOrCreate(
			this.instantiationService,
			id,
			options.sessionOptions,
			this.environmentMainService.workspaceStorageHome,
			ownerWindow.openedWorkspace?.id
		);

		const view = this.createBrowserView(id, options.owner, browserSession);

		if (options.initialState?.url) {
			void view.loadURL(options.initialState.url);
		}

		return {
			...view.getState(),
			...options.initialState
		};
	}

	tryGetBrowserView(id: string): BrowserView | undefined {
		return this.browserViews.get(id);
	}

	async createTarget(url: string, owner: IBrowserViewOwner, browserContextId?: string): Promise<BrowserView> {
		const browserSession = browserContextId ? BrowserSession.get(browserContextId) : undefined;

		return this.openNew(url, {
			owner,
			session: browserSession,
			openOptions: { preserveFocus: true },
			source: 'cdpCreated'
		});
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

	private _getViewInfo(view: BrowserView): IBrowserViewInfo {
		return {
			id: view.id,
			owner: view.owner,
			state: view.getState()
		};
	}

	async getBrowserViews(windowId?: number): Promise<IBrowserViewInfo[]> {
		const result: IBrowserViewInfo[] = [];
		for (const [, view] of this.browserViews) {
			if (windowId !== undefined && view.owner.mainWindowId !== windowId) {
				continue;
			}
			result.push(this._getViewInfo(view));
		}
		return result;
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

	onDynamicDidChangeVisibility(id: string) {
		return this._getBrowserView(id).onDidChangeVisibility;
	}

	onDynamicDidChangeDevToolsState(id: string) {
		return this._getBrowserView(id).onDidChangeDevToolsState;
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

	onDynamicDidFindInPage(id: string) {
		return this._getBrowserView(id).onDidFindInPage;
	}

	onDynamicDidClose(id: string) {
		return this._getBrowserView(id).onDidClose;
	}

	onDynamicDidSelectElement(id: string) {
		return this._getBrowserView(id).inspector.onDidSelectElement;
	}

	onDynamicDidChangeElementSelectionActive(id: string) {
		return this._getBrowserView(id).inspector.onDidChangeElementSelectionActive;
	}

	onDynamicDidPickArea(id: string) {
		return this._getBrowserView(id).inspector.onDidPickArea;
	}

	onDynamicDidChangeAreaSelectionActive(id: string) {
		return this._getBrowserView(id).inspector.onDidChangeAreaSelectionActive;
	}

	onDynamicDidChangeDeviceEmulation(id: string) {
		return this._getBrowserView(id).emulator.onDidChange;
	}

	onDynamicDidChangeRemoteStatus(id: string) {
		return this._getBrowserView(id).onDidChangeRemoteStatus;
	}

	onDynamicDidRequestPermission(id: string) {
		return this._getBrowserView(id).onDidRequestPermission;
	}

	onDynamicDidChangePermissions(id: string) {
		return this._getBrowserView(id).onDidChangePermissions;
	}

	async getState(id: string): Promise<IBrowserViewState> {
		return this._getBrowserView(id).getState();
	}

	async destroyBrowserView(id: string): Promise<void> {
		return this.browserViews.deleteAndDispose(id);
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

	async reload(id: string, hard?: boolean): Promise<void> {
		return this._getBrowserView(id).reload(hard);
	}

	async toggleDevTools(id: string): Promise<void> {
		return this._getBrowserView(id).toggleDevTools();
	}

	async canGoBack(id: string): Promise<boolean> {
		return this._getBrowserView(id).canGoBack();
	}

	async canGoForward(id: string): Promise<boolean> {
		return this._getBrowserView(id).canGoForward();
	}

	async captureScreenshot(id: string, options?: IBrowserViewCaptureScreenshotOptions): Promise<VSBuffer> {
		return this._getBrowserView(id).captureScreenshot(options);
	}

	async focus(id: string, force?: boolean): Promise<void> {
		return this._getBrowserView(id).focus(force);
	}

	async findInPage(id: string, text: string, options?: IBrowserViewFindInPageOptions): Promise<void> {
		return this._getBrowserView(id).findInPage(text, options);
	}

	async stopFindInPage(id: string, keepSelection?: boolean): Promise<void> {
		return this._getBrowserView(id).stopFindInPage(keepSelection);
	}

	async getSelectedText(id: string): Promise<string> {
		return this._getBrowserView(id).getSelectedText();
	}

	async clearStorage(id: string): Promise<void> {
		return this._getBrowserView(id).clearStorage();
	}

	async setBrowserZoomIndex(id: string, zoomIndex: number): Promise<void> {
		return this._getBrowserView(id).setBrowserZoomIndex(zoomIndex);
	}

	async setDeviceEmulation(id: string, device: IBrowserDeviceProfile | undefined): Promise<void> {
		return this._getBrowserView(id).emulator.setDevice(device);
	}

	async trustCertificate(id: string, host: string, fingerprint: string): Promise<void> {
		return this._getBrowserView(id).trustCertificate(host, fingerprint);
	}

	async untrustCertificate(id: string, host: string, fingerprint: string): Promise<void> {
		return this._getBrowserView(id).untrustCertificate(host, fingerprint);
	}

	async deleteBrowserHistory(id: string, entryIds?: readonly number[]): Promise<void> {
		this._getBrowserView(id).session.history.delete(entryIds);
	}

	async setPermissions(id: string, origin: string, grants: readonly IPermissionCategoryState[]): Promise<void> {
		this._getBrowserView(id).session.permissions.set(origin, grants);
	}

	async selectDevice(id: string, requestId: string, deviceId: string | null): Promise<void> {
		this._getBrowserView(id).selectDevice(requestId, deviceId);
	}

	async clearGlobalStorage(): Promise<void> {
		const browserSession = BrowserSession.getOrCreateGlobal(this.instantiationService);
		browserSession.connectStorage(this.applicationStorageMainService);
		await browserSession.clearData();
	}

	async clearWorkspaceStorage(workspaceId: string): Promise<void> {
		const browserSession = BrowserSession.getOrCreateWorkspace(
			this.instantiationService,
			workspaceId,
			this.environmentMainService.workspaceStorageHome
		);
		browserSession.connectStorage(this.applicationStorageMainService);
		await browserSession.clearData();
	}

	async getConsoleLogs(id: string): Promise<string> {
		return this._getBrowserView(id).getConsoleLogs();
	}

	async toggleElementSelection(id: string, enabled?: boolean): Promise<void> {
		return this._getBrowserView(id).inspector.toggleElementSelection(enabled);
	}

	async toggleAreaSelection(id: string, enabled?: boolean): Promise<void> {
		return this._getBrowserView(id).inspector.toggleAreaSelection(enabled);
	}

	async updateWindowConfiguration(windowId: number, config: IBrowserViewWindowConfiguration): Promise<void> {
		const oldConfig = this._windowConfigurations.get(windowId);
		const didThemeChange = !equals(oldConfig?.theme, config.theme);
		const didProxyChange = !equals(oldConfig?.proxyInfo, config.proxyInfo);

		this._windowConfigurations.set(windowId, config);
		this._ensureWindowCloseSubscription(windowId);

		for (const [, view] of this.browserViews) {
			if (view.owner.mainWindowId === windowId) {
				if (didThemeChange) {
					view.inspector.setTheme(config.theme);
				}
				if (didProxyChange) {
					view.session.remote.acquire(view.id, config.proxyInfo);
				}
				if (typeof config.maxHistoryEntries === 'number') {
					view.session.history.setMaxEntries(config.maxHistoryEntries);
				}
			}
		}

		this._recomputeTrustedFileRoots();
	}

	private _ensureWindowCloseSubscription(windowId: number): void {
		if (this._windowCloseSubscriptions.has(windowId)) {
			return;
		}
		const window = this.windowsMainService.getWindowById(windowId);
		if (!window) {
			return;
		}
		const onWindowGone = Event.any(window.onDidClose, window.onDidDestroy);
		this._windowCloseSubscriptions.set(windowId, Event.once(onWindowGone)(() => {
			this._windowCloseSubscriptions.deleteAndDispose(windowId);
			if (this._windowConfigurations.delete(windowId)) {
				this._recomputeTrustedFileRoots();
			}
		}));
	}

	private _recomputeTrustedFileRoots(): void {
		const roots = new Set<string>();
		for (const configuration of this._windowConfigurations.values()) {
			for (const root of configuration.trustedFileRoots) {
				roots.add(root);
			}
		}
		BrowserSession.setTrustedFileRoots([...roots]);
	}

	/**
	 * Create a browser view backed by the given {@link BrowserSession}.
	 */
	private createBrowserView(id: string, owner: IBrowserViewOwner, browserSession: BrowserSession, options?: Electron.WebContentsViewConstructorOptions): BrowserView {
		if (this.browserViews.has(id)) {
			throw new Error(`Browser view with id ${id} already exists`);
		}

		browserSession.connectStorage(this.applicationStorageMainService);
		const windowConfiguration = this._windowConfigurations.get(owner.mainWindowId);
		if (typeof windowConfiguration?.maxHistoryEntries === 'number') {
			browserSession.history.setMaxEntries(windowConfiguration.maxHistoryEntries);
		}

		// Hold a ref to the tunnel proxy for as long as this view is alive.
		browserSession.remote.acquire(id, windowConfiguration?.proxyInfo);

		const view = this.instantiationService.createInstance(
			BrowserView,
			id,
			owner,
			browserSession,
			// Recursive factory for nested windows (child views share the same session and owner).
			(url, electronOptions, openOptions) => {
				const child = this.createBrowserView(generateUuid(), owner, browserSession, electronOptions);

				if (url) {
					void child.loadURL(url).catch(() => { });
				}

				const info = this._getViewInfo(child);
				this._onDidCreateBrowserView.fire({
					info: url ? { ...info, state: { ...info.state, url } } : info,
					openOptions
				});

				return child;
			},
			(v, params) => this.showContextMenu(v, params),
			options
		);
		this.browserViews.set(id, view);
		if (windowConfiguration?.theme) {
			view.inspector.setTheme(windowConfiguration.theme);
		}

		Event.once(view.onDidClose)(() => {
			browserSession.remote.release(id);
			this.browserViews.deleteAndDispose(id);
		});

		return view;
	}

	private async openNew(
		url: string,
		{
			owner,
			session,
			openOptions,
			source
		}: {
			owner: IBrowserViewOwner;
			session: BrowserSession | undefined;
			openOptions: IBrowserViewOpenOptions | undefined;
			source: IntegratedBrowserOpenSource;
		}
	): Promise<BrowserView> {
		const targetId = generateUuid();
		const view = this.createBrowserView(targetId, owner, session || BrowserSession.getOrCreateEphemeral(this.instantiationService, targetId));

		if (url) {
			void view.loadURL(url).catch(() => { });
		}

		logBrowserOpen(this.telemetryService, source);

		// Fire creation event so the workbench can open an editor tab
		const info = this._getViewInfo(view);
		this._onDidCreateBrowserView.fire({
			info: url ? { ...info, state: { ...info.state, url } } : info,
			openOptions
		});

		return view;
	}

	private async showContextMenu(view: BrowserView, params: Electron.ContextMenuParams): Promise<void> {
		const win = view.getElectronWindow();
		if (!win) {
			return;
		}
		const webContents = view.webContents;
		if (webContents.isDestroyed()) {
			return;
		}

		const windowConfiguration = this._windowConfigurations.get(view.owner.mainWindowId);
		const inspectTarget = windowConfiguration?.aiFeaturesDisabled
			? undefined
			: params.frame && await view.inspector.getElementHandle(BrowserViewInspectElementId.ContextMenuTarget, params.frame);
		const menu = new Menu();

		if (params.linkURL) {
			menu.append(new MenuItem({
				label: localize('browser.contextMenu.openLinkInNewTab', 'Open Link in New Tab'),
				click: () => {
					void this.openNew(params.linkURL, {
						owner: view.owner,
						session: view.session,
						openOptions: { preserveFocus: true, background: true },
						source: 'browserLinkBackground'
					});
				}
			}));
			menu.append(new MenuItem({
				label: localize('browser.contextMenu.openLinkInExternalBrowser', 'Open Link in External Browser'),
				click: () => { void this.nativeHostMainService.openExternal(undefined, params.linkURL); }
			}));
			menu.append(new MenuItem({ type: 'separator' }));
			menu.append(new MenuItem({
				label: localize('browser.contextMenu.copyLink', 'Copy Link'),
				click: () => {
					clipboard.write({
						text: params.linkURL,
						html: `<a href="${encodeURI(params.linkURL)}">${htmlAttributeEncodeValue(params.linkText || params.linkURL)}</a>`
					});
				}
			}));
		}

		if (params.hasImageContents && params.srcURL) {
			if (menu.items.length > 0) {
				menu.append(new MenuItem({ type: 'separator' }));
			}
			menu.append(new MenuItem({
				label: localize('browser.contextMenu.openImageInNewTab', 'Open Image in New Tab'),
				click: () => {
					void this.openNew(params.srcURL!, {
						owner: view.owner,
						session: view.session,
						openOptions: { preserveFocus: true, background: true },
						source: 'browserLinkBackground'
					});
				}
			}));
			menu.append(new MenuItem({
				label: localize('browser.contextMenu.copyImage', 'Copy Image'),
				click: () => { view.webContents.copyImageAt(params.x, params.y); }
			}));
			menu.append(new MenuItem({
				label: localize('browser.contextMenu.copyImageUrl', 'Copy Image URL'),
				click: () => { clipboard.writeText(params.srcURL!); }
			}));
		}

		if (params.isEditable) {
			menu.append(new MenuItem({ role: 'cut', enabled: params.editFlags.canCut }));
			menu.append(new MenuItem({ role: 'copy', enabled: params.editFlags.canCopy }));
			menu.append(new MenuItem({ role: 'paste', enabled: params.editFlags.canPaste }));
			menu.append(new MenuItem({ role: 'pasteAndMatchStyle', enabled: params.editFlags.canPaste }));
			menu.append(new MenuItem({ role: 'selectAll', enabled: params.editFlags.canSelectAll }));
		} else if (params.selectionText) {
			menu.append(new MenuItem({ role: 'copy' }));
		}

		// Add navigation items as defaults
		if (menu.items.length === 0) {
			if (webContents.navigationHistory.canGoBack()) {
				menu.append(new MenuItem({
					label: localize('browser.contextMenu.back', 'Back'),
					accelerator: windowConfiguration?.keybindings[BrowserViewCommandId.GoBack],
					click: () => webContents.navigationHistory.goBack()
				}));
			}
			if (webContents.navigationHistory.canGoForward()) {
				menu.append(new MenuItem({
					label: localize('browser.contextMenu.forward', 'Forward'),
					accelerator: windowConfiguration?.keybindings[BrowserViewCommandId.GoForward],
					click: () => webContents.navigationHistory.goForward()
				}));
			}
			menu.append(new MenuItem({
				label: localize('browser.contextMenu.reload', 'Reload'),
				accelerator: windowConfiguration?.keybindings[BrowserViewCommandId.Reload],
				click: () => webContents.reload()
			}));
		}

		menu.append(new MenuItem({ type: 'separator' }));
		if (inspectTarget) {
			menu.append(new MenuItem({
				label: localize('browser.contextMenu.addElementToChat', 'Add Element to Chat'),
				click: () => inspectTarget.addToChat()
			}));
			void inspectTarget.highlight().catch(() => { });
			menu.on('menu-will-close', () => inspectTarget.dispose());
		}
		menu.append(new MenuItem({
			label: localize('browser.contextMenu.inspect', 'Inspect'),
			click: () => webContents.inspectElement(params.x, params.y)
		}));

		const viewBounds = view.getWebContentsView().getBounds();
		menu.popup({
			window: win,
			x: viewBounds.x + params.x,
			y: viewBounds.y + params.y,
			sourceType: params.menuSourceType
		});
	}
}
