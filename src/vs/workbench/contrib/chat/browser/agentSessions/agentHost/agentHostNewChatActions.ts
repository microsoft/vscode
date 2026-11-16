/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceTimeout } from '../../../../../../base/common/async.js';
import { Event } from '../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../../../nls.js';
import { onUnexpectedError } from '../../../../../../base/common/errors.js';
import { AGENT_HOST_ENABLED_CONTEXT_KEY, IAgentHostEnablementService } from '../../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IsWebContext } from '../../../../../../platform/contextkey/common/contextkeys.js';
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
import { IAgentHostUntitledProvisionalSessionService } from './agentHostUntitledProvisionalSessionService.js';

/** The setting that shows the Sessions list, with its chats without a workspace, in the Chat view. */
const SESSIONS_LIST_ENABLED_SETTING = 'chat.viewSessions.sessionsList.enabled';

/** How long a new chat waits for its session's configuration, which says whether it can work in a new worktree. */
const CONFIGURATION_TIMEOUT = 10_000;

/**
 * Where the entries apply: a window whose agent host is available, as it is on desktop with AI features on, and that is not
 * remote, whose agent host would be the remote's, nor the Agents window, which starts its sessions itself.
 */
const localAgentHostWhen = ContextKeyExpr.and(
	ChatContextKeys.enabled,
	AGENT_HOST_ENABLED_CONTEXT_KEY,
	IsWebContext.negate(),
	RemoteNameContext.isEqualTo(''),
	IsSessionsWindowContext.negate(),
);

/**
 * Has the new chat of `choices` work in a new worktree of its folder: once its session's configuration, which says whether
 * it can, is prepared, waiting at most `timeout`. Reports when it cannot, rather than leaving a chat that works in the folder.
 */
export async function startInNewWorktree(choices: AgentHostWorktreeFolderChoices, prepare: () => Promise<void>, notificationService: INotificationService, timeout = CONFIGURATION_TIMEOUT): Promise<boolean> {
	if (!choices.canWorkInNewWorktree()) {
		const store = new DisposableStore();
		try {
			const ready = Event.toPromise(Event.filter(choices.onDidChange, () => choices.canWorkInNewWorktree()), store);
			prepare().catch(onUnexpectedError);
			await raceTimeout(ready, timeout);
		} finally {
			store.dispose();
		}
	}
	try {
		if (choices.canWorkInNewWorktree()) {
			await choices.setNewWorktree(true);
		}
	} catch (error) {
		onUnexpectedError(error);
	}
	if (choices.isNewWorktreeSelected()) {
		return true;
	}
	notificationService.warn(localize('chat.newChatInWorktree.failed', "The new chat could not be set to work in a new worktree, so it works in the folder. Choose New Worktree in its folder picker to try again."));
	return false;
}

/** Opens a new chat of the local agent host in the Chat view, and has `choose` set where its session works. */
async function openLocalAgentHostChat(accessor: ServicesAccessor, choose: (choices: AgentHostWorktreeFolderChoices, resource: URI) => Promise<unknown> | void): Promise<URI | undefined> {
	const contribution = accessor.get(IChatSessionsService).getChatSessionContribution(SessionType.AgentHostCopilot);
	const notificationService = accessor.get(INotificationService);
	if (!contribution || !accessor.get(IAgentHostEnablementService).enabled.get()) {
		notificationService.warn(localize('chat.newAgentHostChat.unavailable', "A new chat cannot start here, as the agent host is not available in this window."));
		return undefined;
	}
	const instantiationService = accessor.get(IInstantiationService);
	const resource = await openChatSession(accessor, { type: contribution.type, displayName: contribution.displayName, position: ChatSessionPosition.Sidebar });
	if (!resource) {
		return undefined;
	}
	const choices = instantiationService.createInstance(AgentHostWorktreeFolderChoices, () => resource);
	try {
		await choose(choices, resource);
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
					localAgentHostWhen,
					ContextKeyExpr.equals(`config.${ChatConfiguration.EditorWindowEnableWorktree}`, true),
					WorkbenchStateContext.isEqualTo('folder'),
				),
			}],
		});
	}

	override run(accessor: ServicesAccessor): Promise<URI | undefined> {
		const provisional = accessor.get(IAgentHostUntitledProvisionalSessionService);
		const notificationService = accessor.get(INotificationService);
		return openLocalAgentHostChat(accessor, (choices, resource) => startInNewWorktree(choices, () => provisional.prepareSessionConfig(resource), notificationService));
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
					localAgentHostWhen,
					ContextKeyExpr.equals(`config.${SESSIONS_LIST_ENABLED_SETTING}`, true),
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
