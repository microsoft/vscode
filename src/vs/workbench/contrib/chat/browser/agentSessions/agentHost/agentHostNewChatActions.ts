/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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
import { ChatSessionPosition, getResourceForNewChatSession, openChatSession } from '../../chatSessions/chatSessions.contribution.js';
import { ChatContextKeys } from '../../../common/actions/chatContextKeys.js';
import { IChatSessionsService, SessionType } from '../../../common/chatSessionsService.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { IAgentHostNewSessionFolderService } from './agentHostNewSessionFolderService.js';
import { getSessionIsolationProperty } from '../../../../../../platform/agentHost/common/sessionConfigProperties.js';
import { IAgentHostUntitledProvisionalSessionService } from './agentHostUntitledProvisionalSessionService.js';

/** The setting that shows the Sessions list, with its chats without a workspace, in the Chat view. */
const SESSIONS_LIST_ENABLED_SETTING = 'chat.viewSessions.sessionsList.enabled';

/** How often a new chat in a worktree prepares its session's configuration, each up to the provisional service's timeout. */
const CONFIGURATION_ATTEMPTS = 3;

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

/** Where a new chat of the local agent host starts. */
export type NewAgentHostChatPlacement = 'worktree' | 'noWorkspace';

/**
 * The resource of a new, not yet shown, chat of the local agent host that starts in `placement`, which it asks for from its
 * first configuration on: before anything shows it, so that it shows and sends so. A new worktree only where the session's
 * configuration, prepared first, offers one; otherwise it reports that and returns `undefined`, rather than a chat that
 * works in the folder.
 */
export async function prepareNewAgentHostChat(
	resource: URI,
	placement: NewAgentHostChatPlacement,
	folderService: IAgentHostNewSessionFolderService,
	provisional: IAgentHostUntitledProvisionalSessionService,
	notificationService: INotificationService,
): Promise<URI | undefined> {
	if (placement === 'noWorkspace') {
		folderService.setNoWorkspace(resource);
		return resource;
	}
	folderService.setNewWorktree(resource);
	for (let attempt = 0; attempt < CONFIGURATION_ATTEMPTS && !provisional.getPreparedSessionConfig(resource); attempt++) {
		try {
			await provisional.prepareSessionConfig(resource);
		} catch (error) {
			onUnexpectedError(error);
		}
	}
	const config = provisional.getPreparedSessionConfig(resource);
	const isolation = config && getSessionIsolationProperty(config.schema);
	if (isolation && (isolation.schema.enum ?? []).includes('worktree') && config.values[isolation.key] === 'worktree') {
		return resource;
	}
	folderService.clear(resource);
	notificationService.warn(config
		? localize('chat.newChatInWorktree.unsupported', "A new chat cannot work in a new worktree of this folder.")
		: localize('chat.newChatInWorktree.notReady', "A new chat in a worktree could not be prepared. Try again, or choose New Worktree in a new chat."));
	return undefined;
}

/** Opens a new chat of the local agent host in the Chat view that starts in `placement`; `undefined` where it cannot. */
async function openLocalAgentHostChat(accessor: ServicesAccessor, placement: NewAgentHostChatPlacement): Promise<URI | undefined> {
	const contribution = accessor.get(IChatSessionsService).getChatSessionContribution(SessionType.AgentHostCopilot);
	const notificationService = accessor.get(INotificationService);
	if (!contribution || !accessor.get(IAgentHostEnablementService).enabled.get()) {
		notificationService.warn(localize('chat.newAgentHostChat.unavailable', "A new chat cannot start here, as the agent host is not available in this window."));
		return undefined;
	}
	const instantiationService = accessor.get(IInstantiationService);
	const openOptions = { type: contribution.type, displayName: contribution.displayName, position: ChatSessionPosition.Sidebar };
	const resource = await prepareNewAgentHostChat(getResourceForNewChatSession(openOptions), placement, accessor.get(IAgentHostNewSessionFolderService), accessor.get(IAgentHostUntitledProvisionalSessionService), notificationService);
	return resource && instantiationService.invokeFunction(accessor => openChatSession(accessor, { ...openOptions, sessionResource: resource }));
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
		return openLocalAgentHostChat(accessor, 'worktree');
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
		return openLocalAgentHostChat(accessor, 'noWorkspace');
	}
}

registerAction2(NewChatInWorktreeAction);
registerAction2(NewChatWithoutWorkspaceAction);
