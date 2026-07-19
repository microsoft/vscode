/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { URI } from '../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ActiveEditorContext, IsAuxiliaryWindowContext, IsSessionsWindowContext, IsTopRightEditorGroupContext } from '../../../../workbench/common/contextkeys.js';
import { IsPhoneLayoutContext, SessionHasChangesContext, SessionWorkspaceIsVirtualContext, SessionProviderIdContext, SinglePaneLayoutEnabledContext } from '../../../common/contextkeys.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { CHAT_CATEGORY } from '../../../../workbench/contrib/chat/browser/actions/chatActions.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { CodeReviewService, ICodeReviewService } from './codeReviewService.js';
import { IChatWidgetService } from '../../../../workbench/contrib/chat/browser/chat.js';
import { ANY_AGENT_HOST_PROVIDER_RE } from '../../../common/agentHostSessionsProvider.js';
import { Menus } from '../../../browser/menus.js';
import { SessionChangesEditorInput } from '../../changes/browser/sessionChangesEditorInput.js';

registerSingleton(ICodeReviewService, CodeReviewService, InstantiationType.Delayed);

const CODE_REVIEW_QUERY = '/code-review';

const singlePaneDetailPanel = SinglePaneLayoutEnabledContext;

// Code review is shown next to the diff-stats action in the single-pane Changes
// editor header, so it is only contributed to the classic changes button bar
// when single-pane is off.
const codeReviewChangesToolbarWhen = ContextKeyExpr.and(
	IsSessionsWindowContext,
	SessionWorkspaceIsVirtualContext.toNegated(),
	IsPhoneLayoutContext.negate(),
	ContextKeyExpr.regex(SessionProviderIdContext.key, ANY_AGENT_HOST_PROVIDER_RE),
	singlePaneDetailPanel.negate(),
);

// Code review in the single-pane Changes editor header: on the left
// (SessionsEditorHeaderPrimary), in its own group right after the diff-stats
// action (separated by a divider), whether the editor area is visible or
// collapsed.
class RunSessionCodeReviewAction extends Action2 {

	static readonly ID = 'sessions.codeReview.run';

	constructor() {
		super({
			id: RunSessionCodeReviewAction.ID,
			title: localize2('sessions.runCodeReview', "Run Code Review"),
			tooltip: localize('sessions.runCodeReview.tooltip', "Run Code Review"),
			category: CHAT_CATEGORY,
			icon: Codicon.codeReview,
			precondition: ChatContextKeys.hasAgentSessionChanges,
			menu: [
				{
					id: MenuId.AgentsChangesToolbar,
					group: 'navigation',
					order: 7,
					when: codeReviewChangesToolbarWhen,
				},
				{
					// A separate group (rather than 'navigation', which holds the Branch
					// Changes picker + diff-stats) so a separator renders before it.
					id: Menus.SessionsEditorHeaderPrimary,
					group: '1_codeReview',
					order: 1,
					when: ContextKeyExpr.and(
						IsSessionsWindowContext,
						ActiveEditorContext.isEqualTo(SessionChangesEditorInput.EDITOR_ID),
						singlePaneDetailPanel,
						IsAuxiliaryWindowContext.toNegated(),
						IsTopRightEditorGroupContext,
						SessionWorkspaceIsVirtualContext.toNegated(),
						SessionHasChangesContext,
					),
				},
			],
		});
	}

	override async run(accessor: ServicesAccessor, sessionResource?: URI): Promise<void> {
		const sessionManagementService = accessor.get(ISessionsManagementService);
		const sessionsService = accessor.get(ISessionsService);
		const chatWidgetService = accessor.get(IChatWidgetService);

		const resource = URI.isUri(sessionResource)
			? sessionResource
			: sessionsService.activeSession.get()?.resource;
		if (!resource) {
			return;
		}

		const session = sessionManagementService.getSession(resource);
		if (!session) {
			return;
		}

		if (session.capabilities.get().supportsMultipleChats) {
			await sessionManagementService.sendNewChatRequest(session, { query: CODE_REVIEW_QUERY });
		} else {
			chatWidgetService.getWidgetBySessionResource(session.resource)?.acceptInput(CODE_REVIEW_QUERY);
		}
	}
}

registerAction2(RunSessionCodeReviewAction);
