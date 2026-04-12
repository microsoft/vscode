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
import { ILifecycleService } from '../common/lifecycle.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { AbstractLifecycleService } from '../common/lifecycleService.js';
import { localize } from '../../../../nls.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { addDisposableListener, EventType } from '../../../../base/browser/dom.js';
import { IStorageService, WillSaveStateReason } from '../../../../platform/storage/common/storage.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { mainWindow } from '../../../../base/browser/window.js';
let BrowserLifecycleService = class BrowserLifecycleService extends AbstractLifecycleService {
    constructor(logService, storageService) {
        super(logService, storageService);
        this.beforeUnloadListener = undefined;
        this.unloadListener = undefined;
        this.ignoreBeforeUnload = false;
        this.didUnload = false;
        this.registerListeners();
    }
    registerListeners() {
        // Listen to `beforeUnload` to support to veto
        this.beforeUnloadListener = addDisposableListener(mainWindow, EventType.BEFORE_UNLOAD, (e) => this.onBeforeUnload(e));
        // Listen to `pagehide` to support orderly shutdown
        // We explicitly do not listen to `unload` event
        // which would disable certain browser caching.
        // We currently do not handle the `persisted` property
        // (https://github.com/microsoft/vscode/issues/136216)
        this.unloadListener = addDisposableListener(mainWindow, EventType.PAGE_HIDE, () => this.onUnload());
    }
    onBeforeUnload(event) {
        // Before unload ignored (once)
        if (this.ignoreBeforeUnload) {
            this.logService.info('[lifecycle] onBeforeUnload triggered but ignored once');
            this.ignoreBeforeUnload = false;
        }
        // Before unload with veto support
        else {
            this.logService.info('[lifecycle] onBeforeUnload triggered and handled with veto support');
            this.doShutdown(() => this.vetoBeforeUnload(event));
        }
    }
    vetoBeforeUnload(event) {
        event.preventDefault();
        event.returnValue = localize('lifecycleVeto', "Changes that you made may not be saved. Please check press 'Cancel' and try again.");
    }
    withExpectedShutdown(reason, callback) {
        // Standard shutdown
        if (typeof reason === 'number') {
            this.shutdownReason = reason;
            // Ensure UI state is persisted
            return this.storageService.flush(WillSaveStateReason.SHUTDOWN);
        }
        // Before unload handling ignored for duration of callback
        else {
            this.ignoreBeforeUnload = true;
            try {
                callback?.();
            }
            finally {
                this.ignoreBeforeUnload = false;
            }
        }
    }
    async shutdown() {
        this.logService.info('[lifecycle] shutdown triggered');
        // An explicit shutdown renders our unload
        // event handlers disabled, so dispose them.
        this.beforeUnloadListener?.dispose();
        this.unloadListener?.dispose();
        // Ensure UI state is persisted
        await this.storageService.flush(WillSaveStateReason.SHUTDOWN);
        // Handle shutdown without veto support
        this.doShutdown();
    }
    doShutdown(vetoShutdown) {
        const logService = this.logService;
        // Optimistically trigger a UI state flush
        // without waiting for it. The browser does
        // not guarantee that this is being executed
        // but if a dialog opens, we have a chance
        // to succeed.
        this.storageService.flush(WillSaveStateReason.SHUTDOWN);
        let veto = false;
        function handleVeto(vetoResult, id) {
            if (typeof vetoShutdown !== 'function') {
                return; // veto handling disabled
            }
            if (vetoResult instanceof Promise) {
                logService.error(`[lifecycle] Long running operations before shutdown are unsupported in the web (id: ${id})`);
                veto = true; // implicitly vetos since we cannot handle promises in web
            }
            if (vetoResult === true) {
                logService.info(`[lifecycle]: Unload was prevented (id: ${id})`);
                veto = true;
            }
        }
        // Before Shutdown
        this._onBeforeShutdown.fire({
            reason: 2 /* ShutdownReason.QUIT */,
            veto(value, id) {
                handleVeto(value, id);
            },
            finalVeto(valueFn, id) {
                handleVeto(valueFn(), id); // in browser, trigger instantly because we do not support async anyway
            }
        });
        // Veto: handle if provided
        if (veto && typeof vetoShutdown === 'function') {
            return vetoShutdown();
        }
        // No veto, continue to shutdown
        return this.onUnload();
    }
    onUnload() {
        if (this.didUnload) {
            return; // only once
        }
        this.didUnload = true;
        this._willShutdown = true;
        // Register a late `pageshow` listener specifically on unload
        this._register(addDisposableListener(mainWindow, EventType.PAGE_SHOW, (e) => this.onLoadAfterUnload(e)));
        // First indicate will-shutdown
        const logService = this.logService;
        this._onWillShutdown.fire({
            reason: 2 /* ShutdownReason.QUIT */,
            joiners: () => [], // Unsupported in web
            token: CancellationToken.None, // Unsupported in web
            join(promise, joiner) {
                if (typeof promise === 'function') {
                    promise();
                }
                logService.error(`[lifecycle] Long running operations during shutdown are unsupported in the web (id: ${joiner.id})`);
            },
            force: () => { },
        });
        // Finally end with did-shutdown
        this._onDidShutdown.fire();
    }
    onLoadAfterUnload(event) {
        // We only really care about page-show events
        // where the browser indicates to us that the
        // page was restored from cache and not freshly
        // loaded.
        const wasRestoredFromCache = event.persisted;
        if (!wasRestoredFromCache) {
            return;
        }
        // At this point, we know that the page was restored from
        // cache even though it was unloaded before,
        // so in order to get back to a functional workbench, we
        // currently can only reload the window
        // Docs: https://web.dev/bfcache/#optimize-your-pages-for-bfcache
        // Refs: https://github.com/microsoft/vscode/issues/136035
        this.withExpectedShutdown({ disableShutdownHandling: true }, () => mainWindow.location.reload());
    }
    doResolveStartupKind() {
        let startupKind = super.doResolveStartupKind();
        if (typeof startupKind !== 'number') {
            const timing = performance.getEntriesByType('navigation').at(0);
            if (timing?.type === 'reload') {
                // MDN: https://developer.mozilla.org/en-US/docs/Web/API/PerformanceNavigationTiming/type#value
                startupKind = 3 /* StartupKind.ReloadedWindow */;
            }
        }
        return startupKind;
    }
};
BrowserLifecycleService = __decorate([
    __param(0, ILogService),
    __param(1, IStorageService)
], BrowserLifecycleService);
export { BrowserLifecycleService };
registerSingleton(ILifecycleService, BrowserLifecycleService, 0 /* InstantiationType.Eager */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGlmZWN5Y2xlU2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9saWZlY3ljbGUvYnJvd3Nlci9saWZlY3ljbGVTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBa0IsaUJBQWlCLEVBQWUsTUFBTSx3QkFBd0IsQ0FBQztBQUN4RixPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDckUsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDekUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzlDLE9BQU8sRUFBcUIsaUJBQWlCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUUvRyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsU0FBUyxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDbkYsT0FBTyxFQUFFLGVBQWUsRUFBRSxtQkFBbUIsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzVFLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUV6RCxJQUFNLHVCQUF1QixHQUE3QixNQUFNLHVCQUF3QixTQUFRLHdCQUF3QjtJQVNwRSxZQUNjLFVBQXVCLEVBQ25CLGNBQStCO1FBRWhELEtBQUssQ0FBQyxVQUFVLEVBQUUsY0FBYyxDQUFDLENBQUM7UUFYM0IseUJBQW9CLEdBQTRCLFNBQVMsQ0FBQztRQUMxRCxtQkFBYyxHQUE0QixTQUFTLENBQUM7UUFFcEQsdUJBQWtCLEdBQUcsS0FBSyxDQUFDO1FBRTNCLGNBQVMsR0FBRyxLQUFLLENBQUM7UUFRekIsSUFBSSxDQUFDLGlCQUFpQixFQUFFLENBQUM7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