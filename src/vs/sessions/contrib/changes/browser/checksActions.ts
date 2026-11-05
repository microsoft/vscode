/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { localize2 } from '../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { constObservable } from '../../../../base/common/observable.js';
import { bindContextKey } from '../../../../platform/observable/common/platformObservableUtils.js';
import { IsSessionsWindowContext } from '../../../../workbench/common/contextkeys.js';
import { IChatWidgetService } from '../../../../workbench/contrib/chat/browser/chat.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { CHAT_CATEGORY } from '../../../../workbench/contrib/chat/browser/actions/chatActions.js';
import { IGitHubService, IGitHubSessionPullRequestObservables } from '../../../../workbench/contrib/sessions/browser/github/githubService.js';
import { GitHubPullRequestCIModel } from '../../../../workbench/contrib/sessions/browser/github/models/githubPullRequestCIModel.js';
import { SessionIsActiveContext } from '../../../../workbench/contrib/sessions/common/contextkeys.js';
import { resolveSessionCommandTarget } from '../../../../workbench/contrib/sessions/browser/sessionCommandTarget.js';
import { whenChatWidgetForSession } from '../../chat/browser/chatWidgetUtils.js';
import { submitFixCIChecks } from './fixCIChecks.js';

export const hasActiveSessionFailedCIChecks = new RawContextKey<boolean>('sessions.hasActiveSessionFailedCIChecks', false);

/**
 * True when the user has already requested a CI fix for the active session's
 * current PR head commit. Used to hide the "Fix Checks" action until a new
 * commit lands on the PR.
 */
export const activeSessionCIFixRequested = new RawContextKey<boolean>('sessions.activeSessionCIFixRequested', false);

/** Command that sends the `fix-ci` prompt for the active session's failed checks. */
export const FIX_CI_CHECKS_COMMAND_ID = 'sessions.action.fixCIChecks';

/**
 * Binds `hasActiveSessionFailedCIChecks` (a failed check that counts on the pull
 * request of the session; see {@link GitHubPullRequestCIModel.requiredChecks}) and
 * `activeSessionCIFixRequested` on the given context key service.
 */
export function bindSessionCIChecksContextKeys(pullRequest: Pick<IGitHubSessionPullRequestObservables, 'pullRequestCIObs'>, contextKeyService: IContextKeyService): IDisposable {
	const store = new DisposableStore();
	store.add(bindContextKey(hasActiveSessionFailedCIChecks, contextKeyService, reader => {
		const ciModel = pullRequest.pullRequestCIObs.read(reader);
		if (!ciModel) {
			return false;
		}
		return (ciModel.requiredChecks.read(reader)?.failed.length ?? 0) > 0;
	}));
	store.add(bindContextKey(activeSessionCIFixRequested, contextKeyService, reader => {
		const ciModel = pullRequest.pullRequestCIObs.read(reader);
		if (!ciModel) {
			return false;
		}
		return ciModel.fixRequested.read(reader);
	}));
	return store;
}

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
				when: ContextKeyExpr.and(IsSessionsWindowContext, hasActiveSessionFailedCIChecks, activeSessionCIFixRequested.negate()),
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
