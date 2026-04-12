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
import './agentFeedbackEditorInputContribution.js';
import './agentFeedbackEditorWidgetContribution.js';
import './agentFeedbackOverviewRulerContribution.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, observableFromEvent } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { MenuId, MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { IContextKeyService, ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { registerWorkbenchContribution2 } from '../../../../workbench/common/contributions.js';
import { IsSessionsWindowContext } from '../../../../workbench/common/contextkeys.js';
import { AgentFeedbackService, IAgentFeedbackService } from './agentFeedbackService.js';
import { AgentFeedbackAttachmentContribution } from './agentFeedbackAttachment.js';
import { AgentFeedbackAttachmentWidget } from './agentFeedbackAttachmentWidget.js';
import { AgentFeedbackEditorOverlay } from './agentFeedbackEditorOverlay.js';
import { hasActiveSessionAgentFeedback, registerAgentFeedbackEditorActions, submitActiveSessionFeedbackActionId } from './agentFeedbackEditorActions.js';
import { IChatAttachmentWidgetRegistry } from '../../../../workbench/contrib/chat/browser/attachments/chatAttachmentWidgetRegistry.js';
import { ISessionsManagementService } from '../../sessions/browser/sessionsManagementService.js';
import { Codicon } from '../../../../base/common/codicons.js';
/**
 * Sets the `hasActiveSessionAgentFeedback` context key to true when the
 * currently active session has pending agent feedback items.
 */
let ActiveSessionFeedbackContextContribution = class ActiveSessionFeedbackContextContribution extends Disposable {
    static { this.ID = 'workbench.contrib.activeSessionFeedbackContext'; }
    constructor(contextKeyService, agentFeedbackService, sessionManagementService) {
        super();
        const contextKey = hasActiveSessionAgentFeedback.bindTo(contextKeyService);
        const menuRegistration = this._register(new MutableDisposable());
        const feedbackChanged = observableFromEvent(this, agentFeedbackService.onDidChangeFeedback, e => e);
        this._register(autorun(reader => {
            feedbackChanged.read(reader);
            const activeSession = sessionManagementService.activeSession.read(reader);
            menuRegistration.clear();
            if (!activeSession) {
                contextKey.set(false);
                return;
            }
            const feedback = agentFeedbackService.getFeedback(activeSession.resource);
            const count = feedback.length;
            contextKey.set(count > 0);
            if (count > 0) {
                menuRegistration.value = MenuRegistry.appendMenuItem(MenuId.ChatEditingSessionApplySubmenu, {
                    command: {
                        id: submitActiveSessionFeedbackActionId,
                        icon: Codicon.comment,
                        title: localize('agentFeedback.submitFeedbackCount', "Submit Feedback ({0})", count),
                    },
                    group: 'navigation',
                    order: 3,
                    when: ContextKeyExpr.and(IsSessionsWindowContext, hasActiveSessionAgentFeedback),
                });
            }
        }));
    }
};
ActiveSessionFeedbackContextContribution = __decorate([
    __param(0, IContextKeyService),
    __param(1, IAgentFeedbackService),
    __param(2, ISessionsManagementService)
], ActiveSessionFeedbackContextContribution);
registerWorkbenchContribution2(ActiveSessionFeedbackContextContribution.ID, ActiveSessionFeedbackContextContribution, 3 /* WorkbenchPhase.AfterRestored */);
registerWorkbenchContribution2(AgentFeedbackEditorOverlay.ID, AgentFeedbackEditorOverlay, 3 /* WorkbenchPhase.AfterRestored */);
registerWorkbenchContribution2(AgentFeedbackAttachmentContribution.ID, AgentFeedbackAttachmentContribution, 3 /* WorkbenchPhase.AfterRestored */);
registerAgentFeedbackEditorActions();
registerSingleton(IAgentFeedbackService, AgentFeedbackService, 1 /* InstantiationType.Delayed */);
// Register the custom attachment widget for agentFeedback attachments
let AgentFeedbackAttachmentWidgetContribution = class AgentFeedbackAttachmentWidgetContribution {
    static { this.ID = 'workbench.contrib.agentFeedbackAttachmentWidgetFactory'; }
    constructor(registry, instantiationService) {
        registry.registerFactory('agentFeedback', (attachment, options, container) => {
            return instantiationService.createInstance(AgentFeedbackAttachmentWidget, attachment, options, container);
        });
    }
};
AgentFeedbackAttachmentWidgetContribution = __decorate([
    __param(0, IChatAttachmentWidgetRegistry),
    __param(1, IInstantiationService)
], AgentFeedbackAttachmentWidgetContribution);
registerWorkbenchContribution2(AgentFeedbackAttachmentWidgetContribution.ID, AgentFeedbackAttachmentWidgetContribution, 3 /* WorkbenchPhase.AfterRestored */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWdlbnRGZWVkYmFjay5jb250cmlidXRpb24uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9zZXNzaW9ucy9jb250cmliL2FnZW50RmVlZGJhY2svYnJvd3Nlci9hZ2VudEZlZWRiYWNrLmNvbnRyaWJ1dGlvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLDJDQUEyQyxDQUFDO0FBQ25ELE9BQU8sNENBQTRDLENBQUM7QUFDcEQsT0FBTyw2Q0FBNkMsQ0FBQztBQUNyRCxPQUFPLEVBQUUsVUFBVSxFQUFFLGlCQUFpQixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDckYsT0FBTyxFQUFFLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ3JGLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUM5QyxPQUFPLEVBQUUsTUFBTSxFQUFFLFlBQVksRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ3RGLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxjQUFjLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUMxRyxPQUFPLEVBQXFCLGlCQUFpQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFDL0csT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbkcsT0FBTyxFQUEwQiw4QkFBOEIsRUFBa0IsTUFBTSwrQ0FBK0MsQ0FBQztBQUN2SSxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUN0RixPQUFPLEVBQUUsb0JBQW9CLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztBQUN4RixPQUFPLEVBQUUsbUNBQW1DLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUNuRixPQUFPLEVBQUUsNkJBQTZCLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztB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