/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Emitter } from '../../../base/common/event.js';
import { Disposable, DisposableMap } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { Codicon } from '../../../base/common/codicons.js';
import { MainContext } from './extHost.protocol.js';
import { generateUuid } from '../../../base/common/uuid.js';
import * as extHostTypes from './extHostTypes.js';
import * as typeConverters from './extHostTypeConverters.js';
// #region Internal browser tab object
class ExtHostBrowserTab {
    constructor(id, _proxy, _sessions, data) {
        this.id = id;
        this._proxy = _proxy;
        this._sessions = _sessions;
        this._url = data.url;
        this._title = data.title;
        this._favicon = data.favicon;
        const that = this;
        this.value = {
            get url() { return that._url; },
            get title() { return that._title; },
            get icon() {
                return that._favicon
                    ? URI.parse(that._favicon)
                    : new extHostTypes.ThemeIcon(Codicon.globe.id);
            },
            startCDPSession() {
                return that._startCDPSession();
            },
            close() {
                return that._close();
            }
        };
    }
    update(data) {
        let changed = false;
        if (data.url !== this._url) {
            this._url = data.url;
            changed = true;
        }
        if (data.title !== this._title) {
            this._title = data.title;
            changed = true;
        }
        if (data.favicon !== this._favicon) {
            this._favicon = data.favicon;
            changed = true;
        }
        return changed;
    }
    async _startCDPSession() {
        const sessionId = generateUuid();
        await this._proxy.$startCDPSession(sessionId, this.id);
        const session = new ExtHostBrowserCDPSession(sessionId, this._proxy);
        this._sessions.set(sessionId, session);
        return session.value;
    }
    async _close() {
        await this._proxy.$closeBrowserTab(this.id);
    }
}
// #endregion
// #region CDP Session
class ExtHostBrowserCDPSession {
    constructor(id, _proxy) {
        this.id = id;
        this._proxy = _proxy;
        this._onDidReceiveMessage = new Emitter();
        this._onDidClose = new Emitter();
        this._closed = false;
        const that = this;
        this.value = {
            get onDidReceiveMessage() { return that._onDidReceiveMessage.event; },
            get onDidClose() { return that._onDidClose.event; },
            sendMessage(message) {
                return that._sendMessage(message);
            },
            close() {
                return that._close();
            }
        };
    }
    dispose() {
        this._onDidReceiveMessage.dispose();
        this._onDidClose.dispose();
    }
    async _sendMessage(message) {
        if (this._closed) {
            throw new Error('Session is closed');
        }
        if (!message || typeof message !== 'object') {
            throw new Error('Message must be an object');
        }
        if (typeof message.id !== 'number') {
            throw new Error('Message must have a numeric id');
        }
        if (typeof message.method !== 'string') {
            throw new Error('Message must have a method string');
        }
        if (message.params !== undefined && typeof message.params !== 'object') {
            throw new Error('Message params must be an object');
        }
        if (message.sessionId !== undefined && typeof message.sessionId !== 'string') {
            throw new Error('Message sessionId must be a string');
        }
        await this._proxy.$sendCDPMessage(this.id, { id: message.id, method: message.method, params: message.params, sessionId: message.sessionId });
    }
    async _close() {
        this._closed = true;
        await this._proxy.$closeCDPSession(this.id);
    }
    // Called from main thread
    _acceptMessage(message) {
        this._onDidReceiveMessage.fire(message);
    }
    _acceptClosed() {
        this._closed = true;
        this._onDidClose.fire();
    }
}
// #endregion
export class ExtHostBrowsers extends Disposable {
    constructor(mainContext) {
        super();
        this._browserTabs = new Map();
        this._sessions = this._register(new DisposableMap());
        this._onDidOpenBrowserTab = this._register(new Emitter());
        this.onDidOpenBrowserTab = this._onDidOpenBrowserTab.event;
        this._onDidCloseBrowserTab = this._register(new Emitter());
        this.onDidCloseBrowserTab = this._onDidCloseBrowserTab.event;
        this._onDidChangeActiveBrowserTab = this._register(new Emitter());
        this.onDidChangeActiveBrowserTab = this._onDidChangeActiveBrowserTab.event;
        this._onDidChangeBrowserTabState = this._register(new Emitter());
        this.onDidChangeBrowserTabState = this._onDidChangeBrowserTabState.event;
        this._proxy = mainContext.getProxy(MainContext.MainThreadBrowsers);
    }
    // #region Public API (called from extension code)
    get browserTabs() {
        return [...this._browserTabs.values()].map(t => t.value);
    }
    get activeBrowserTab() {
        if (this._activeBrowserTabId) {
            return this._browserTabs.get(this._activeBrowserTabId)?.value;
        }
        return undefined;
    }
    async openBrowserTab(url, options) {
        const viewColumn = typeConverters.ViewColumn.from(options?.viewColumn);
        const dto = await this._proxy.$openBrowserTab(url, viewColumn, {
            preserveFocus: options?.preserveFocus,
            inactive: options?.background,
        });
        return this._getOrCreateTab(dto).value;
    }
    // #endregion
    // #region Internal helpers
    _getOrCreateTab(dto) {
        let tab = this._browserTabs.get(dto.id);
        if (!tab) {
            tab = new ExtHostBrowserTab(dto.id, this._proxy, this._sessions, dto);
            this._browserTabs.set(dto.id, tab);
            this._onDidOpenBrowserTab.fire(tab.value);
        }
        else {
            tab.update(dto);
        }
        return tab;
    }
    // #endregion
    // #region Main thread callbacks
    $onDidOpenBrowserTab(dto) {
        this._getOrCreateTab(dto);
    }
    $onDidCloseBrowserTab(browserId) {
        const tab = this._browserTabs.get(browserId);
        if (tab) {
            this._browserTabs.delete(browserId);
            if (this._activeBrowserTabId === browserId) {
                this._activeBrowserTabId = undefined;
            }
            this._onDidCloseBrowserTab.fire(tab.value);
        }
    }
    $onDidChangeActiveBrowserTab(browserId) {
        this._activeBrowserTabId = browserId;
        this._onDidChangeActiveBrowserTab.fire(this.activeBrowserTab);
    }
    $onDidChangeBrowserTabState(data) {
        const tab = this._browserTabs.get(data.id);
        if (tab && tab.update(data)) {
            this._onDidChangeBrowserTabState.fire(tab.value);
        }
    }
    $onCDPSessionMessage(sessionId, message) {
        const session = this._sessions.get(sessionId);
        if (session) {
            session._acceptMessage(message);
        }
    }
    $onCDPSessionClosed(sessionId) {
        const session = this._sessions.get(sessionId);
        if (session) {
            session._acceptClosed();
            this._sessions.deleteAndDispose(sessionId);
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdEJyb3dzZXJzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2FwaS9jb21tb24vZXh0SG9zdEJyb3dzZXJzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQVMsTUFBTSwrQkFBK0IsQ0FBQztBQUMvRCxPQUFPLEVBQUUsVUFBVSxFQUFFLGFBQWEsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQzlFLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUNsRCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFFM0QsT0FBTyxFQUFxRCxXQUFXLEVBQTJCLE1BQU0sdUJBQXVCLENBQUM7QUFDaEksT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQzVELE9BQU8sS0FBSyxZQUFZLE1BQU0sbUJBQW1CLENBQUM7QUFDbEQsT0FBTyxLQUFLLGNBQWMsTUFBTSw0QkFBNEIsQ0FBQztBQUc3RCxzQ0FBc0M7QUFFdEMsTUFBTSxpQkFBaUI7SUFPdEIsWUFDVSxFQUFVLEVBQ0YsTUFBK0IsRUFDL0IsU0FBMEQsRUFDM0UsSUFBbUI7UUFIVixPQUFFLEdBQUYsRUFBRSxDQUFRO1FBQ0YsV0FBTSxHQUFOLE1BQU0sQ0FBeUI7UUFDL0IsY0FBUyxHQUFULFNBQVMsQ0FBaUQ7UUFHM0UsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDO1FBQ3JCLElBQUksQ0FBQyxNQUFNLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQztRQUN6QixJQUFJLENBQUMsUUFBUSxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUM7UUFFN0IsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDO1FBQ2xCLElBQUksQ0FBQyxLQUFLLEdBQUc7WUFDWixJQUFJ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