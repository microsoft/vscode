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
import { IsSessionsWindowContext } from '../../../../workbench/common/contextkeys.js';
import { IsPhoneLayoutContext, ActiveSessionWorkspaceIsVirtualContext, ChatSessionProviderIdContext } from '../../../common/contextkeys.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { CHAT_CATEGORY } from '../../../../workbench/contrib/chat/browser/actions/chatActions.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { CodeReviewService, ICodeReviewService } from './codeReviewService.js';
import { IChatWidgetService } from '../../../../workbench/contrib/chat/browser/chat.js';
import { ANY_AGENT_HOST_PROVIDER_RE } from '../../../common/agentHostSessionsProvider.js';

registerSingleton(ICodeReviewService, CodeReviewService, InstantiationType.Delayed);

const CODE_REVIEW_QUERY = '/code-review';

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
					when: ContextKeyExpr.and(
						IsSessionsWindowContext,
						ActiveSessionWorkspaceIsVirtualContext.toNegated(),
						IsPhoneLayoutContext.negate(),
						ContextKeyExpr.regex(ChatSessionProviderIdContext.key, ANY_AGENT_HOST_PROVIDER_RE),
					),
				},
			],
		});
	}

	override async run(accessor: ServicesAccessor, sessionResource?: URI): Promise<void> {
		const sessionManagementService = accessor.get(ISessionsManagementService);
		const chatWidgetService = accessor.get(IChatWidgetService);

		const resource = URI.isUri(sessionResource)
			? sessionResource
			: sessionManagementService.activeSession.get()?.resource;
		if (!resource) {
			return;
		}

		const session = sessionManagementService.getSession(resource);
		if (!session) {
			return;
		}

		if (session.capabilities.supportsMultipleChats) {
			await sessionManagementService.sendNewChatRequest(session, { query: CODE_REVIEW_QUERY });
		} else {
			chatWidgetService.getWidgetBySessionResource(session.resource)?.acceptInput(CODE_REVIEW_QUERY);
		}
	}
}

registerAction2(RunSessionCodeReviewAction);
