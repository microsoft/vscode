/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { localize2 } from '../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { constObservable } from '../../../../base/common/observable.js';
import { IsSessionsWindowContext } from '../../../../workbench/common/contextkeys.js';
import { IChatWidgetService } from '../../../../workbench/contrib/chat/browser/chat.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { CHAT_CATEGORY } from '../../../../workbench/contrib/chat/browser/actions/chatActions.js';
import { IGitHubService } from '../../../../workbench/contrib/sessions/browser/github/githubService.js';
import { SessionArtifactIntegrationsEnabledContext, SessionIsActiveContext } from '../../../../workbench/contrib/sessions/common/contextkeys.js';
import { resolveSessionCommandTarget } from '../../../../workbench/contrib/sessions/browser/sessionCommandTarget.js';
import { whenChatWidgetForSession } from '../../../../workbench/contrib/sessions/browser/chat/chatWidgetUtils.js';
import { submitFixCIChecks, hasActiveSessionFailedCIChecks, activeSessionCIFixRequested } from '../../../../workbench/contrib/sessions/browser/fixCIChecks.js';

/** Command that sends the `fix-ci` prompt for the active session's failed checks. */
export const FIX_CI_CHECKS_COMMAND_ID = 'sessions.action.fixCIChecks';

class FixCIChecksAction extends Action2 {

	static readonly ID = FIX_CI_CHECKS_COMMAND_ID;

	constructor() {
		super({
			id: FixCIChecksAction.ID,
			title: localize2('fixChecks', 'Fix Checks'),
			icon: Codicon.lightbulbAutofix,
			category: CHAT_CATEGORY,
			precondition: ContextKeyExpr.and(ChatContextKeys.enabled, hasActiveSessionFailedCIChecks, activeSessionCIFixRequested.negate(), SessionIsActiveContext.negate()),
			menu: [{
				id: MenuId.AgentsChangesPrimaryActionSubMenu,
				group: '5_checks',
				order: 4,
				when: ContextKeyExpr.and(IsSessionsWindowContext, hasActiveSessionFailedCIChecks, activeSessionCIFixRequested.negate(), SessionArtifactIntegrationsEnabledContext.negate()),
			}],
		});
	}

	override async run(accessor: ServicesAccessor, sessionArg?: unknown): Promise<void> {
		const gitHubService = accessor.get(IGitHubService);
		const chatWidgetService = accessor.get(IChatWidgetService);
		const logService = accessor.get(ILogService);

		const target = resolveSessionCommandTarget(accessor, [sessionArg]);
		const session = target?.session;
		if (!session) {
			return;
		}

		const ciModel = gitHubService.getSessionPullRequest(constObservable(session)).pullRequestCIObs.get();
		if (!ciModel) {
			return;
		}

		// The widget of the chat the session shows, which is the chat its model is for: for a chat other than the main one,
		// not the widget of the main chat, which might show in another window or not at all.
		const chatResource = (target.chat ?? session.mainChat.get()).resource;
		const chatWidget = await whenChatWidgetForSession(chatWidgetService, chatResource);
		if (!chatWidget) {
			logService.error('[FixCIChecks] Cannot fix CI checks: no chat widget found for chat', chatResource.toString());
			return;
		}

		await submitFixCIChecks(ciModel, chatWidget);
	}
}
registerAction2(FixCIChecksAction);
