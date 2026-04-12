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
import { Disposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { BrowserView } from './browserView.js';
import { CDPBrowserProxy } from '../common/cdp/proxy.js';
import { IBrowserViewMainService } from './browserViewMainService.js';
/**
 * An isolated group of {@link BrowserView} instances exposed as CDP targets.
 *
 * Each group represents an independent CDP "browser" endpoint
 * (`/devtools/browser/{id}`). Different groups can expose different
 * subsets of browser views, enabling selective target visibility across
 * CDP sessions.
 *
 * Created via {@link BrowserViewGroupMainService.createGroup}.
 */
let BrowserViewGroup = class BrowserViewGroup extends Disposable {
    constructor(id, windowId, browserViewMainService) {
        super();
        this.id = id;
        this.windowId = windowId;
        this.browserViewMainService = browserViewMainService;
        this.views = new Map();
        this.viewListeners = this._register(new DisposableStore());
        /** All context IDs known to this group, including those from views added to it. */
        this.knownContextIds = new Set();
        /** Browser context IDs created by this group via {@link createBrowserContext}. */
        this.ownedContextIds = new Set();
        this._onTargetCreated = this._register(new Emitter());
        this.onTargetCreated = this._onTargetCreated.event;
        this._onTargetDestroyed = this._register(new Emitter());
        this.onTargetDestroyed = this._onTargetDestroyed.event;
        this._onDidAddView = this._register(new Emitter());
        this.onDidAddView = this._onDidAddView.event;
        this._onDidRemoveView = this._register(new Emitter());
        this.onDidRemoveView = this._onDidRemoveView.event;
        this._onDidDestroy = this._register(new Emitter());
        this.onDidDestroy = this._onDidDestroy.event;
    }
    // #region View management
    /**
     * Add a {@link BrowserView} to this group.
     * Fires {@link onDidAddView} and {@link onTargetCreated}.
     * Automatically removes the view when it closes.
     */
    async addView(viewId) {
        if (this.views.has(viewId)) {
            return;
        }
        const view = this.browserViewMainService.tryGetBrowserView(viewId);
        if (!view) {
            throw new Error(`Browser view ${viewId} not found`);
        }
        this.views.set(view.id, view);
        this.knownContextIds.add(view.session.id);
        this._onDidAddView.fire({ viewId: view.id });
        this._onTargetCreated.fire(view);
        this.viewListeners.add(Event.once(view.onDidClose)(() => {
            this.removeView(viewId);
        }));
    }
    /**
     * Remove a {@link BrowserView} from this group.
     * Fires {@link onDidRemoveView} and {@link onTargetDestroyed} if the view was tracked.
     */
    async removeView(viewId) {
        const view = this.views.get(viewId);
        if (view && this.views.delete(viewId)) {
            // If no remaining views belong to the view's context, and we don't own the context, remove it from known contexts
            if (!this.ownedContextIds.has(view.session.id) && ![...this.views.values()].some(v => v.session.id === view.session.id)) {
                this.knownContextIds.delete(view.session.id);
            }
            this._onDidRemoveView.fire({ viewId: view.id });
            this._onTargetDestroyed.fire(view);
        }
    }
    // #endregion
    // #region ICDPBrowserTarget implementation
    getVersion() {
        return this.browserViewMainService.getVersion();
    }
    getWindowForTarget(target) {
        return this.browserViewMainService.getWindowForTarget(target);
    }
    async attach() {
        return new CDPBrowserProxy(this);
    }
    async getTargetInfo() {
        return {
            targetId: this.id,
            type: 'browser',
            title: this.getVersion().product,
            url: '',
            attached: true,
            canAccessOpener: false
        };
    }
    getTargets() {
        return this.views.values();
    }
    async createTarget(url, browserContextId, windowId = this.windowId) {
        if (browserContextId && !this.knownContextIds.has(browserContextId)) {
            throw new Error(`Unknown browser context ${browserContextId}`);
        }
        const target = await this.browserViewMainService.createTarget(url, browserContextId, windowId);
        if (target instanceof BrowserView) {
            await this.addView(target.id);
        }
        return target;
    }
    async activateTarget(target) {
        return this.browserViewMainService.activateTarget(target);
    }
    async closeTarget(target) {
        if (target instanceof BrowserView) {
            await this.removeView(target.id);
        }
        return this.browserViewMainService.closeTarget(target);
    }
    // Browser context management
    /**
     * Returns only the browser context IDs that are visible to this group,
     * i.e. contexts used by views currently in the group.
     */
    getBrowserContexts() {
        return [...this.knownContextIds];
    }
    async createBrowserContext() {
        const contextId = await this.browserViewMainService.createBrowserContext();
        this.knownContextIds.add(contextId);
        this.ownedContextIds.add(contextId);
        return contextId;
    }
    async disposeBrowserContext(browserContextId) {
        if (!this.ownedContextIds.has(browserContextId)) {
            throw new Error('Can only dispose browser contexts created by this group');
        }
        // Close views in this group that belong to the context before disposing
        for (const view of this.views.values()) {
            if (view.session.id === browserContextId) {
                await this.removeView(view.id);
            }
        }
        this.knownContextIds.delete(browserContextId);
        this.ownedContextIds.delete(browserContextId);
        return this.browserViewMainService.disposeBrowserContext(browserContextId);
    }
    get debugger() {
        if (!this._debugger) {
            this._debugger = this._register(new CDPBrowserProxy(this));
        }
        return this._debugger;
    }
    async sendCDPMessage(msg) {
        return this.debugger.sendMessage(msg);
    }
    get onCDPMessage() {
        return this.debugger.onMessage;
    }
    // #endregion
    dispose() {
        this._onDidDestroy.fire();
        super.dispose();
    }
};
BrowserViewGroup = __decorate([
    __param(2, IBrowserViewMainService)
], BrowserViewGroup);
export { BrowserViewGroup };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnJvd3NlclZpZXdHcm91cC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL2Jyb3dzZXJWaWV3L2VsZWN0cm9uLW1haW4vYnJvd3NlclZpZXdHcm91cC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ2hGLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDL0QsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLGtCQUFrQixDQUFDO0FBRS9DLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx3QkFBd0IsQ0FBQztBQUV6RCxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUV0RTs7Ozs7Ozs7O0dBU0c7QUFDSSxJQUFNLGdCQUFnQixHQUF0QixNQUFNLGdCQUFpQixTQUFRLFVBQVU7SUF5Qi9DLFlBQ1UsRUFBVSxFQUNGLFFBQWdCLEVBQ1Isc0JBQWdFO1FBRXpGLEtBQUssRUFBRSxDQUFDO1FBSkMsT0FBRSxHQUFGLEVBQUUsQ0FBUTtRQUNGLGFBQVEsR0FBUixRQUFRLENBQVE7UUFDUywyQkFBc0IsR0FBdEIsc0JBQXNCLENBQXlCO1FBMUJ6RSxVQUFLLEdBQUcsSUFBSSxHQUFHLEVBQXVCLENBQUM7UUFDdkMsa0JBQWEsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksZUFBZSxFQUFFLENBQUMsQ0FBQztRQUV2RSxtRkFBbUY7UUFDbEUsb0JBQWUsR0FBRyxJQUFJLEdBQUcsRUFBVSxDQUFDO1FBQ3JELGtGQUFrRjtRQUNqRSxvQkFBZSxHQUFHLElBQUksR0FBRyxFQUFVLENBQUM7UUFFcEMscUJBQWdCLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJ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