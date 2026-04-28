/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { IsSessionsWindowContext } from '../../../../workbench/common/contextkeys.js';
import { IsPhoneLayoutContext } from '../../../common/contextkeys.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { CHAT_CATEGORY } from '../../../../workbench/contrib/chat/browser/actions/chatActions.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { IAgentFeedbackService } from '../../agentFeedback/browser/agentFeedbackService.js';
import { getSessionEditorComments } from '../../agentFeedback/browser/sessionEditorComments.js';
import { CodeReviewService, CodeReviewStateKind, getCodeReviewFilesFromSessionChanges, getCodeReviewVersion, ICodeReviewService, MAX_CODE_REVIEWS_PER_SESSION_VERSION, PRReviewStateKind } from './codeReviewService.js';
import { CopilotCloudSessionType } from '../../../services/sessions/common/session.js';

registerSingleton(ICodeReviewService, CodeReviewService, InstantiationType.Delayed);

const canRunSessionCodeReviewContextKey = new RawContextKey<boolean>('sessions.canRunCodeReview', true, {
	type: 'boolean',
	description: localize('sessions.canRunCodeReview', "True when a new code review can be started for the active session version."),
});

function registerSessionCodeReviewAction(tooltip: string, icon: ThemeIcon): Disposable {
	class RunSessionCodeReviewAction extends Action2 {
		static readonly ID = 'sessions.codeReview.run';

		constructor() {
			super({
				id: RunSessionCodeReviewAction.ID,
				title: localize('sessions.runCodeReview', "Run Code Review"),
				tooltip,
				category: CHAT_CATEGORY,
				icon,
				precondition: ContextKeyExpr.and(
					ChatContextKeys.hasAgentSessionChanges,
					canRunSessionCodeReviewContextKey),
				menu: [
					{
						id: MenuId.ChatEditingSessionChangesToolbar,
						group: 'navigation',
						order: 7,
						when: ContextKeyExpr.and(
							IsSessionsWindowContext,
							ChatContextKeys.agentSessionType.notEqualsTo(CopilotCloudSessionType.id),
							IsPhoneLayoutContext.negate(),
						),
					},
				],
			});
		}

		override async run(accessor: ServicesAccessor, sessionResource?: URI): Promise<void> {
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
			const reviewCount = reviewState.kind !== CodeReviewStateKind.Idle && reviewState.version === version ? reviewState.reviewCount : 0;
			const codeReviewCount = reviewState.kind === CodeReviewStateKind.Result && reviewState.version === version ? reviewState.comments.length : 0;
			const prReviewCount = prReviewState.kind === PRReviewStateKind.Loaded ? prReviewState.comments.length : 0;

			if (codeReviewCount > 0 || prReviewCount > 0) {
				const comments = getSessionEditorComments(
					resource,
					agentFeedbackService.getFeedback(resource),
					reviewState,
					prReviewState,
				);
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

	return registerAction2(RunSessionCodeReviewAction) as Disposable;
}

class CodeReviewToolbarContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.contrib.codeReviewToolbar';

	private readonly _actionRegistration = this._register(new MutableDisposable<Disposable>());

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@ISessionsManagementService private readonly _sessionManagementService: ISessionsManagementService,
		@ICodeReviewService private readonly _codeReviewService: ICodeReviewService,
	) {
		super();

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
			const reviewCount = reviewState.kind !== CodeReviewStateKind.Idle && reviewState.version === version ? reviewState.reviewCount : 0;

			const codeReviewCount = reviewState.kind === CodeReviewStateKind.Result && reviewState.version === version ? reviewState.comments.length : 0;
			const prReviewCount = prReviewState.kind === PRReviewStateKind.Loaded ? prReviewState.comments.length : 0;
			const totalCommentCount = codeReviewCount + prReviewCount;

			let canRunCodeReview = true;
			let tooltip = localize('sessions.runCodeReview.tooltip.default', "Run Code Review");
			let icon = Codicon.codeReview;

			if (reviewState.kind === CodeReviewStateKind.Loading && reviewState.version === version) {
				canRunCodeReview = false;
				tooltip = localize('sessions.runCodeReview.tooltip.loading', "Creating code review...");
				icon = Codicon.commentDraft;
			} else if (totalCommentCount > 0) {
				canRunCodeReview = true;
				icon = Codicon.commentUnresolved;
				tooltip = totalCommentCount === 1
					? localize('sessions.runCodeReview.tooltip.oneUnresolved', "1 review comment unresolved.")
					: localize('sessions.runCodeReview.tooltip.manyUnresolved', "{0} review comments unresolved.", totalCommentCount);
			} else if (reviewCount >= MAX_CODE_REVIEWS_PER_SESSION_VERSION) {
				canRunCodeReview = false;
				tooltip = localize('sessions.runCodeReview.tooltip.limitReached', "Maximum of {0} code reviews reached for this session version.", MAX_CODE_REVIEWS_PER_SESSION_VERSION);
				icon = Codicon.codeReview;
			} else if (reviewState.kind === CodeReviewStateKind.Result && reviewState.version === version) {
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
}

registerWorkbenchContribution2(CodeReviewToolbarContribution.ID, CodeReviewToolbarContribution, WorkbenchPhase.AfterRestored);
