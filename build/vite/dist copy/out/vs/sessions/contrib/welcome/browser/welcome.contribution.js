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
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { SessionsWelcomeVisibleContext } from '../../../common/contextkeys.js';
import { autorun } from '../../../../base/common/observable.js';
import { localize2 } from '../../../../nls.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { registerWorkbenchContribution2 } from '../../../../workbench/common/contributions.js';
import { IWorkbenchLayoutService } from '../../../../workbench/services/layout/browser/layoutService.js';
import { ChatEntitlement, IChatEntitlementService } from '../../../../workbench/services/chat/common/chatEntitlementService.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IWorkbenchEnvironmentService } from '../../../../workbench/services/environment/common/environmentService.js';
import { SessionsWalkthroughOverlay } from './sessionsWalkthrough.js';
const WELCOME_COMPLETE_KEY = 'workbench.agentsession.welcomeComplete';
function needsChatSetup(chatEntitlementService, includeUnknown = true) {
    const { sentiment, entitlement } = chatEntitlementService;
    return (!sentiment?.installed ||
        sentiment?.disabled ||
        entitlement === ChatEntitlement.Available ||
        (includeUnknown &&
            entitlement === ChatEntitlement.Unknown &&
            !chatEntitlementService.anonymous));
}
function shouldPersistWelcomeCompletion(outcome, chatEntitlementService) {
    return outcome === 'completed' || !needsChatSetup(chatEntitlementService);
}
let SessionsWelcomeContribution = class SessionsWelcomeContribution extends Disposable {
    static { this.ID = 'workbench.contrib.sessionsWelcome'; }
    constructor(chatEntitlementService, layoutService, instantiationService, productService, storageService, contextKeyService, environmentService, logService) {
        super();
        this.chatEntitlementService = chatEntitlementService;
        this.layoutService = layoutService;
        this.instantiationService = instantiationService;
        this.productService = productService;
        this.storageService = storageService;
        this.contextKeyService = contextKeyService;
        this.environmentService = environmentService;
        this.logService = logService;
        this.overlayRef = this._register(new MutableDisposable());
        this.watcherRef = this._register(new MutableDisposable());
        if (!this.productService.defaultChatAgent?.chatExtensionId) {
            return;
        }
        // Allow automated tests to skip the welcome overlay entirely.
        // Desktop: --skip-sessions-welcome CLI flag
        // Web: ?skip-sessions-welcome query parameter
        const envArgs = this.environmentService.args;
        if (envArgs?.['skip-sessions-welcome']) {
            return;
        }
        if (typeof globalThis.location !== 'undefined' && new URLSearchParams(globalThis.location.search).has('skip-sessions-welcome')) {
            return;
        }
        const isFirstLaunch = !this.storageService.getBoolean(WELCOME_COMPLETE_KEY, -1 /* StorageScope.APPLICATION */, false);
        if (isFirstLaunch) {
            this.showWalkthrough();
        }
        else {
            this.showWalkthroughIfNeeded();
        }
    }
    showWalkthroughIfNeeded() {
        if (this._needsChatSetup()) {
            this.showWalkthrough();
        }
        else {
            this.watchEntitlementState();
        }
    }
    /**
     * Watches entitlement and sentiment observables after setup has already
     * completed. If the user's state changes such that setup is needed again
     * (e.g. extension uninstalled/disabled), shows the welcome overlay.
     *
     * {@link ChatEntitlement.Unknown} is intentionally ignored here: it is
     * almost always a transient state caused by a stale OAuth token being
     * refreshed after an update. A genuine sign-out will be caught on the
     * next app launch via the initial {@link showWalkthroughIfNeeded} check.
     */
    watchEntitlementState() {
        let setupComplete = !this._needsChatSetup(false);
        this.watcherRef.value = autorun(reader => {
            this.chatEntitlementService.sentimentObs.read(reader);
            this.chatEntitlementService.entitlementObs.read(reader);
            const needsSetup = this._needsChatSetup(false);
            if (setupComplete && needsSetup) {
                this.showWalkthrough();
            }
            setupComplete = !needsSetup;
        });
    }
    _needsChatSetup(includeUnknown = true) {
        return needsChatSetup(this.chatEntitlementService, includeUnknown);
    }
    showWalkthrough() {
        if (this.overlayRef.value) {
            return;
        }
        this.watcherRef.clear();
        this.overlayRef.value = new DisposableStore();
        let welcomeCompletionStored = false;
        // Mark the welcome overlay as visible for titlebar disabling
        const welcomeVisibleKey = SessionsWelcomeVisibleContext.bindTo(this.contextKeyService);
        welcomeVisibleKey.set(true);
        this.overlayRef.value.add(toDisposable(() => welcomeVisibleKey.reset()));
        const walkthrough = this.overlayRef.value.add(this.instantiationService.createInstance(SessionsWalkthroughOverlay, this.layoutService.mainContainer));
        // When chat setup completes (observables flip), persist completion and
        // finish the walkthrough so the app can render immediately.
        this.overlayRef.value.add(autorun(reader => {
            this.chatEntitlementService.sentimentObs.read(reader);
            this.chatEntitlementService.entitlementObs.read(reader);
            if (!welcomeCompletionStored && !this._needsChatSetup()) {
                welcomeCompletionStored = true;
                this.storageService.store(WELCOME_COMPLETE_KEY, true, -1 /* StorageScope.APPLICATION */, 1 /* StorageTarget.MACHINE */);
                walkthrough.complete();
            }
        }));
        // Handle the walkthrough outcome
        walkthrough.outcome.then(outcome => {
            this.logService.info(`[sessions welcome] Walkthrough finished with outcome: ${outcome}`);
            if (!welcomeCompletionStored && shouldPersistWelcomeCompletion(outcome, this.chatEntitlementService)) {
                welcomeCompletionStored = true;
                this.storageService.store(WELCOME_COMPLETE_KEY, true, -1 /* StorageScope.APPLICATION */, 1 /* StorageTarget.MACHINE */);
            }
            this.overlayRef.clear();
            this.watchEntitlementState();
        });
    }
};
SessionsWelcomeContribution = __decorate([
    __param(0, IChatEntitlementService),
    __param(1, IWorkbenchLayoutService),
    __param(2, IInstantiationService),
    __param(3, IProductService),
    __param(4, IStorageService),
    __param(5, IContextKeyService),
    __param(6, IWorkbenchEnvironmentService),
    __param(7, ILogService)
], SessionsWelcomeContribution);
export { SessionsWelcomeContribution };
registerWorkbenchContribution2(SessionsWelcomeContribution.ID, SessionsWelcomeContribution, 2 /* WorkbenchPhase.BlockRestore */);
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.resetSessionsWelcome',
            title: localize2('resetSessionsWelcome', "Reset Agents Welcome"),
            category: Categories.Developer,
            f1: true,
        });
    }
    run(accessor) {
        const storageService = accessor.get(IStorageService);
        const instantiationService = accessor.get(IInstantiationService);
        const layoutService = accessor.get(IWorkbenchLayoutService);
        const chatEntitlementService = accessor.get(IChatEntitlementService);
        const contextKeyService = accessor.get(IContextKeyService);
        const logService = accessor.get(ILogService);
        // Clear completion marker
        storageService.remove(WELCOME_COMPLETE_KEY, -1 /* StorageScope.APPLICATION */);
        // Immediately show the walkthrough overlay
        const store = new DisposableStore();
        const welcomeVisibleKey = SessionsWelcomeVisibleContext.bindTo(contextKeyService);
        welcomeVisibleKey.set(true);
        store.add(toDisposable(() => welcomeVisibleKey.reset()));
        const walkthrough = store.add(instantiationService.createInstance(SessionsWalkthroughOverlay, layoutService.mainContainer));
        store.add(autorun(reader => {
            chatEntitlementService.sentimentObs.read(reader);
            chatEntitlementService.entitlementObs.read(reader);
            if (!needsChatSetup(chatEntitlementService)) {
                storageService.store(WELCOME_COMPLETE_KEY, true, -1 /* StorageScope.APPLICATION */, 1 /* StorageTarget.MACHINE */);
                walkthrough.complete();
                store.dispose();
            }
        }));
        walkthrough.outcome
            .then(outcome => {
            logService.info(`[sessions welcome] Developer reset walkthrough finished with outcome: ${outcome}`);
            if (shouldPersistWelcomeCompletion(outcome, chatEntitlementService)) {
                storageService.store(WELCOME_COMPLETE_KEY, true, -1 /* StorageScope.APPLICATION */, 1 /* StorageTarget.MACHINE */);
            }
        })
            .finally(() => {
            store.dispose();
        });
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2VsY29tZS5jb250cmlidXRpb24uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9zZXNzaW9ucy9jb250cmliL3dlbGNvbWUvYnJvd3Nlci93ZWxjb21lLmNvbnRyaWJ1dGlvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBRSxpQkFBaUIsRUFBRSxZQUFZLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNwSCxPQUFPLEVBQUUsNkJBQTZCLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUMvRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDaEUsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQy9DLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNyRSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDeEYsT0FBTyxFQUEwQiw4QkFBOEIsRUFBa0IsTUFBTSwrQ0FBK0MsQ0FBQztBQUN2SSxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSxnRUFBZ0UsQ0FBQztBQUN6RyxPQUFPLEVBQUUsZUFBZSxFQUEwQix1QkFBdUIsRUFBRSxNQUFNLHNFQUFzRSxDQUFDO0FBQ3hKLE9BQU8sRUFBRSxxQkFBcUIsRUFBb0IsTUFBTSw0REFBNEQsQ0FBQztBQUNySCxPQUFPLEVBQUUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSw4REFBOEQsQ0FBQztBQUMxRixPQUFPLEVBQUUsZUFBZSxFQUErQixNQUFNLGdEQUFnRCxDQUFDO0FBQzlHLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQzFGLE9B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