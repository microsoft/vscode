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
var GrowthSessionController_1;
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { ILifecycleService } from '../../../../services/lifecycle/common/lifecycle.js';
import { AgentSessionProviders } from '../agentSessions/agentSessions.js';
import { sessionOpenerRegistry } from '../agentSessions/agentSessionsOpener.js';
import { IChatWidgetService } from '../chat.js';
import { CHAT_OPEN_ACTION_ID } from '../actions/chatActions.js';
/**
 * Core-side growth session controller that shows a single "attention needed"
 * session item in the agent sessions view for anonymous/new users.
 *
 * When the user clicks the session, we open the chat panel (which triggers the
 * anonymous setup flow). When the user opens chat at all, the badge is cleared.
 *
 * The session is shown at most once, tracked via a storage flag.
 */
let GrowthSessionController = class GrowthSessionController extends Disposable {
    static { GrowthSessionController_1 = this; }
    static { this.STORAGE_KEY = 'chat.growthSession.dismissed'; }
    static { this.SESSION_URI = URI.from({ scheme: AgentSessionProviders.Growth, path: '/growth-welcome' }); }
    get isDismissed() { return this._dismissed; }
    constructor(storageService, chatWidgetService, lifecycleService, logService) {
        super();
        this.storageService = storageService;
        this.chatWidgetService = chatWidgetService;
        this.lifecycleService = lifecycleService;
        this.logService = logService;
        this._onDidChangeChatSessionItems = this._register(new Emitter());
        this.onDidChangeChatSessionItems = this._onDidChangeChatSessionItems.event;
        this._onDidDismiss = this._register(new Emitter());
        this.onDidDismiss = this._onDidDismiss.event;
        this._created = Date.now();
        this._dismissed = this.storageService.getBoolean(GrowthSessionController_1.STORAGE_KEY, -1 /* StorageScope.APPLICATION */, false);
        // Dismiss the growth session when the user opens chat.
        // Wait until the workbench is fully restored so we skip widgets
        // that were restored from a previous session at startup.
        this.lifecycleService.when(3 /* LifecyclePhase.Restored */).then(() => {
            if (this._store.isDisposed || this._dismissed) {
                return;
            }
            this._register(this.chatWidgetService.onDidAddWidget(() => {
                this.dismiss();
            }));
        });
    }
    get items() {
        if (this._dismissed) {
            return [];
        }
        return [{
                resource: GrowthSessionController_1.SESSION_URI,
                label: localize('growthSession.label', "Try Copilot"),
                description: localize('growthSession.description', "GitHub Copilot is available. Try it for free."),
                status: 3 /* ChatSessionStatus.NeedsInput */,
                iconPath: Codicon.lightbulb,
                timing: {
                    created: this._created,
                    lastRequestStarted: undefined,
                    lastRequestEnded: undefined,
                },
            }];
    }
    async refresh() {
        // Nothing to refresh -- this is a static, local-only session item
    }
    dismiss() {
        if (this._dismissed) {
            return;
        }
        this.logService.trace('[GrowthSession] Dismissing growth session');
        this._dismissed = true;
        this.storageService.store(GrowthSessionController_1.STORAGE_KEY, true, -1 /* StorageScope.APPLICATION */, 0 /* StorageTarget.USER */);
        // Fire change event first so that listeners (like the model) see empty items
        this._onDidChangeChatSessionItems.fire({
            removed: [GrowthSessionController_1.SESSION_URI],
        });
        // Then fire dismiss event which triggers unregistration of the controller.
        this._onDidDismiss.fire();
    }
};
GrowthSessionController = GrowthSessionController_1 = __decorate([
    __param(0, IStorageService),
    __param(1, IChatWidgetService),
    __param(2, ILifecycleService),
    __param(3, ILogService)
], GrowthSessionController);
export { GrowthSessionController };
/**
 * Handles clicks on the growth session item in the agent sessions view.
 * Opens a new local chat session with a pre-seeded welcome message.
 * The user can then send messages that go through the normal agent.
 */
export class GrowthSessionOpenerParticipant {
    async handleOpenSession(accessor, session, _openOptions) {
        if (session.providerType !== AgentSessionProviders.Growth) {
            return false;
        }
        const commandService = accessor.get(ICommandService);
        const opts = {
            query: '',
            isPartialQuery: true,
            previousRequests: [{
                    request: localize('growthSession.previousRequest', "Tell me about GitHub Copilot!"),
                    // allow-any-unicode-next-line
                    response: localize('growthSession.previousResponse', "Welcome to GitHub Copilot, your AI coding assistant! Here are some things you can try:\n\n- 🐛 *\"Help me debug this error\"* — paste an error message and get a fix\n- 🧪 *\"Write tests for my function\"* — select code and ask for unit tests\n- 💡 *\"Explain this code\"* — highlight something unfamiliar and ask what it does\n- 🚀 *\"Scaffold a REST API\"* — describe what you want and let Agent mode build it\n- 🎨 *\"Refactor this to be more readable\"* — select messy code and clean it up\n\nType anything below to get started!"),
                }],
        };
        await commandService.executeCommand(CHAT_OPEN_ACTION_ID, opts);
        return true;
    }
}
/**
 * Registers the growth session controller and opener participant.
 * Returns a disposable that cleans up all registrations.
 */
export function registerGrowthSession(chatSessionsService, growthController) {
    const disposables = new DisposableStore();
    // Register as session item controller so it appears in the sessions view
    disposables.add(chatSessionsService.registerChatSessionItemController(AgentSessionProviders.Growth, growthController));
    // Register opener participant so clicking the growth session opens chat
    disposables.add(sessionOpenerRegistry.registerParticipant(new GrowthSessionOpenerParticipant()));
    return disposables;
}
// #region Developer Actions
registerAction2(class ResetGrowthSessionAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.chat.resetGrowthSession',
            title: localize2('resetGrowthSession', "Reset Growth Session Notification"),
            category: localize2('developer', "Developer"),
            f1: true,
        });
    }
    run(accessor) {
        const storageService = accessor.get(IStorageService);
        storageService.remove(GrowthSessionController.STORAGE_KEY, -1 /* StorageScope.APPLICATION */);
    }
});
// #endregion
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFNldHVwR3Jvd3RoU2Vzc2lvbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9jaGF0U2V0dXAvY2hhdFNldHVwR3Jvd3RoU2Vzc2lvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ2pFLE9BQU8sRUFBRSxPQUFPLEVBQVMsTUFBTSxxQ0FBcUMsQ0FBQztBQUNyRSxPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBZSxNQUFNLHlDQUF5QyxDQUFDO0FBQ25HLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUV4RCxPQUFPLEVBQUUsUUFBUSxFQUFFLFNBQVMsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBQzVELE9BQU8sRUFBRSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDN0YsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQ3RGLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUN4RSxPQUFPLEVBQUUsZUFBZSxFQUErQixNQUFNLG1EQUFtRCxDQUFDO0FBQ2pILE9BQU8sRUFBRSxpQkFBaUIsRUFBa0IsTUFBTSxvREFBb0QsQ0FBQztBQUV2RyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUUxRSxPQUFPLEVBQWtELHFCQUFxQixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDaEksT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sWUFBWSxDQUFDO0FBQ2hELE9BQU8sRUFBRSxtQkFBbUIsRUFBd0IsTUFBTSwyQkFBMkIsQ0FBQztBQUV0Rjs7Ozs7Ozs7R0FRRztBQUNJ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