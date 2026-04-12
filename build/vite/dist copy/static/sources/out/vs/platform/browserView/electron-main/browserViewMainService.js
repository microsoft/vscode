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
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, DisposableMap } from '../../../base/common/lifecycle.js';
import { CancellationToken, CancellationTokenSource } from '../../../base/common/cancellation.js';
import { BrowserViewCommandId } from '../common/browserView.js';
import { clipboard, Menu, MenuItem } from 'electron';
import { IEnvironmentMainService } from '../../environment/electron-main/environmentMainService.js';
import { createDecorator, IInstantiationService } from '../../instantiation/common/instantiation.js';
import { BrowserView } from './browserView.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { BrowserViewUri } from '../common/browserViewUri.js';
import { IWindowsMainService } from '../../windows/electron-main/windows.js';
import { BrowserSession } from './browserSession.js';
import { IProductService } from '../../product/common/productService.js';
import { IApplicationStorageMainService } from '../../storage/electron-main/storageMainService.js';
import { CDPBrowserProxy } from '../common/cdp/proxy.js';
import { logBrowserOpen } from '../common/browserViewTelemetry.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { localize } from '../../../nls.js';
import { INativeHostMainService } from '../../native/electron-main/nativeHostMainService.js';
import { htmlAttributeEncodeValue } from '../../../base/common/strings.js';
export const IBrowserViewMainService = createDecorator('browserViewMainService');
let BrowserViewMainService = class BrowserViewMainService extends Disposable {
    /**
     * Check if a webContents belongs to an integrated browser view.
     * Delegates to {@link BrowserSession.isBrowserViewWebContents}.
     */
    static isBrowserViewWebContents(contents) {
        return BrowserSession.isBrowserViewWebContents(contents);
    }
    constructor(environmentMainService, instantiationService, windowsMainService, productService, telemetryService, nativeHostMainService, applicationStorageMainService) {
        super();
        this.environmentMainService = environmentMainService;
        this.instantiationService = instantiationService;
        this.windowsMainService = windowsMainService;
        this.productService = productService;
        this.telemetryService = telemetryService;
        this.nativeHostMainService = nativeHostMainService;
        this.applicationStorageMainService = applicationStorageMainService;
        this.browserViews = this._register(new DisposableMap());
        this._activeTokens = new Map();
        this._keybindings = Object.create(null);
        // ICDPBrowserTarget events
        this._onTargetCreated = this._register(new Emitter());
        this.onTargetCreated = this._onTargetCreated.event;
        this._onTargetDestroyed = this._register(new Emitter());
        this.onTargetDestroyed = this._onTargetDestroyed.event;
    }
    async getOrCreateBrowserView(id, scope, workspaceId) {
        if (this.browserViews.has(id)) {
            // Note: scope will be ignored if the view already exists.
            // Browser views cannot be moved between sessions after creation.
            const view = this.browserViews.get(id);
            return view.getState();
        }
        const browserSession = BrowserSession.getOrCreate(id, scope, this.environmentMainService.workspaceStorageHome, workspaceId);
        const view = this.createBrowserView(id, browserSession);
        return view.getState();
    }
    tryGetBrowserView(id) {
        return this.browserViews.get(id);
    }
    // ICDPBrowserTarget implementation
    getVersion() {
        return {
            protocolVersion: '1.3',
            product: `${this.productService.nameShort}/${this.productService.version}`,
            revision: this.productService.commit || 'unknown',
            userAgent: 'Electron',
            jsVersion: process.versions.v8
        };
    }
    getWindowForTarget(target) {
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
    async attach() {
        return new CDPBrowserProxy(this);
    }
    async getTargetInfo() {
        return {
            targetId: 'browser',
            type: 'browser',
            title: this.getVersion().product,
            url: '',
            attached: true,
            canAccessOpener: false
        };
    }
    getTargets() {
        return this.browserViews.values();
    }
    async createTarget(url, browserContextId, windowId) {
        const browserSession = browserContextId ? BrowserSession.get(browserContextId) : undefined;
        return this.openNew(url, {
            session: browserSession,
            windowId,
            editorOptions: { preserveFocus: true },
            source: 'cdpCreated'
        });
    }
    async activateTarget(target) {
        if (!(target instanceof BrowserView)) {
            throw new Error('Can only activate targets created by this service');
        }
        // TODO@kycutler
    }
    async closeTarget(target) {
        if (!(target instanceof BrowserView)) {
            throw new Error('Can only close targets created by this service');
        }
        await this.destroyBrowserView(target.id);
        return true;
    }
    // Browser context management
    getBrowserContexts() {
        return BrowserSession.getBrowserContextIds();
    }
    async createBrowserContext() {
        const browserSession = BrowserSession.getOrCreateEphemeral(generateUuid(), 'cdp-created');
        return browserSession.id;
    }
    async disposeBrowserContext(browserContextId) {
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
    }
    /**
     * Get a browser view or throw if not found
     */
    _getBrowserView(id) {
        const view = this.browserViews.get(id);
        if (!view) {
            throw new Error(`Browser view ${id} not found`);
        }
        return view;
    }
    onDynamicDidNavigate(id) {
        return this._getBrowserView(id).onDidNavigate;
    }
    onDynamicDidChangeLoadingState(id) {
        return this._getBrowserView(id).onDidChangeLoadingState;
    }
    onDynamicDidChangeFocus(id) {
        return this._getBrowserView(id).onDidChangeFocus;
    }
    onDynamicDidChangeVisibility(id) {
        return this._getBrowserView(id).onDidChangeVisibility;
    }
    onDynamicDidChangeDevToolsState(id) {
        return this._getBrowserView(id).onDidChangeDevToolsState;
    }
    onDynamicDidKeyCommand(id) {
        return this._getBrowserView(id).onDidKeyCommand;
    }
    onDynamicDidChangeTitle(id) {
        return this._getBrowserView(id).onDidChangeTitle;
    }
    onDynamicDidChangeFavicon(id) {
        return this._getBrowserView(id).onDidChangeFavicon;
    }
    onDynamicDidRequestNewPage(id) {
        return this._getBrowserView(id).onDidRequestNewPage;
    }
    onDynamicDidFindInPage(id) {
        return this._getBrowserView(id).onDidFindInPage;
    }
    onDynamicDidClose(id) {
        return this._getBrowserView(id).onDidClose;
    }
    async getState(id) {
        return this._getBrowserView(id).getState();
    }
    async destroyBrowserView(id) {
        return this.browserViews.deleteAndDispose(id);
    }
    async layout(id, bounds) {
        return this._getBrowserView(id).layout(bounds);
    }
    async setVisible(id, visible) {
        return this._getBrowserView(id).setVisible(visible);
    }
    async loadURL(id, url) {
        return this._getBrowserView(id).loadURL(url);
    }
    async getURL(id) {
        return this._getBrowserView(id).getURL();
    }
    async goBack(id) {
        return this._getBrowserView(id).goBack();
    }
    async goForward(id) {
        return this._getBrowserView(id).goForward();
    }
    async reload(id, hard) {
        return this._getBrowserView(id).reload(hard);
    }
    async toggleDevTools(id) {
        return this._getBrowserView(id).toggleDevTools();
    }
    async canGoBack(id) {
        return this._getBrowserView(id).canGoBack();
    }
    async canGoForward(id) {
        return this._getBrowserView(id).canGoForward();
    }
    async captureScreenshot(id, options) {
        return this._getBrowserView(id).captureScreenshot(options);
    }
    async focus(id) {
        return this._getBrowserView(id).focus();
    }
    async findInPage(id, text, options) {
        return this._getBrowserView(id).findInPage(text, options);
    }
    async stopFindInPage(id, keepSelection) {
        return this._getBrowserView(id).stopFindInPage(keepSelection);
    }
    async getSelectedText(id) {
        return this._getBrowserView(id).getSelectedText();
    }
    async clearStorage(id) {
        return this._getBrowserView(id).clearStorage();
    }
    async setBrowserZoomIndex(id, zoomIndex) {
        return this._getBrowserView(id).setBrowserZoomIndex(zoomIndex);
    }
    async trustCertificate(id, host, fingerprint) {
        return this._getBrowserView(id).trustCertificate(host, fingerprint);
    }
    async untrustCertificate(id, host, fingerprint) {
        return this._getBrowserView(id).untrustCertificate(host, fingerprint);
    }
    async clearGlobalStorage() {
        const browserSession = BrowserSession.getOrCreateGlobal();
        browserSession.connectStorage(this.applicationStorageMainService);
        await browserSession.clearData();
    }
    async clearWorkspaceStorage(workspaceId) {
        const browserSession = BrowserSession.getOrCreateWorkspace(workspaceId, this.environmentMainService.workspaceStorageHome);
        browserSession.connectStorage(this.applicationStorageMainService);
        await browserSession.clearData();
    }
    async getConsoleLogs(id) {
        return this._getBrowserView(id).getConsoleLogs();
    }
    async getElementData(id, cancellationId) {
        return this._makeCancellable(cancellationId, (token) => this._getBrowserView(id).getElementData(token));
    }
    async getFocusedElementData(id) {
        return this._getBrowserView(id).getFocusedElementData();
    }
    async cancel(cancellationId) {
        this._activeTokens.get(cancellationId)?.cancel();
    }
    async updateKeybindings(keybindings) {
        this._keybindings = keybindings;
    }
    async _makeCancellable(cancellationId, callback) {
        const cts = new CancellationTokenSource();
        this._activeTokens.set(cancellationId, cts);
        try {
            return await callback(cts.token);
        }
        finally {
            this._activeTokens.delete(cancellationId);
            cts.dispose();
        }
    }
    /**
     * Create a browser view backed by the given {@link BrowserSession}.
     */
    createBrowserView(id, browserSession, options) {
        if (this.browserViews.has(id)) {
            throw new Error(`Browser view with id ${id} already exists`);
        }
        browserSession.connectStorage(this.applicationStorageMainService);
        const view = this.instantiationService.createInstance(BrowserView, id, browserSession, 
        // Recursive factory for nested windows (child views share the same session)
        (childOptions) => this.createBrowserView(generateUuid(), browserSession, childOptions), (v, params) => this.showContextMenu(v, params), options);
        this.browserViews.set(id, view);
        this._onTargetCreated.fire(view);
        Event.once(view.onDidClose)(() => {
            this._onTargetDestroyed.fire(view);
            this.browserViews.deleteAndDispose(id);
        });
        return view;
    }
    async openNew(url, { session, windowId, editorOptions, source }) {
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
            args: [BrowserViewUri.forId(targetId), [undefined, { ...editorOptions, viewState: { url } }], undefined]
        });
        return view;
    }
    showContextMenu(view, params) {
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
                    void this.openNew(params.srcURL, {
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
                click: () => { clipboard.writeText(params.srcURL); }
            }));
        }
        if (params.isEditable) {
            menu.append(new MenuItem({ role: 'cut', enabled: params.editFlags.canCut }));
            menu.append(new MenuItem({ role: 'copy', enabled: params.editFlags.canCopy }));
            menu.append(new MenuItem({ role: 'paste', enabled: params.editFlags.canPaste }));
            menu.append(new MenuItem({ role: 'pasteAndMatchStyle', enabled: params.editFlags.canPaste }));
            menu.append(new MenuItem({ role: 'selectAll', enabled: params.editFlags.canSelectAll }));
        }
        else if (params.selectionText) {
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
};
BrowserViewMainService = __decorate([
    __param(0, IEnvironmentMainService),
    __param(1, IInstantiationService),
    __param(2, IWindowsMainService),
    __param(3, IProductService),
    __param(4, ITelemetryService),
    __param(5, INativeHostMainService),
    __param(6, IApplicationStorageMainService)
], BrowserViewMainService);
export { BrowserViewMainService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnJvd3NlclZpZXdNYWluU2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL2Jyb3dzZXJWaWV3L2VsZWN0cm9uLW1haW4vYnJvd3NlclZpZXdNYWluU2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQy9ELE9BQU8sRUFBRSxVQUFVLEVBQUUsYUFBYSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFFOUUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLHVCQUF1QixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbEcsT0FBTyxFQUE0SixvQkFBb0IsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBRTFOLE9BQU8sRUFBRSxTQUFTLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxNQUFNLFVBQVUsQ0FBQztBQUNyRCxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSwyREFBMkQsQ0FBQztBQUNwRyxPQUFPLEVBQUUsZUFBZSxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDckcsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLGtCQUFrQixDQUFDO0FBQy9DLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUM1RCxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFDN0QsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDN0UsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHFCQUFxQixDQUFDO0FBQ3JELE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUN6RSxPQUFPLEVBQUUsOEJBQThCLEVBQUUsTUFBTSxtREFBbUQsQ0FB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