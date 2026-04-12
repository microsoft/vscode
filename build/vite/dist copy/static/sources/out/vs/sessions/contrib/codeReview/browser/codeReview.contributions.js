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
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { registerWorkbenchContribution2 } from '../../../../workbench/common/contributions.js';
import { IsSessionsWindowContext } from '../../../../workbench/common/contextkeys.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { CHAT_CATEGORY } from '../../../../workbench/contrib/chat/browser/actions/chatActions.js';
import { ISessionsManagementService } from '../../sessions/browser/sessionsManagementService.js';
import { IAgentFeedbackService } from '../../agentFeedback/browser/agentFeedbackService.js';
import { getSessionEditorComments } from '../../agentFeedback/browser/sessionEditorComments.js';
import { CodeReviewService, getCodeReviewFilesFromSessionChanges, getCodeReviewVersion, ICodeReviewService, MAX_CODE_REVIEWS_PER_SESSION_VERSION } from './codeReviewService.js';
import { CopilotCloudSessionType } from '../../sessions/browser/sessionTypes.js';
registerSingleton(ICodeReviewService, CodeReviewService, 1 /* InstantiationType.Delayed */);
const canRunSessionCodeReviewContextKey = new RawContextKey('sessions.canRunCodeReview', true, {
    type: 'boolean',
    description: localize('sessions.canRunCodeReview', "True when a new code review can be started for the active session version."),
});
function registerSessionCodeReviewAction(tooltip, icon) {
    class RunSessionCodeReviewAction extends Action2 {
        static { this.ID = 'sessions.codeReview.run'; }
        constructor() {
            super({
                id: RunSessionCodeReviewAction.ID,
                title: localize('sessions.runCodeReview', "Run Code Review"),
                tooltip,
                category: CHAT_CATEGORY,
                icon,
                precondition: ContextKeyExpr.and(ChatContextKeys.hasAgentSessionChanges, canRunSessionCodeReviewContextKey),
                menu: [
                    {
                        id: MenuId.ChatEditingSessionChangesToolbar,
                        group: 'navigation',
                        order: 7,
                        when: ContextKeyExpr.and(IsSessionsWindowContext, ChatContextKeys.agentSessionType.notEqualsTo(CopilotCloudSessionType.id)),
                    },
                ],
            });
        }
        async run(accessor, sessionResource) {
            const sessionManagementService = accessor.get(ISessionsManagementService);
            const codeReviewService = accessor.get(ICodeReviewService);
            const agentFeedbackService = accessor.get(IAgentFeedbackService);
            const resource = URI.isUri(sessionResource)
                ? sessionResource
                : sessionManagementService.activeSession.get()?.resource;
            if (!resource) {
                return;
            }
            // Get changes from ISession
            const sessionData = sessionManagementService.getSession(resource);
            const changes = sessionData?.changes.get();
            if (!changes || changes.length === 0) {
                return;
            }
            const files = getCodeReviewFilesFromSessionChanges(changes);
            const version = getCodeReviewVersion(files);
            // If there are existing comments (code review or PR review), navigate to the first one
            const reviewState = codeReviewService.getReviewState(resource).get();
            const prReviewState = codeReviewService.getPRReviewState(resource).get();
            const reviewCount = reviewState.kind !== "idle" /* CodeReviewStateKind.Idle */ && reviewState.version === version ? reviewState.reviewCount : 0;
            const codeReviewCount = reviewState.kind === "result" /* CodeReviewStateKind.Result */ && reviewState.version === version ? reviewState.comments.length : 0;
            const prReviewCount = prReviewState.kind === "loaded" /* PRReviewStateKind.Loaded */ ? prReviewState.comments.length : 0;
            if (codeReviewCount > 0 || prReviewCount > 0) {
                const comments = getSessionEditorComments(resource, agentFeedbackService.getFeedback(resource), reviewState, prReviewState);
                const first = agentFeedbackService.getNextNavigableItem(resource, comments, true);
                if (first) {
                    await agentFeedbackService.revealSessionComment(resource, first.id, first.resourceUri, first.range);
                }
                return;
            }
            if (reviewCount >= MAX_CODE_REVIEWS_PER_SESSION_VERSION) {
                return;
            }
            codeReviewService.requestReview(resource, version, files);
        }
    }
    return registerAction2(RunSessionCodeReviewAction);
}
let CodeReviewToolbarContribution = class CodeReviewToolbarContribution extends Disposable {
    static { this.ID = 'sessions.contrib.codeReviewToolbar'; }
    constructor(contextKeyService, _sessionManagementService, _codeReviewService) {
        super();
        this._sessionManagementService = _sessionManagementService;
        this._codeReviewService = _codeReviewService;
        this._actionRegistration = this._register(new MutableDisposable());
        const canRunCodeReviewContext = canRunSessionCodeReviewContextKey.bindTo(contextKeyService);
        this._register(autorun(reader => {
            const activeSession = this._sessionManagementService.activeSession.read(reader);
            this._actionRegistration.clear();
            const sessionResource = activeSession?.resource;
            if (!sessionResource) {
                canRunCodeReviewContext.set(false);
                this._actionRegistration.value = registerSessionCodeReviewAction(localize('sessions.runCodeReview.noSession', "No active session available for code review."), Codicon.codeReview);
                return;
            }
            const changes = activeSession.changes.read(reader);
            if (changes.length === 0) {
                canRunCodeReviewContext.set(false);
                this._actionRegistration.value = registerSessionCodeReviewAction(localize('sessions.runCodeReview.noChanges', "No changes available for code review."), Codicon.codeReview);
                return;
            }
            const files = getCodeReviewFilesFromSessionChanges(changes);
            const version = getCodeReviewVersion(files);
            const reviewState = this._codeReviewService.getReviewState(sessionResource).read(reader);
            const prReviewState = this._codeReviewService.getPRReviewState(sessionResource).read(reader);
            const reviewCount = reviewState.kind !== "idle" /* CodeReviewStateKind.Idle */ && reviewState.version === version ? reviewState.reviewCount : 0;
            const codeReviewCount = reviewState.kind === "result" /* CodeReviewStateKind.Result */ && reviewState.version === version ? reviewState.comments.length : 0;
            const prReviewCount = prReviewState.kind === "loaded" /* PRReviewStateKind.Loaded */ ? prReviewState.comments.length : 0;
            const totalCommentCount = codeReviewCount + prReviewCount;
            let canRunCodeReview = true;
            let tooltip = localize('sessions.runCodeReview.tooltip.default', "Run Code Review");
            let icon = Codicon.codeReview;
            if (reviewState.kind === "loading" /* CodeReviewStateKind.Loading */ && reviewState.version === version) {
                canRunCodeReview = false;
                tooltip = localize('sessions.runCodeReview.tooltip.loading', "Creating code review...");
                icon = Codicon.commentDraft;
            }
            else if (totalCommentCount > 0) {
                canRunCodeReview = true;
                icon = Codicon.commentUnresolved;
                tooltip = totalCommentCount === 1
                    ? localize('sessions.runCodeReview.tooltip.oneUnresolved', "1 review comment unresolved.")
                    : localize('sessions.runCodeReview.tooltip.manyUnresolved', "{0} review comments unresolved.", totalCommentCount);
            }
            else if (reviewCount >= MAX_CODE_REVIEWS_PER_SESSION_VERSION) {
                canRunCodeReview = false;
                tooltip = localize('sessions.runCodeReview.tooltip.limitReached', "Maximum of {0} code reviews reached for this session version.", MAX_CODE_REVIEWS_PER_SESSION_VERSION);
                icon = Codicon.codeReview;
            }
            else if (reviewState.kind === "result" /* CodeReviewStateKind.Result */ && reviewState.version === version) {
                canRunCodeReview = true;
                tooltip = reviewState.didProduceComments
                    ? localize('sessions.runCodeReview.tooltip.runAgain', "Run another code review.")
                    : localize('sessions.runCodeReview.tooltip.noCommentsRunAgain', "Previous code review produced no comments. Run code review again.");
                icon = reviewState.didProduceComments ? Codicon.comment : Codicon.codeReview;
            }
            canRunCodeReviewContext.set(canRunCodeReview);
            this._actionRegistration.value = registerSessionCodeReviewAction(tooltip, icon);
        }));
    }
};
CodeReviewToolbarContribution = __decorate([
    __param(0, IContextKeyService),
    __param(1, ISessionsManagementService),
    __param(2, ICodeReviewService)
], CodeReviewToolbarContribution);
registerWorkbenchContribution2(CodeReviewToolbarContribution.ID, CodeReviewToolbarContribution, 3 /* WorkbenchPhase.AfterRestored */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29kZVJldmlldy5jb250cmlidXRpb25zLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvc2Vzc2lvbnMvY29udHJpYi9jb2RlUmV2aWV3L2Jyb3dzZXIvY29kZVJldmlldy5jb250cmlidXRpb25zLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM5RCxPQUFPLEVBQUUsVUFBVSxFQUFFLGlCQUFpQixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDckYsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNyRCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDOUMsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLEVBQUUsZUFBZSxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDbEcsT0FBTyxFQUFFLGNBQWMsRUFBRSxrQkFBa0IsRUFBRSxhQUFhLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUN6SCxPQUFPLEVBQXFCLGlCQUFpQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFFL0csT0FBTyxFQUEwQiw4QkFBOEIsRUFBa0IsTUFBTSwrQ0FBK0MsQ0FBQztBQUN2SSxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUN0RixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sc0VBQXNFLENBQUM7QUFDdkcsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLG1FQUFtRSxDQUFDO0FBQ2xHLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBRWpHLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLHFEQUFxRCxDQUFD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