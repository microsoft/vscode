/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, observableFromEvent } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { IsSessionsWindowContext } from '../../../../workbench/common/contextkeys.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { IAgentSessionsService } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsService.js';
import { CHAT_CATEGORY } from '../../../../workbench/contrib/chat/browser/actions/chatActions.js';
import { ISessionsManagementService } from '../../sessions/browser/sessionsManagementService.js';
import { CodeReviewService, CodeReviewStateKind, getCodeReviewFilesFromSessionChanges, getCodeReviewVersion, ICodeReviewService } from './codeReviewService.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { IAgentFeedbackService } from '../../agentFeedback/browser/agentFeedbackService.js';
import { SessionEditorCommentSource, toSessionEditorCommentId } from '../../agentFeedback/browser/sessionEditorComments.js';

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
				precondition: canRunSessionCodeReviewContextKey,
				menu: [
					{
						id: MenuId.ChatEditingSessionChangesToolbar,
						group: 'navigation',
						order: 7,
						when: ContextKeyExpr.and(IsSessionsWindowContext, ChatContextKeys.hasAgentSessionChanges),
					},
				],
			});
		}

		override async run(accessor: ServicesAccessor, sessionResource?: URI): Promise<void> {
			const sessionManagementService = accessor.get(ISessionsManagementService);
			const agentSessionsService = accessor.get(IAgentSessionsService);
			const codeReviewService = accessor.get(ICodeReviewService);
			const agentFeedbackService = accessor.get(IAgentFeedbackService);

			const resource = URI.isUri(sessionResource)
				? sessionResource
				: sessionManagementService.getActiveSession()?.resource;

			if (!resource) {
				return;
			}

			const session = agentSessionsService.getSession(resource);
			if (!(session?.changes instanceof Array) || session.changes.length === 0) {
				return;
			}

			const files = getCodeReviewFilesFromSessionChanges(session.changes);
			const version = getCodeReviewVersion(files);

			// If a review already exists with comments, navigate to the first comment
			const reviewState = codeReviewService.getReviewState(resource).get();
			if (reviewState.kind === CodeReviewStateKind.Result && reviewState.version === version && reviewState.comments.length > 0) {
				const firstComment = reviewState.comments[0];
				const commentId = toSessionEditorCommentId(SessionEditorCommentSource.CodeReview, firstComment.id);
				await agentFeedbackService.revealSessionComment(resource, commentId, firstComment.uri, firstComment.range);
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
		@IAgentSessionsService private readonly _agentSessionsService: IAgentSessionsService,
		@ISessionsManagementService private readonly _sessionManagementService: ISessionsManagementService,
		@ICodeReviewService private readonly _codeReviewService: ICodeReviewService,
	) {
		super();

		const canRunCodeReviewContext = canRunSessionCodeReviewContextKey.bindTo(contextKeyService);
		const sessionsChangedSignal = observableFromEvent(this, this._agentSessionsService.model.onDidChangeSessions, () => undefined);

		this._register(autorun(reader => {
			const activeSession = this._sessionManagementService.activeSession.read(reader);
			sessionsChangedSignal.read(reader);
			this._actionRegistration.clear();

			const sessionResource = activeSession?.resource;
			if (!sessionResource) {
				canRunCodeReviewContext.set(false);
				this._actionRegistration.value = registerSessionCodeReviewAction(localize('sessions.runCodeReview.noSession', "No active session available for code review."), Codicon.codeReview);
				return;
			}

			const session = this._agentSessionsService.getSession(sessionResource);
			if (!(session?.changes instanceof Array) || session.changes.length === 0) {
				canRunCodeReviewContext.set(false);
				this._actionRegistration.value = registerSessionCodeReviewAction(localize('sessions.runCodeReview.noChanges', "No changes available for code review."), Codicon.codeReview);
				return;
			}

			const files = getCodeReviewFilesFromSessionChanges(session.changes);
			const version = getCodeReviewVersion(files);
			const reviewState = this._codeReviewService.getReviewState(sessionResource).read(reader);

			let canRunCodeReview = true;
			let tooltip = localize('sessions.runCodeReview.tooltip.default', "Run Code Review");
			let icon = Codicon.codeReview;

			if (reviewState.kind === CodeReviewStateKind.Loading && reviewState.version === version) {
				canRunCodeReview = false;
				tooltip = localize('sessions.runCodeReview.tooltip.loading', "Creating code review...");
				icon = Codicon.codeReview;
			} else if (reviewState.kind === CodeReviewStateKind.Result && reviewState.version === version) {
				if (reviewState.comments.length === 0) {
					canRunCodeReview = false;
					tooltip = localize('sessions.runCodeReview.tooltip.allResolved', "All review comments have been addressed.");
					icon = Codicon.comment;
				} else {
					canRunCodeReview = true;
					icon = Codicon.commentUnresolved;
					tooltip = reviewState.comments.length === 1
						? localize('sessions.runCodeReview.tooltip.oneUnresolved', "1 review comment unresolved.")
						: localize('sessions.runCodeReview.tooltip.manyUnresolved', "{0} review comments unresolved.", reviewState.comments.length);
				}
			}

			canRunCodeReviewContext.set(canRunCodeReview);
			this._actionRegistration.value = registerSessionCodeReviewAction(tooltip, icon);
		}));
	}
}

registerWorkbenchContribution2(CodeReviewToolbarContribution.ID, CodeReviewToolbarContribution, WorkbenchPhase.AfterRestored);
