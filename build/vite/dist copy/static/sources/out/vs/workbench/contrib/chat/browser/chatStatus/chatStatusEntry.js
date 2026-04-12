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
import './media/chatStatus.css';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { IStatusbarService, ShowTooltipCommand } from '../../../../services/statusbar/browser/statusbar.js';
import { ChatEntitlement, IChatEntitlementService, isProUser } from '../../../../services/chat/common/chatEntitlementService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { getCodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { IInlineCompletionsService } from '../../../../../editor/browser/services/inlineCompletionsService.js';
import { IChatSessionsService } from '../../common/chatSessionsService.js';
import { ChatStatusDashboard } from './chatStatusDashboard.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { disposableWindowInterval } from '../../../../../base/browser/dom.js';
import { isNewUser } from './chatStatus.js';
import product from '../../../../../platform/product/common/product.js';
import { isCompletionsEnabled } from '../../../../../editor/common/services/completionsEnablement.js';
import { ChatConfiguration } from '../../common/constants.js';
let ChatStatusBarEntry = class ChatStatusBarEntry extends Disposable {
    static { this.ID = 'workbench.contrib.chatStatusBarEntry'; }
    constructor(chatEntitlementService, instantiationService, statusbarService, editorService, configurationService, completionsService, chatSessionsService) {
        super();
        this.chatEntitlementService = chatEntitlementService;
        this.instantiationService = instantiationService;
        this.statusbarService = statusbarService;
        this.editorService = editorService;
        this.configurationService = configurationService;
        this.completionsService = completionsService;
        this.chatSessionsService = chatSessionsService;
        this.entry = undefined;
        this.activeCodeEditorListener = this._register(new MutableDisposable());
        this.runningSessionsCount = this.chatSessionsService.getInProgress().reduce((total, item) => total + item.count, 0);
        this.update();
        this.registerListeners();
    }
    update() {
        const sentiment = this.chatEntitlementService.sentiment;
        if (!sentiment.hidden) {
            const props = this.getEntryProps();
            if (this.entry) {
                this.entry.update(props);
            }
            else {
                this.entry = this.statusbarService.addEntry(props, 'chat.statusBarEntry', 1 /* StatusbarAlignment.RIGHT */, { location: { id: 'status.editor.mode', priority: 100.1 }, alignment: 1 /* StatusbarAlignment.RIGHT */ });
            }
        }
        else {
            this.entry?.dispose();
            this.entry = undefined;
        }
    }
    registerListeners() {
        this._register(this.chatEntitlementService.onDidChangeQuotaExceeded(() => this.update()));
        this._register(this.chatEntitlementService.onDidChangeSentiment(() => this.update()));
        this._register(this.chatEntitlementService.onDidChangeEntitlement(() => this.update()));
        this._register(this.completionsService.onDidChangeIsSnoozing(() => this.update()));
        this._register(this.chatSessionsService.onDidChangeInProgress(() => {
            const oldSessionsCount = this.runningSessionsCount;
            this.runningSessionsCount = this.chatSessionsService.getInProgress().reduce((total, item) => total + item.count, 0);
            if (this.runningSessionsCount !== oldSessionsCount) {
                this.update();
            }
        }));
        this._register(this.editorService.onDidActiveEditorChange(() => this.onDidActiveEditorChange()));
        this._register(this.configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration(product.defaultChatAgent?.completionsEnablementSetting) || e.affectsConfiguration(ChatConfiguration.SignInTitleBarEnabled)) {
                this.update();
            }
        }));
    }
    onDidActiveEditorChange() {
        this.update();
        this.activeCodeEditorListener.clear();
        // Listen to language changes in the active code editor
        const activeCodeEditor = getCodeEditor(this.editorService.activeTextEditorControl);
        if (activeCodeEditor) {
            this.activeCodeEditorListener.value = activeCodeEditor.onDidChangeModelLanguage(() => {
                this.update();
            });
        }
    }
    getEntryProps() {
        let text = '$(copilot)';
        let ariaLabel = localize('chatStatusAria', "Copilot status");
        let kind;
        if (isNewUser(this.chatEntitlementService)) {
            const entitlement = this.chatEntitlementService.entitlement;
            // Finish Setup
            if (this.chatEntitlementService.sentiment.later || // user skipped setup
                entitlement === ChatEntitlement.Available || // user is entitled
                isProUser(entitlement) || // user is already pro
                entitlement === ChatEntitlement.Free // user is already free
            ) {
                const finishSetup = localize('finishSetup', "Finish Setup");
                text = `$(copilot) ${finishSetup}`;
                ariaLabel = finishSetup;
                kind = 'prominent';
            }
        }
        else {
            const chatQuotaExceeded = this.chatEntitlementService.quotas.chat?.percentRemaining === 0;
            const completionsQuotaExceeded = this.chatEntitlementService.quotas.completions?.percentRemaining === 0;
            // Disabled
            if (this.chatEntitlementService.sentiment.disabled || this.chatEntitlementService.sentiment.untrusted) {
                text = '$(copilot-unavailable)';
                ariaLabel = localize('copilotDisabledStatus', "Copilot disabled");
            }
            // Sessions in progress
            else if (this.runningSessionsCount > 0) {
                text = '$(copilot-in-progress)';
                if (this.runningSessionsCount > 1) {
                    ariaLabel = localize('chatSessionsInProgressStatus', "{0} agent sessions in progress", this.runningSessionsCount);
                }
                else {
                    ariaLabel = localize('chatSessionInProgressStatus', "1 agent session in progress");
                }
            }
            // Signed out
            else if (this.chatEntitlementService.entitlement === ChatEntitlement.Unknown) {
                const signInExperiment = this.configurationService.getValue(ChatConfiguration.SignInTitleBarEnabled);
                if (signInExperiment) {
                    const signIn = localize('signIn', "Sign In");
                    text = `$(copilot) ${signIn}`;
                    ariaLabel = signIn;
                }
                else {
                    const signedOut = localize('notSignedIn', "Signed out");
                    text = `${this.chatEntitlementService.anonymous ? '$(copilot)' : '$(copilot-not-connected)'} ${signedOut}`;
                    ariaLabel = signedOut;
                    kind = 'prominent';
                }
            }
            // Free Quota Exceeded
            else if (this.chatEntitlementService.entitlement === ChatEntitlement.Free && (chatQuotaExceeded || completionsQuotaExceeded)) {
                let quotaWarning;
                if (chatQuotaExceeded && !completionsQuotaExceeded) {
                    quotaWarning = localize('chatQuotaExceededStatus', "Chat quota reached");
                }
                else if (completionsQuotaExceeded && !chatQuotaExceeded) {
                    quotaWarning = localize('completionsQuotaExceededStatus', "Inline suggestions quota reached");
                }
                else {
                    quotaWarning = localize('chatAndCompletionsQuotaExceededStatus', "Quota reached");
                }
                text = `$(copilot-warning) ${quotaWarning}`;
                ariaLabel = quotaWarning;
                kind = 'prominent';
            }
            // Completions Disabled
            else if (this.editorService.activeTextEditorLanguageId && !isCompletionsEnabled(this.configurationService, this.editorService.activeTextEditorLanguageId)) {
                text = '$(copilot-unavailable)';
                ariaLabel = localize('completionsDisabledStatus', "Inline suggestions disabled");
            }
            // Completions Snoozed
            else if (this.completionsService.isSnoozing()) {
                text = '$(copilot-snooze)';
                ariaLabel = localize('completionsSnoozedStatus', "Inline suggestions snoozed");
            }
        }
        const baseResult = {
            name: localize('chatStatus', "Copilot Status"),
            text,
            ariaLabel,
            command: ShowTooltipCommand,
            showInAllWindows: true,
            kind,
            tooltip: {
                element: (token) => {
                    const store = new DisposableStore();
                    store.add(token.onCancellationRequested(() => {
                        store.dispose();
                    }));
                    const elem = ChatStatusDashboard.instantiateInContents(this.instantiationService, store, undefined);
                    // todo@connor4312/@benibenj: workaround for #257923
                    store.add(disposableWindowInterval(mainWindow, () => {
                        if (!elem.isConnected) {
                            store.dispose();
                        }
                    }, 2000));
                    return elem;
                }
            }
        };
        return baseResult;
    }
    dispose() {
        super.dispose();
        this.entry?.dispose();
        this.entry = undefined;
    }
};
ChatStatusBarEntry = __decorate([
    __param(0, IChatEntitlementService),
    __param(1, IInstantiationService),
    __param(2, IStatusbarService),
    __param(3, IEditorService),
    __param(4, IConfigurationService),
    __param(5, IInlineCompletionsService),
    __param(6, IChatSessionsService)
], ChatStatusBarEntry);
export { ChatStatusBarEntry };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFN0YXR1c0VudHJ5LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2NoYXRTdGF0dXMvY2hhdFN0YXR1c0VudHJ5LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sd0JBQXdCLENBQUM7QUFDaEMsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUN6RyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFFakQsT0FBTyxFQUE0QyxpQkFBaUIsRUFBRSxrQkFBa0IsRUFBMEMsTUFBTSxxREFBcUQsQ0FBQztBQUM5TCxPQUFPLEVBQUUsZUFBZSxFQUEwQix1QkFBdUIsRUFBRSxTQUFTLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUV6SixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUN0RyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0scURBQXFELENBQUM7QUFDckYsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDdEcsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQy9FLE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxNQUFNLG9FQUFvRSxDQUFDO0FBQy9HLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzNFLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQy9ELE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNuRSxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUM5RSxPQUFPLEVBQUUsU0FBUyxFQUFF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