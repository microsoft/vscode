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
import { Disposable, DisposableMap, DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { IEditorService } from '../../services/editor/common/editorService.js';
import { extHostNamedCustomer } from '../../services/extensions/common/extHostCustomers.js';
import { ExtHostContext, MainContext } from '../common/extHost.protocol.js';
import { IBrowserViewCDPService } from '../../contrib/browserView/common/browserView.js';
import { BrowserViewUri } from '../../../platform/browserView/common/browserViewUri.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { columnToEditorGroup } from '../../services/editor/common/editorGroupColumn.js';
import { IEditorGroupsService } from '../../services/editor/common/editorGroupsService.js';
import { IConfigurationService } from '../../../platform/configuration/common/configuration.js';
import { BrowserEditorInput } from '../../contrib/browserView/common/browserEditorInput.js';
let MainThreadBrowsers = class MainThreadBrowsers extends Disposable {
    constructor(extHostContext, editorService, cdpService, editorGroupsService, configurationService) {
        super();
        this.editorService = editorService;
        this.cdpService = cdpService;
        this.editorGroupsService = editorGroupsService;
        this.configurationService = configurationService;
        this._cdpSessions = this._register(new DisposableMap());
        this._knownBrowsers = this._register(new DisposableMap());
        // #endregion
        // #region Browser tab tracking
        this._lastActiveBrowserId = undefined;
        this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostBrowsers);
        // Track open browser editors
        this._register(this.editorService.onWillOpenEditor((e) => {
            if (e.editor instanceof BrowserEditorInput) {
                this._track(e.editor);
            }
        }));
        this._register(this.editorService.onDidActiveEditorChange(() => this._syncActiveBrowserTab()));
        // Initial sync
        for (const input of this.editorService.editors) {
            if (input instanceof BrowserEditorInput) {
                this._track(input);
            }
        }
        this._syncActiveBrowserTab();
    }
    // #region Browser tab open
    async $openBrowserTab(url, viewColumn, options) {
        const id = generateUuid();
        const browserUri = BrowserViewUri.forId(id);
        await this.editorService.openEditor({
            resource: browserUri,
            options: { ...options, viewState: { url } }
        }, columnToEditorGroup(this.editorGroupsService, this.configurationService, viewColumn));
        const known = this._knownBrowsers.get(id);
        if (!known) {
            throw new Error('Failed to open browser tab');
        }
        return this._toDto(known.input);
    }
    async _syncActiveBrowserTab() {
        const active = this.editorService.activeEditorPane?.input;
        let activeId;
        if (active instanceof BrowserEditorInput) {
            this._track(active);
            activeId = active.id;
        }
        if (this._lastActiveBrowserId !== activeId) {
            this._lastActiveBrowserId = activeId;
            this._proxy.$onDidChangeActiveBrowserTab(activeId);
        }
    }
    _track(input) {
        if (this._knownBrowsers.has(input.id)) {
            return;
        }
        const disposables = new DisposableStore();
        // Track property changes. Currently all the tracked properties are covered under the `onDidChangeLabel` event.
        disposables.add(input.onDidChangeLabel(() => {
            this._proxy.$onDidChangeBrowserTabState(this._toDto(input));
        }));
        disposables.add(input.onWillDispose(() => {
            this._knownBrowsers.deleteAndDispose(input.id);
        }));
        disposables.add(toDisposable(() => {
            this._proxy.$onDidCloseBrowserTab(input.id);
        }));
        this._knownBrowsers.set(input.id, { input, dispose: () => disposables.dispose() });
        this._proxy.$onDidOpenBrowserTab(this._toDto(input));
    }
    _toDto(input) {
        return {
            id: input.id,
            url: input.url || 'about:blank',
            title: input.getTitle(),
            favicon: input.favicon,
        };
    }
    // #endregion
    // #region CDP session management
    async $startCDPSession(sessionId, browserId) {
        const known = this._knownBrowsers.get(browserId);
        if (!known) {
            throw new Error(`Unknown browser id: ${browserId}`);
        }
        // Before starting a session, resolve the input to ensure the underlying web contents exist and can be attached.
        await known.input.resolve();
        const groupId = await this.cdpService.createSessionGroup(browserId);
        const disposables = new DisposableStore();
        // Wire CDP messages from main process back to ext host
        disposables.add(this.cdpService.onCDPMessage(groupId)(message => {
            this._proxy.$onCDPSessionMessage(sessionId, message);
        }));
        disposables.add(this.cdpService.onDidDestroy(groupId)(() => {
            this._cdpSessions.deleteAndDispose(sessionId);
        }));
        disposables.add(toDisposable(() => {
            this.cdpService.destroySessionGroup(groupId).catch(() => { });
            this._proxy.$onCDPSessionClosed(sessionId);
        }));
        this._cdpSessions.set(sessionId, { groupId, dispose: () => disposables.dispose() });
    }
    async $closeCDPSession(sessionId) {
        this._cdpSessions.deleteAndDispose(sessionId);
    }
    async $sendCDPMessage(sessionId, message) {
        const session = this._cdpSessions.get(sessionId);
        if (session) {
            await this.cdpService.sendCDPMessage(session.groupId, message);
        }
    }
    async $closeBrowserTab(browserId) {
        const known = this._knownBrowsers.get(browserId);
        if (!known) {
            throw new Error(`Unknown browser id: ${browserId}`);
        }
        known.input.dispose();
    }
};
MainThreadBrowsers = __decorate([
    extHostNamedCustomer(MainContext.MainThreadBrowsers),
    __param(1, IEditorService),
    __param(2, IBrowserViewCDPService),
    __param(3, IEditorGroupsService),
    __param(4, IConfigurationService)
], MainThreadBrowsers);
export { MainThreadBrowsers };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpblRocmVhZEJyb3dzZXJzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2FwaS9icm93c2VyL21haW5UaHJlYWRCcm93c2Vycy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsVUFBVSxFQUFFLGFBQWEsRUFBRSxlQUFlLEVBQWUsWUFBWSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDMUgsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQy9FLE9BQU8sRUFBbUIsb0JBQW9CLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUM3RyxPQUFPLEVBQXVDLGNBQWMsRUFBRSxXQUFXLEVBQTJCLE1BQU0sK0JBQStCLENBQUM7QUFDMUksT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0saURBQWlELENBQUM7QUFDekYsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHdEQUF3RCxDQUFDO0FBQ3hGLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUM1RCxPQUFPLEVBQXFCLG1CQUFtQixFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDM0csT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0scURBQXFELENBQUM7QUFDM0YsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFHaEcsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sd0RBQXdELENBQUM7QUFHckYsSUFBTSxrQkFBa0IsR0FBeEIsTUFBTSxrQkFBbUIsU0FBUSxVQUFVO0lBT2pELFlBQ0MsY0FBK0IsRUFDZixhQUE4QyxFQUN0QyxVQUFtRCxFQUNyRCxtQkFBMEQsRUFDekQsb0JBQTREO1FBRW5GLEtBQUssRUFBRSxDQUFDO1FBTHlCLGtCQUFhLEdBQWIsYUFBYSxDQUFnQjtRQUNy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