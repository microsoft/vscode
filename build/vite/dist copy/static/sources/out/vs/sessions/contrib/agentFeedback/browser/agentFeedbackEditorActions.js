/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Codicon } from '../../../../base/common/codicons.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { isEqual } from '../../../../base/common/resources.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { IEditorGroupsService } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { IChatWidgetService } from '../../../../workbench/contrib/chat/browser/chat.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { CHAT_CATEGORY } from '../../../../workbench/contrib/chat/browser/actions/chatActions.js';
import { IAgentFeedbackService } from './agentFeedbackService.js';
import { getActiveResourceCandidates, getSessionForResource } from './agentFeedbackEditorUtils.js';
import { Menus } from '../../../browser/menus.js';
import { IChatEditingService } from '../../../../workbench/contrib/chat/common/editing/chatEditingService.js';
import { ICodeReviewService } from '../../codeReview/browser/codeReviewService.js';
import { getSessionEditorComments } from './sessionEditorComments.js';
import { ISessionsManagementService } from '../../sessions/browser/sessionsManagementService.js';
export const submitFeedbackActionId = 'agentFeedbackEditor.action.submit';
export const navigatePreviousFeedbackActionId = 'agentFeedbackEditor.action.navigatePrevious';
export const navigateNextFeedbackActionId = 'agentFeedbackEditor.action.navigateNext';
export const clearAllFeedbackActionId = 'agentFeedbackEditor.action.clearAll';
export const navigationBearingFakeActionId = 'agentFeedbackEditor.navigation.bearings';
export const hasSessionEditorComments = new RawContextKey('agentFeedbackEditor.hasSessionComments', false);
export const hasSessionAgentFeedback = new RawContextKey('agentFeedbackEditor.hasAgentFeedback', false);
export const hasActiveSessionAgentFeedback = new RawContextKey('agentFeedbackEditor.hasActiveSessionAgentFeedback', false);
export const submitActiveSessionFeedbackActionId = 'agentFeedbackEditor.action.submitActiveSession';
class AgentFeedbackEditorAction extends Action2 {
    constructor(desc) {
        super({
            category: CHAT_CATEGORY,
            ...desc,
        });
    }
    async run(accessor) {
        const editorService = accessor.get(IEditorService);
        const agentFeedbackService = accessor.get(IAgentFeedbackService);
        const chatEditingService = accessor.get(IChatEditingService);
        const sessionsManagementService = accessor.get(ISessionsManagementService);
        const codeReviewService = accessor.get(ICodeReviewService);
        const editorGroupsService = accessor.get(IEditorGroupsService);
        const activePane = editorService.activeEditorPane
            ?? editorGroupsService.getGroups(1 /* GroupsOrder.MOST_RECENTLY_ACTIVE */).find(g => g.activeEditorPane)?.activeEditorPane
            ?? editorService.visibleEditorPanes[0];
        const candidates = getActiveResourceCandidates(activePane?.input);
        for (const candidate of candidates) {
            const sessionResource = getSessionForResource(candidate, chatEditingService, sessionsManagementService)
                ?? agentFeedbackService.getMostRecentSessionForResource(candidate);
            if (!sessionResource) {
                continue;
            }
            const comments = getSessionEditorComments(sessionResource, agentFeedbackService.getFeedback(sessionResource), codeReviewService.getReviewState(sessionResource).get(), codeReviewService.getPRReviewState(sessionResource).get());
            if (comments.length > 0) {
                return this.runWithSession(accessor, sessionResource);
            }
        }
    }
}
class SubmitFeedbackAction extends AgentFeedbackEditorAction {
    constructor() {
        super({
            id: submitFeedbackActionId,
            title: localize2('agentFeedback.submit', 'Submit Feedback'),
            shortTitle: localize2('agentFeedback.submitShort', 'Submit'),
            icon: Codicon.send,
            precondition: ChatContextKeys.enabled,
            menu: {
                id: Menus.AgentFeedbackEditorContent,
                group: 'a_submit',
                order: 0,
                when: ContextKeyExpr.and(ChatContextKeys.enabled, hasSessionAgentFeedback),
            },
        });
    }
    async runWithSession(accessor, sessionResource) {
        const chatWidgetService = accessor.get(IChatWidgetService);
        const agentFeedbackService = accessor.get(IAgentFeedbackService);
        const editorService = accessor.get(IEditorService);
        const logService = accessor.get(ILogService);
        const widget = chatWidgetService.getWidgetBySessionResource(sessionResource);
        if (!widget) {
            logService.error('[AgentFeedback] Cannot submit feedback: no chat widget found for session', sessionResource.toString());
            return;
        }
        // Close all editors belonging to the session resource
        const editorsToClose = [];
        for (const { editor, groupId } of editorService.getEditors(1 /* EditorsOrder.SEQUENTIAL */)) {
            const candidates = getActiveResourceCandidates(editor);
            const belongsToSession = candidates.some(uri => isEqual(agentFeedbackService.getMostRecentSessionForResource(uri), sessionResource));
            if (belongsToSession) {
                editorsToClose.push({ editor, groupId });
            }
        }
        if (editorsToClose.length) {
            await editorService.closeEditors(editorsToClose);
        }
        await widget.acceptInput('/act-on-feedback');
    }
}
class NavigateFeedbackAction extends AgentFeedbackEditorAction {
    constructor(_next) {
        super({
            id: _next ? navigateNextFeedbackActionId : navigatePreviousFeedbackActionId,
            title: _next
                ? localize2('agentFeedback.next', 'Go to Next Feedback Comment')
                : localize2('agentFeedback.previous', 'Go to Previous Feedback Comment'),
            icon: _next ? Codicon.arrowDown : Codicon.arrowUp,
            f1: true,
            precondition: ChatContextKeys.enabled,
            menu: {
                id: Menus.AgentFeedbackEditorContent,
                group: 'navigate',
                order: _next ? 2 : 1,
                when: ContextKeyExpr.and(ChatContextKeys.enabled, hasSessionEditorComments),
            },
        });
        this._next = _next;
    }
    async runWithSession(accessor, sessionResource) {
        const agentFeedbackService = accessor.get(IAgentFeedbackService);
        const codeReviewService = accessor.get(ICodeReviewService);
        const comments = getSessionEditorComments(sessionResource, agentFeedbackService.getFeedback(sessionResource), codeReviewService.getReviewState(sessionResource).get(), codeReviewService.getPRReviewState(sessionResource).get());
        const comment = agentFeedbackService.getNextNavigableItem(sessionResource, comments, this._next);
        if (!comment) {
            return;
        }
        await agentFeedbackService.revealSessionComment(sessionResource, comment.id, comment.resourceUri, comment.range);
    }
}
class ClearAllFeedbackAction extends AgentFeedbackEditorAction {
    constructor() {
        super({
            id: clearAllFeedbackActionId,
            title: localize2('agentFeedback.clear', 'Clear'),
            tooltip: localize2('agentFeedback.clearAllTooltip', 'Clear All Feedback'),
            icon: Codicon.clearAll,
            f1: true,
            precondition: ContextKeyExpr.and(ChatContextKeys.enabled),
            menu: {
                id: Menus.AgentFeedbackEditorContent,
                group: 'a_submit',
                order: 1,
                when: ContextKeyExpr.and(ChatContextKeys.enabled, hasSessionAgentFeedback),
            },
        });
    }
    runWithSession(accessor, sessionResource) {
        const agentFeedbackService = accessor.get(IAgentFeedbackService);
        agentFeedbackService.clearFeedback(sessionResource);
    }
}
class SubmitActiveSessionFeedbackAction extends Action2 {
    static { this.ID = submitActiveSessionFeedbackActionId; }
    constructor() {
        super({
            id: SubmitActiveSessionFeedbackAction.ID,
            title: localize2('agentFeedback.submitFeedback', 'Submit Feedback'),
            icon: Codicon.comment,
            category: CHAT_CATEGORY,
            precondition: ContextKeyExpr.and(ChatContextKeys.enabled, hasActiveSessionAgentFeedback),
        });
    }
    async run(accessor) {
        const sessionManagementService = accessor.get(ISessionsManagementService);
        const agentFeedbackService = accessor.get(IAgentFeedbackService);
        const chatWidgetService = accessor.get(IChatWidgetService);
        const editorService = accessor.get(IEditorService);
        const logService = accessor.get(ILogService);
        const activeSession = sessionManagementService.activeSession.get();
        if (!activeSession) {
            return;
        }
        const sessionResource = activeSession.resource;
        const feedbackItems = agentFeedbackService.getFeedback(sessionResource);
        if (feedbackItems.length === 0) {
            return;
        }
        const widget = chatWidgetService.getWidgetBySessionResource(sessionResource);
        if (!widget) {
            logService.error('[AgentFeedback] Cannot submit feedback: no chat widget found for session', sessionResource.toString());
            return;
        }
        // Close all editors belonging to the session resource
        const editorsToClose = [];
        for (const { editor, groupId } of editorService.getEditors(1 /* EditorsOrder.SEQUENTIAL */)) {
            const candidates = getActiveResourceCandidates(editor);
            const belongsToSession = candidates.some(uri => isEqual(agentFeedbackService.getMostRecentSessionForResource(uri), sessionResource));
            if (belongsToSession) {
                editorsToClose.push({ editor, groupId });
            }
        }
        if (editorsToClose.length) {
            await editorService.closeEditors(editorsToClose);
        }
        await widget.acceptInput('/act-on-feedback');
    }
}
export function registerAgentFeedbackEditorActions() {
    registerAction2(SubmitFeedbackAction);
    registerAction2(SubmitActiveSessionFeedbackAction);
    registerAction2(class extends NavigateFeedbackAction {
        constructor() { super(false); }
    });
    registerAction2(class extends NavigateFeedbackAction {
        constructor() { super(true); }
    });
    registerAction2(ClearAllFeedbackAction);
    MenuRegistry.appendMenuItem(Menus.AgentFeedbackEditorContent, {
        command: {
            id: navigationBearingFakeActionId,
            title: localize('label', 'Navigation Status'),
            precondition: ContextKeyExpr.false(),
        },
        group: 'navigate',
        order: -1,
        when: ContextKeyExpr.and(ChatContextKeys.enabled, hasSessionEditorComments),
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWdlbnRGZWVkYmFja0VkaXRvckFjdGlvbnMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9zZXNzaW9ucy9jb250cmliL2FnZW50RmVlZGJhY2svYnJvd3Nlci9hZ2VudEZlZWRiYWNrRWRpdG9yQWN0aW9ucy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDOUQsT0FBTyxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUN6RCxPQUFPLEVBQUUsT0FBTyxFQUFFLFlBQVksRUFBRSxlQUFlLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUN4RyxPQUFPLEVBQUUsY0FBYyxFQUFFLGFBQWEsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBRXJHLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUVyRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFFL0QsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQy9GLE9BQU8sRUFBZSxvQkFBb0IsRUFBRSxNQUFNLHFFQUFxRSxDQUFDO0FBQ3hILE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBQ3hGLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxzRUFBc0UsQ0FBQztBQUN2RyxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sbUVBQW1FLENBQUM7QUFDbEcsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sMkJBQTJCLENBQUM7QUFDbEUsT0FBTyxFQUFFLDJCQUEyQixFQUFFLHFCQUFxQixFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDbkcsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLDJCQUEyQixDQUFDO0FBQ2xELE9B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