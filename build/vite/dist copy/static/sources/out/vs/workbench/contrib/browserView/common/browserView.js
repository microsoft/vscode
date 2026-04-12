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
var BrowserViewModel_1;
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { localize } from '../../../../nls.js';
import { IPlaywrightService } from '../../../../platform/browserView/common/playwrightService.js';
import { BrowserViewStorageScope, browserZoomDefaultIndex, browserZoomFactors } from '../../../../platform/browserView/common/browserView.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { isLocalhostAuthority } from '../../../../platform/url/common/trustedDomains.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IWorkspaceTrustManagementService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { IBrowserZoomService } from './browserZoomService.js';
/** Extracts the host from a URL string for zoom tracking purposes. */
function parseZoomHost(url) {
    const parsed = URL.parse(url);
    if (!parsed?.host || (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')) {
        return undefined;
    }
    return parsed.host;
}
export const IBrowserViewWorkbenchService = createDecorator('browserViewWorkbenchService');
export const IBrowserViewCDPService = createDecorator('browserViewCDPService');
let BrowserViewModel = class BrowserViewModel extends Disposable {
    static { BrowserViewModel_1 = this; }
    constructor(id, browserViewService, workspaceContextService, workspaceTrustManagementService, telemetryService, configurationService, playwrightService, dialogService, storageService, zoomService) {
        super();
        this.id = id;
        this.browserViewService = browserViewService;
        this.workspaceContextService = workspaceContextService;
        this.workspaceTrustManagementService = workspaceTrustManagementService;
        this.telemetryService = telemetryService;
        this.configurationService = configurationService;
        this.playwrightService = playwrightService;
        this.dialogService = dialogService;
        this.storageService = storageService;
        this.zoomService = zoomService;
        this._url = '';
        this._title = '';
        this._favicon = undefined;
        this._screenshot = undefined;
        this._loading = false;
        this._focused = false;
        this._visible = false;
        this._isDevToolsOpen = false;
        this._canGoBack = false;
        this._canGoForward = false;
        this._error = undefined;
        this._certificateError = undefined;
        this._storageScope = BrowserViewStorageScope.Ephemeral;
        this._isEphemeral = false;
        this._zoomHost = undefined;
        this._sharedWithAgent = false;
        this._browserZoomIndex = browserZoomDefaultIndex;
        this._onDidChangeSharedWithAgent = this._register(new Emitter());
        this.onDidChangeSharedWithAgent = this._onDidChangeSharedWithAgent.event;
        this._onDidChangeZoom = this._register(new Emitter());
        this.onDidChangeZoom = this._onDidChangeZoom.event;
        this._onWillDispose = this._register(new Emitter());
        this.onWillDispose = this._onWillDispose.event;
    }
    get url() { return this._url; }
    get title() { return this._title; }
    get favicon() { return this._favicon; }
    get loading() { return this._loading; }
    get focused() { return this._focused; }
    get visible() { return this._visible; }
    get isDevToolsOpen() { return this._isDevToolsOpen; }
    get canGoBack() { return this._canGoBack; }
    get canGoForward() { return this._canGoForward; }
    get screenshot() { return this._screenshot; }
    get error() { return this._error; }
    get certificateError() { return this._certificateError; }
    get storageScope() { return this._storageScope; }
    get sharedWithAgent() { return this._sharedWithAgent; }
    get zoomFactor() { return browserZoomFactors[this._browserZoomIndex]; }
    get canZoomIn() { return this._browserZoomIndex < browserZoomFactors.length - 1; }
    get canZoomOut() { return this._browserZoomIndex > 0; }
    get onDidNavigate() {
        return this.browserViewService.onDynamicDidNavigate(this.id);
    }
    get onDidChangeLoadingState() {
        return this.browserViewService.onDynamicDidChangeLoadingState(this.id);
    }
    get onDidChangeFocus() {
        return this.browserViewService.onDynamicDidChangeFocus(this.id);
    }
    get onDidChangeDevToolsState() {
        return this.browserViewService.onDynamicDidChangeDevToolsState(this.id);
    }
    get onDidKeyCommand() {
        return this.browserViewService.onDynamicDidKeyCommand(this.id);
    }
    get onDidChangeTitle() {
        return this.browserViewService.onDynamicDidChangeTitle(this.id);
    }
    get onDidChangeFavicon() {
        return this.browserViewService.onDynamicDidChangeFavicon(this.id);
    }
    get onDidRequestNewPage() {
        return this.browserViewService.onDynamicDidRequestNewPage(this.id);
    }
    get onDidFindInPage() {
        return this.browserViewService.onDynamicDidFindInPage(this.id);
    }
    get onDidChangeVisibility() {
        return this.browserViewService.onDynamicDidChangeVisibility(this.id);
    }
    get onDidClose() {
        return this.browserViewService.onDynamicDidClose(this.id);
    }
    /**
     * Initialize the model with the current state from the main process.
     * @param create Whether to create the browser view if it doesn't already exist.
     * @throws If the browser view doesn't exist and `create` is false, or if initialization fails
     */
    async initialize(create) {
        const dataStorageSetting = this.configurationService.getValue('workbench.browser.dataStorage') ?? BrowserViewStorageScope.Global;
        // Wait for trust initialization before determining storage scope
        await this.workspaceTrustManagementService.workspaceTrustInitialized;
        const isWorkspaceUntrusted = this.workspaceContextService.getWorkbenchState() !== 1 /* WorkbenchState.EMPTY */ &&
            !this.workspaceTrustManagementService.isWorkspaceTrusted();
        // Always use ephemeral sessions for untrusted workspaces
        const dataStorage = isWorkspaceUntrusted ? BrowserViewStorageScope.Ephemeral : dataStorageSetting;
        const workspaceId = this.workspaceContextService.getWorkspace().id;
        const state = create
            ? await this.browserViewService.getOrCreateBrowserView(this.id, dataStorage, workspaceId)
            : await this.browserViewService.getState(this.id);
        this._url = state.url;
        this._title = state.title;
        this._loading = state.loading;
        this._focused = state.focused;
        this._visible = state.visible;
        this._isDevToolsOpen = state.isDevToolsOpen;
        this._canGoBack = state.canGoBack;
        this._canGoForward = state.canGoForward;
        this._screenshot = state.lastScreenshot;
        this._favicon = state.lastFavicon;
        this._error = state.lastError;
        this._certificateError = state.certificateError;
        this._storageScope = state.storageScope;
        this._sharedWithAgent = await this.playwrightService.isPageTracked(this.id);
        this._browserZoomIndex = state.browserZoomIndex;
        this._isEphemeral = this._storageScope === BrowserViewStorageScope.Ephemeral;
        this._zoomHost = parseZoomHost(this._url);
        const effectiveZoomIndex = this.zoomService.getEffectiveZoomIndex(this._zoomHost, this._isEphemeral);
        if (effectiveZoomIndex !== this._browserZoomIndex) {
            await this.setBrowserZoomIndex(effectiveZoomIndex);
        }
        this._register(this.zoomService.onDidChangeZoom(({ host, isEphemeralChange }) => {
            if (isEphemeralChange && !this._isEphemeral) {
                return;
            }
            if (host === undefined || host === this._zoomHost) {
                void this.setBrowserZoomIndex(this.zoomService.getEffectiveZoomIndex(this._zoomHost, this._isEphemeral));
            }
        }));
        // Set up state synchronization
        this._register(this.onDidNavigate(e => {
            // Clear favicon on navigation to a different host
            if (URL.parse(e.url)?.host !== URL.parse(this._url)?.host) {
                this._favicon = undefined;
            }
            this._zoomHost = parseZoomHost(e.url);
            this._url = e.url;
            this._title = e.title;
            this._canGoBack = e.canGoBack;
            this._canGoForward = e.canGoForward;
            this._certificateError = e.certificateError;
            // Always forceApply because Chromium resets zoom on cross-origin navigation,
            // and an origin change may not correspond to a host change (e.g. http→https).
            void this.setBrowserZoomIndex(this.zoomService.getEffectiveZoomIndex(this._zoomHost, this._isEphemeral), true);
        }));
        this._register(this.onDidChangeLoadingState(e => {
            this._loading = e.loading;
            this._error = e.error;
        }));
        this._register(this.onDidChangeDevToolsState(e => {
            this._isDevToolsOpen = e.isDevToolsOpen;
        }));
        this._register(this.onDidChangeTitle(e => {
            this._title = e.title;
        }));
        this._register(this.onDidChangeFavicon(e => {
            this._favicon = e.favicon;
        }));
        this._register(this.onDidChangeFocus(({ focused }) => {
            this._focused = focused;
        }));
        this._register(this.onDidChangeVisibility(({ visible }) => {
            this._visible = visible;
        }));
        this._register(this.playwrightService.onDidChangeTrackedPages(ids => {
            this._setSharedWithAgent(ids.includes(this.id));
        }));
    }
    async layout(bounds) {
        return this.browserViewService.layout(this.id, bounds);
    }
    async setVisible(visible) {
        this._visible = visible; // Set optimistically so model is in sync immediately
        return this.browserViewService.setVisible(this.id, visible);
    }
    async loadURL(url) {
        this.logNavigationTelemetry('urlInput', url);
        return this.browserViewService.loadURL(this.id, url);
    }
    async goBack() {
        this.logNavigationTelemetry('goBack', this._url);
        return this.browserViewService.goBack(this.id);
    }
    async goForward() {
        this.logNavigationTelemetry('goForward', this._url);
        return this.browserViewService.goForward(this.id);
    }
    async reload(hard) {
        this.logNavigationTelemetry('reload', this._url);
        return this.browserViewService.reload(this.id, hard);
    }
    async toggleDevTools() {
        return this.browserViewService.toggleDevTools(this.id);
    }
    async captureScreenshot(options) {
        const result = await this.browserViewService.captureScreenshot(this.id, options);
        // Store full-page screenshots for display in UI as placeholders
        if (!options?.screenRect && !options?.pageRect) {
            this._screenshot = result;
        }
        return result;
    }
    async focus() {
        return this.browserViewService.focus(this.id);
    }
    async findInPage(text, options) {
        return this.browserViewService.findInPage(this.id, text, options);
    }
    async stopFindInPage(keepSelection) {
        return this.browserViewService.stopFindInPage(this.id, keepSelection);
    }
    async getSelectedText() {
        return this.browserViewService.getSelectedText(this.id);
    }
    async clearStorage() {
        return this.browserViewService.clearStorage(this.id);
    }
    async trustCertificate(host, fingerprint) {
        return this.browserViewService.trustCertificate(this.id, host, fingerprint);
    }
    async untrustCertificate(host, fingerprint) {
        return this.browserViewService.untrustCertificate(this.id, host, fingerprint);
    }
    /**
     * @param forceApply When true, the IPC call is made even if the local cached zoom index
     * already matches the requested value. Pass true after cross-document navigation because
     * Chromium resets the zoom to its per-origin default, making the cache stale.
     */
    async setBrowserZoomIndex(zoomIndex, forceApply = false) {
        const clamped = Math.max(0, Math.min(zoomIndex, browserZoomFactors.length - 1));
        if (!forceApply && clamped === this._browserZoomIndex) {
            return;
        }
        this._browserZoomIndex = clamped;
        await this.browserViewService.setBrowserZoomIndex(this.id, this._browserZoomIndex);
        this._onDidChangeZoom.fire();
    }
    async zoomIn() {
        if (!this.canZoomIn) {
            return;
        }
        await this.setBrowserZoomIndex(this._browserZoomIndex + 1);
        if (this._zoomHost) {
            this.zoomService.setHostZoomIndex(this._zoomHost, this._browserZoomIndex, this._isEphemeral);
        }
    }
    async zoomOut() {
        if (!this.canZoomOut) {
            return;
        }
        await this.setBrowserZoomIndex(this._browserZoomIndex - 1);
        if (this._zoomHost) {
            this.zoomService.setHostZoomIndex(this._zoomHost, this._browserZoomIndex, this._isEphemeral);
        }
    }
    async resetZoom() {
        const defaultIndex = this.zoomService.getEffectiveZoomIndex(undefined, false);
        await this.setBrowserZoomIndex(defaultIndex);
        if (this._zoomHost) {
            this.zoomService.setHostZoomIndex(this._zoomHost, defaultIndex, this._isEphemeral);
        }
    }
    async getConsoleLogs() {
        return this.browserViewService.getConsoleLogs(this.id);
    }
    async getElementData(token) {
        return this._wrapCancellable(token, (cid) => this.browserViewService.getElementData(this.id, cid));
    }
    async getFocusedElementData() {
        return this.browserViewService.getFocusedElementData(this.id);
    }
    static { this.SHARE_DONT_ASK_KEY = 'browserView.shareWithAgent.dontAskAgain'; }
    async setSharedWithAgent(shared) {
        if (shared) {
            const storedChoice = this.storageService.getBoolean(BrowserViewModel_1.SHARE_DONT_ASK_KEY, 0 /* StorageScope.PROFILE */);
            if (!storedChoice) {
                // First time (or no stored preference) -- ask.
                const result = await this.dialogService.confirm({
                    type: 'question',
                    title: localize('browserView.shareWithAgent.title', 'Share with Agent?'),
                    message: localize('browserView.shareWithAgent.message', 'Share this browser page with the agent?'),
                    detail: localize('browserView.shareWithAgent.detail', 'The agent will be able to read and modify browser content and saved data, including cookies.'),
                    primaryButton: localize('browserView.shareWithAgent.allow', '&&Allow'),
                    cancelButton: localize('browserView.shareWithAgent.deny', 'Deny'),
                    checkbox: { label: localize('browserView.shareWithAgent.dontAskAgain', "Don't ask again"), checked: false },
                });
                // Only persist "don't ask again" if user accepted sharing, so the button doesn't just do nothing.
                if (result.confirmed && result.checkboxChecked) {
                    this.storageService.store(BrowserViewModel_1.SHARE_DONT_ASK_KEY, result.confirmed, 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
                }
                this.telemetryService.publicLog2('integratedBrowser.shareWithAgent', {
                    shared: result.confirmed,
                    dontAskAgain: result.checkboxChecked ?? false
                });
                if (!result.confirmed) {
                    return;
                }
            }
            else {
                this.telemetryService.publicLog2('integratedBrowser.shareWithAgent', {
                    shared: true,
                    dontAskAgain: true
                });
            }
            await this.playwrightService.startTrackingPage(this.id);
            this._setSharedWithAgent(true);
        }
        else {
            await this.playwrightService.stopTrackingPage(this.id);
            this._setSharedWithAgent(false);
        }
    }
    _setSharedWithAgent(isShared) {
        if (isShared !== this._sharedWithAgent) {
            this._sharedWithAgent = isShared;
            this._onDidChangeSharedWithAgent.fire(isShared);
        }
    }
    static { this._cancellationIdPool = 0; }
    async _wrapCancellable(token, callback) {
        const cancellationId = BrowserViewModel_1._cancellationIdPool++;
        const disposable = token.onCancellationRequested(() => {
            this.browserViewService.cancel(cancellationId);
        });
        try {
            return await callback(cancellationId);
        }
        finally {
            disposable.dispose();
        }
    }
    /**
     * Log navigation telemetry event
     */
    logNavigationTelemetry(navigationType, url) {
        let localhost;
        try {
            localhost = isLocalhostAuthority(new URL(url).host);
        }
        catch {
            localhost = false;
        }
        this.telemetryService.publicLog2('integratedBrowser.navigation', {
            navigationType,
            isLocalhost: localhost
        });
    }
    dispose() {
        this._onWillDispose.fire();
        // Clean up the browser view when the model is disposed
        void this.browserViewService.destroyBrowserView(this.id);
        super.dispose();
    }
};
BrowserViewModel = BrowserViewModel_1 = __decorate([
    __param(2, IWorkspaceContextService),
    __param(3, IWorkspaceTrustManagementService),
    __param(4, ITelemetryService),
    __param(5, IConfigurationService),
    __param(6, IPlaywrightService),
    __param(7, IDialogService),
    __param(8, IStorageService),
    __param(9, IBrowserZoomService)
], BrowserViewModel);
export { BrowserViewModel };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnJvd3NlclZpZXcuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9icm93c2VyVmlldy9jb21tb24vYnJvd3NlclZpZXcudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUM3RixPQUFPLEVBQUUsT0FBTyxFQUFTLE1BQU0sa0NBQWtDLENBQUM7QUFDbEUsT0FBTyxFQUFFLFVBQVUsRUFBZSxNQUFNLHNDQUFzQyxDQUFDO0FBSS9FLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUNoRixPQUFPLEVBQUUsZUFBZSxFQUErQixNQUFNLGdEQUFnRCxDQUFDO0FBQzlHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUU5QyxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSw4REFBOEQsQ0FBQztBQUNsRyxPQUFPLEVBWU4sdUJBQXVCLEVBTXZCLHVCQUF1QixFQUN2QixrQkFBa0IsRUFDbEIsTUFBTSx3REFBd0QsQ0FBQztBQUNoRSxPQUFPLEVBQUUsd0JBQXdCLEVBQWtCLE1BQU0sb0RBQW9ELENBQUM7QUFDOUcsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFDdkYsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDekYsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbkcsT0FBTyxFQUFFLGdDQUFnQyxFQUFFLE1BQU0seURBQXlELENBQUM7QUFDM0csT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFFOUQsc0VBQXNFO0FBQ3RFLFNBQVMsYUFBYSxDQUFDLEdBQVc7SUFDakMs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