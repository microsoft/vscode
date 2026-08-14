/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { autorun, IReader } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { IActionViewItemService } from '../../../../../platform/actions/browser/actionViewItemService.js';
import { MenuId, MenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { parseChatUri, parseSubagentSessionUri } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../workbench/common/contributions.js';
import { CHAT_OPEN_AGENT_HOST_CHAT_COMMAND_ID } from '../../../../../workbench/contrib/chat/common/constants.js';
import { OpenSubagentChatActionViewItem, shouldShowSubagentModel, subagentChatOpenerRegistry } from '../../../../../workbench/contrib/chat/browser/widget/chatContentParts/chatSubagentOpenChat.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISessionsPartService } from '../../../../services/sessions/browser/sessionsPartService.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { IChat } from '../../../../services/sessions/common/session.js';

export { OpenSubagentChatActionViewItem, shouldShowSubagentModel };

function chatIdFromResource(resource: string): string | undefined {
	const fromChatUri = parseChatUri(resource)?.chatId;
	if (fromChatUri) {
		return fromChatUri;
	}
	const fromSessionUri = parseSubagentSessionUri(resource);
	return fromSessionUri ? `subagent/${fromSessionUri.toolCallId}` : undefined;
}

function matchesResource(chat: IChat, resource: string, chatId: string | undefined): boolean {
	return chat.resource.toString() === resource || !!chatId && chat.resource.fragment === chatId;
}

function ownerSessionPath(resource: string): string | undefined {
	const fromChatUri = parseChatUri(resource)?.session;
	if (fromChatUri) {
		try {
			return URI.parse(fromChatUri).path;
		} catch {
			return undefined;
		}
	}
	return parseSubagentSessionUri(resource)?.parentSession.path;
}

function findSubagentChat(sessionsService: ISessionsService, resource: string, reader?: IReader): { readonly session: IActiveSession; readonly chat: IChat } | undefined {
	const chatId = chatIdFromResource(resource);
	const ownerPath = ownerSessionPath(resource);
	const allSessions = [sessionsService.activeSession.read(reader), ...sessionsService.visibleSessions.read(reader)]
		.filter((session): session is IActiveSession => !!session);
	const candidates = ownerPath ? allSessions.filter(session => session.resource.path === ownerPath) : allSessions;
	for (const session of candidates) {
		const chat = session.chats.read(reader).find(candidate => matchesResource(candidate, resource, chatId));
		if (chat) {
			return { session, chat };
		}
	}
	return undefined;
}

class OpenSubagentChatActionViewItemContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.openSubagentChatActionViewItem';

	constructor(
		@IActionViewItemService actionViewItemService: IActionViewItemService,
		@ISessionsService sessionsService: ISessionsService,
		@ISessionsPartService sessionsPartService: ISessionsPartService,
		@ILogService logService: ILogService,
	) {
		super();
		this._register(subagentChatOpenerRegistry.register({
			open: async context => {
				const resource = context.chatResource;
				const match = findSubagentChat(sessionsService, resource);
				if (match) {
					const view = sessionsPartService.getSessionView(match.session.sessionId);
					if (context.toSide && view) {
						await view.openChatToSide(match.chat.resource);
					} else {
						await sessionsService.openChat(match.session, match.chat.resource);
					}
					return true;
				}
				const active = sessionsService.activeSession.get();
				const available = active?.chats.get().map(chat => chat.resource.toString()).join(', ') ?? '(none)';
				logService.warn(`[Sessions] Cannot open subagent chat for resource '${resource}' (chatId='${chatIdFromResource(resource)}'). Available chats: ${available}`);
				return true;
			}
		}));

		const onDidRegister = this._register(new Emitter<void>());
		this._register(actionViewItemService.register(MenuId.ChatSubagentContent, CHAT_OPEN_AGENT_HOST_CHAT_COMMAND_ID, (action, options, instantiationService) => {
			if (!(action instanceof MenuItemAction)) {
				return undefined;
			}
			const viewItem = instantiationService.createInstance(OpenSubagentChatActionViewItem, undefined, action, options, false);
			viewItem.trackEnabled((context, update) => autorun(reader => update(!!findSubagentChat(sessionsService, context.chatResource, reader))));
			return viewItem;
		}, onDidRegister.event));
		onDidRegister.fire();
	}
}

registerWorkbenchContribution2(OpenSubagentChatActionViewItemContribution.ID, OpenSubagentChatActionViewItemContribution, WorkbenchPhase.BlockStartup);
