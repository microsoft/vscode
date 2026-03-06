/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, DisposableMap } from '../../../base/common/lifecycle.js';
import { VSBuffer } from '../../../base/common/buffer.js';
import { IBrowserViewBounds, IBrowserViewKeyDownEvent, IBrowserViewState, IBrowserViewService, BrowserViewStorageScope, IBrowserViewCaptureScreenshotOptions, IBrowserViewFindInPageOptions, BrowserViewCommandId } from '../common/browserView.js';
import { clipboard, Menu, MenuItem } from 'electron';
import { ICDPTarget, CDPBrowserVersion, CDPWindowBounds, CDPTargetInfo, ICDPConnection, ICDPBrowserTarget } from '../common/cdp/types.js';
import { IEnvironmentMainService } from '../../environment/electron-main/environmentMainService.js';
import { createDecorator, IInstantiationService } from '../../instantiation/common/instantiation.js';
import { BrowserView } from './browserView.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { BrowserViewUri } from '../common/browserViewUri.js';
import { IWindowsMainService } from '../../windows/electron-main/windows.js';
import { BrowserSession } from './browserSession.js';
import { IProductService } from '../../product/common/productService.js';
import { CDPBrowserProxy } from '../common/cdp/proxy.js';
import { IntegratedBrowserOpenSource, logBrowserOpen } from '../common/browserViewTelemetry.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { localize } from '../../../nls.js';
import { INativeHostMainService } from '../../native/electron-main/nativeHostMainService.js';
import { ITextEditorOptions } from '../../editor/common/editor.js';
import { htmlAttributeEncodeValue } from '../../../base/common/strings.js';

export const IBrowserViewMainService = createDecorator<IBrowserViewMainService>('browserViewMainService');

export interface IBrowserViewMainService extends IBrowserViewService, ICDPBrowserTarget {
	readonly _serviceBrand: undefined;

	tryGetBrowserView(id: string): BrowserView | undefined;
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
	private _keybindings: { [commandId: string]: string } = Object.create(null);

	// ICDPBrowserTarget events
	private readonly _onTargetCreated = this._register(new Emitter<BrowserView>());
	readonly onTargetCreated: Event<BrowserView> = this._onTargetCreated.event;

	private readonly _onTargetDestroyed = this._register(new Emitter<BrowserView>());
	readonly onTargetDestroyed: Event<BrowserView> = this._onTargetDestroyed.event;

	constructor(
		@IEnvironmentMainService private readonly environmentMainService: IEnvironmentMainService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IWindowsMainService private readonly windowsMainService: IWindowsMainService,
		@IProductService private readonly productService: IProductService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@INativeHostMainService private readonly nativeHostMainService: INativeHostMainService
	) {
		super();
	}

	async getOrCreateBrowserView(id: string, scope: BrowserViewStorageScope, workspaceId?: string): Promise<IBrowserViewState> {
		if (this.browserViews.has(id)) {
			// Note: scope will be ignored if the view already exists.
			// Browser views cannot be moved between sessions after creation.
			const view = this.browserViews.get(id)!;
			return view.getState();
		}

		const browserSession = BrowserSession.getOrCreate(
			id,
			scope,
			this.environmentMainService.workspaceStorageHome,
			workspaceId
		);

		const view = this.createBrowserView(id, browserSession);
		return view.getState();
	}

	tryGetBrowserView(id: string): BrowserView | undefined {
		return this.browserViews.get(id);
	}

	// ICDPBrowserTarget implementation

	getVersion(): CDPBrowserVersion {
		return {
			protocolVersion: '1.3',
			product: `${this.productService.nameShort}/${this.productService.version}`,
			revision: this.productService.commit || 'unknown',
			userAgent: 'Electron',
			jsVersion: process.versions.v8
		};
	}

	getWindowForTarget(target: ICDPTarget): { windowId: number; bounds: CDPWindowBounds } {
		if (!(target instanceof BrowserView)) {
			throw new Error('Can only get window for targets created by this service');
		}

		const view = target.getWebContentsView();
		const viewBounds = view.getBounds();
		return {
			windowId: 1,
			bounds: {
				left: viewBounds.x,
				top: viewBounds.y,
				width: viewBounds.width,
				height: viewBounds.height,
				windowState: 'normal'
			}
		};
	}

	async attach(): Promise<ICDPConnection> {
		return new CDPBrowserProxy(this);
	}

	async getTargetInfo(): Promise<CDPTargetInfo> {
		return {
			targetId: 'browser',
			type: 'browser',
			title: this.getVersion().product,
			url: '',
			attached: true,
			canAccessOpener: false
		};
	}

	getTargets(): IterableIterator<BrowserView> {
		return this.browserViews.values();
	}

	async createTarget(url: string, browserContextId?: string, windowId?: number): Promise<ICDPTarget> {
		const browserSession = browserContextId ? BrowserSession.get(browserContextId) : undefined;

		return this.openNew(url, {
			session: browserSession,
			windowId,
			editorOptions: { preserveFocus: true },
			source: 'cdpCreated'
		});
	}

	async activateTarget(target: ICDPTarget): Promise<void> {
		if (!(target instanceof BrowserView)) {
			throw new Error('Can only activate targets created by this service');
		}
		// TODO@kycutler
	}

	async closeTarget(target: ICDPTarget): Promise<boolean> {
		if (!(target instanceof BrowserView)) {
			throw new Error('Can only close targets created by this service');
		}

		await this.destroyBrowserView(target.id);
		return true;
	}

	// Browser context management

	getBrowserContexts(): string[] {
		return BrowserSession.getBrowserContextIds();
	}

	async createBrowserContext(): Promise<string> {
		const browserSession = BrowserSession.getOrCreateEphemeral(generateUuid(), 'cdp-created');
		return browserSession.id;
	}

	async disposeBrowserContext(browserContextId: string): Promise<void> {
		if (!browserContextId.startsWith('cdp-created:')) {
			throw new Error('Can only dispose browser contexts created via CDP');
		}

		const browserSession = BrowserSession.get(browserContextId);
		if (!browserSession) {
			throw new Error(`Browser context ${browserContextId} not found`);
		}

		// Close all targets in this context
		for (const view of this.browserViews.values()) {
			if (view.session === browserSession) {
				await this.destroyBrowserView(view.id);
			}
		}

		browserSession.dispose();
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

	onDynamicDidRequestNewPage(id: string) {
		return this._getBrowserView(id).onDidRequestNewPage;
	}

	onDynamicDidFindInPage(id: string) {
		return this._getBrowserView(id).onDidFindInPage;
	}

	onDynamicDidClose(id: string) {
		return this._getBrowserView(id).onDidClose;
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

	async dispatchKeyEvent(id: string, keyEvent: IBrowserViewKeyDownEvent): Promise<void> {
		return this._getBrowserView(id).dispatchKeyEvent(keyEvent);
	}

	async focus(id: string): Promise<void> {
		return this._getBrowserView(id).focus();
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

	async clearGlobalStorage(): Promise<void> {
		const browserSession = BrowserSession.getOrCreateGlobal();
		await browserSession.electronSession.clearData();
	}

	async clearWorkspaceStorage(workspaceId: string): Promise<void> {
		const browserSession = BrowserSession.getOrCreateWorkspace(
			workspaceId,
			this.environmentMainService.workspaceStorageHome
		);
		await browserSession.electronSession.clearData();
	}

	async updateKeybindings(keybindings: { [commandId: string]: string }): Promise<void> {
		this._keybindings = keybindings;
	}

	/**
	 * Create a browser view backed by the given {@link BrowserSession}.
	 */
	private createBrowserView(id: string, browserSession: BrowserSession, options?: Electron.WebContentsViewConstructorOptions): BrowserView {
		if (this.browserViews.has(id)) {
			throw new Error(`Browser view with id ${id} already exists`);
		}

		const view = this.instantiationService.createInstance(
			BrowserView,
			id,
			browserSession,
			// Recursive factory for nested windows (child views share the same session)
			(childOptions) => this.createBrowserView(generateUuid(), browserSession, childOptions),
			(v, params) => this.showContextMenu(v, params),
			options
		);
		this.browserViews.set(id, view);

		this._onTargetCreated.fire(view);
		Event.once(view.onDidClose)(() => {
			this._onTargetDestroyed.fire(view);
			this.browserViews.deleteAndDispose(id);
		});

		return view;
	}

	private async openNew(
		url: string,
		{
			session,
			windowId,
			editorOptions,
			source
		}: {
			session: BrowserSession | undefined;
			windowId: number | undefined;
			editorOptions: ITextEditorOptions;
			source: IntegratedBrowserOpenSource;
		}
	): Promise<ICDPTarget> {
		const targetId = generateUuid();
		const view = this.createBrowserView(targetId, session || BrowserSession.getOrCreateEphemeral(targetId));

		const window = windowId !== undefined ? this.windowsMainService.getWindowById(windowId) : this.windowsMainService.getFocusedWindow();
		if (!window) {
			throw new Error(`Window ${windowId} not found`);
		}


		logBrowserOpen(this.telemetryService, source);

		// Request the workbench to open the editor
		window.sendWhenReady('vscode:runAction', CancellationToken.None, {
			id: '_workbench.open',
			args: [BrowserViewUri.forUrl(url, targetId), [undefined, editorOptions], undefined]
		});

		return view;
	}

	private showContextMenu(view: BrowserView, params: Electron.ContextMenuParams): void {
		const win = view.getElectronWindow();
		if (!win) {
			return;
		}
		const webContents = view.webContents;
		if (webContents.isDestroyed()) {
			return;
		}
		const menu = new Menu();

		if (params.linkURL) {
			menu.append(new MenuItem({
				label: localize('browser.contextMenu.openLinkInNewTab', 'Open Link in New Tab'),
				click: () => {
					void this.openNew(params.linkURL, {
						session: view.session,
						windowId: view.getTopCodeWindow()?.id,
						editorOptions: { preserveFocus: true, inactive: true },
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
						session: view.session,
						windowId: view.getTopCodeWindow()?.id,
						editorOptions: { preserveFocus: true, inactive: true },
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
					accelerator: this._keybindings[BrowserViewCommandId.GoBack],
					click: () => webContents.navigationHistory.goBack()
				}));
			}
			if (webContents.navigationHistory.canGoForward()) {
				menu.append(new MenuItem({
					label: localize('browser.contextMenu.forward', 'Forward'),
					accelerator: this._keybindings[BrowserViewCommandId.GoForward],
					click: () => webContents.navigationHistory.goForward()
				}));
			}
			menu.append(new MenuItem({
				label: localize('browser.contextMenu.reload', 'Reload'),
				accelerator: this._keybindings[BrowserViewCommandId.Reload],
				click: () => webContents.reload()
			}));
		}

		menu.append(new MenuItem({ type: 'separator' }));
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
