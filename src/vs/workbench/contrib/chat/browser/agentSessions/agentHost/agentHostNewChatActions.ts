/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceTimeout } from '../../../../../../base/common/async.js';
import { Event } from '../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize2 } from '../../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IsSessionsWindowContext, RemoteNameContext, WorkbenchStateContext } from '../../../../../common/contextkeys.js';
import { CHAT_CATEGORY } from '../../actions/chatActions.js';
import { ChatSessionPosition, openChatSession } from '../../chatSessions/chatSessions.contribution.js';
import { ChatContextKeys } from '../../../common/actions/chatContextKeys.js';
import { IChatSessionsService, SessionType } from '../../../common/chatSessionsService.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { AgentHostWorktreeFolderChoices } from './agentHostWorktreeFolderChoices.js';

/** The setting that shows the Sessions list, with its chats without a workspace, in the Chat view. */
const SESSIONS_LIST_ENABLED_SETTING = 'chat.viewSessions.sessionsList.enabled';

/** How long a new chat waits for its session's configuration, which says whether it can work in a new worktree. */
const CONFIGURATION_TIMEOUT = 10_000;

/** Opens a new chat of the local agent host in the Chat view, and has `choose` set where its session works. */
async function openLocalAgentHostChat(accessor: ServicesAccessor, choose: (choices: AgentHostWorktreeFolderChoices) => Promise<void> | void): Promise<URI | undefined> {
	const contribution = accessor.get(IChatSessionsService).getChatSessionContribution(SessionType.AgentHostCopilot);
	if (!contribution) {
		return undefined;
	}
	const instantiationService = accessor.get(IInstantiationService);
	const resource = await openChatSession(accessor, { type: contribution.type, displayName: contribution.displayName, position: ChatSessionPosition.Sidebar });
	if (!resource) {
		return undefined;
	}
	const choices = instantiationService.createInstance(AgentHostWorktreeFolderChoices, () => resource);
	try {
		await choose(choices);
	} finally {
		choices.dispose();
	}
	return resource;
}

export class NewChatInWorktreeAction extends Action2 {
	static readonly ID = 'workbench.action.chat.newChatInWorktree';
	constructor() {
		super({
			id: NewChatInWorktreeAction.ID,
			title: localize2('chat.newChatInWorktree', "New Chat in Worktree"),
			category: CHAT_CATEGORY,
			f1: false,
			precondition: ChatContextKeys.enabled,
			menu: [{
				id: MenuId.ChatNewMenu,
				group: '1_open',
				order: 2,
				// With worktree support, in a window with a single local folder
				when: ContextKeyExpr.and(
					ChatContextKeys.enabled,
					ContextKeyExpr.equals(`config.${ChatConfiguration.EditorWindowEnableWorktree}`, true),
					WorkbenchStateContext.isEqualTo('folder'),
					RemoteNameContext.isEqualTo(''),
					IsSessionsWindowContext.negate(),
				),
			}],
		});
	}

	override run(accessor: ServicesAccessor): Promise<URI | undefined> {
		return openLocalAgentHostChat(accessor, async choices => {
			// Its configuration, which says it can work in a new worktree, comes once the new chat's session is prepared
			if (!choices.canWorkInNewWorktree()) {
				const store = new DisposableStore();
				try {
					await raceTimeout(Event.toPromise(Event.filter(choices.onDidChange, () => choices.canWorkInNewWorktree()), store), CONFIGURATION_TIMEOUT);
				} finally {
					store.dispose();
				}
			}
			await choices.setNewWorktree(true);
		});
	}
}

export class NewChatWithoutWorkspaceAction extends Action2 {
	static readonly ID = 'workbench.action.chat.newChatWithoutWorkspace';
	constructor() {
		super({
			id: NewChatWithoutWorkspaceAction.ID,
			title: localize2('chat.newChatWithoutWorkspace', "New Chat (No Workspace)"),
			category: CHAT_CATEGORY,
			f1: false,
			precondition: ChatContextKeys.enabled,
			menu: [{
				id: MenuId.ChatNewMenu,
				group: '1_open',
				order: 3,
				// While the Chat view shows the Sessions list, which shows chats without a workspace
				when: ContextKeyExpr.and(
					ChatContextKeys.enabled,
					ContextKeyExpr.equals(`config.${SESSIONS_LIST_ENABLED_SETTING}`, true),
					RemoteNameContext.isEqualTo(''),
					IsSessionsWindowContext.negate(),
				),
			}],
		});
	}

	override run(accessor: ServicesAccessor): Promise<URI | undefined> {
		return openLocalAgentHostChat(accessor, choices => choices.setNoWorkspace());
	}
}

registerAction2(NewChatInWorktreeAction);
registerAction2(NewChatWithoutWorkspaceAction);
