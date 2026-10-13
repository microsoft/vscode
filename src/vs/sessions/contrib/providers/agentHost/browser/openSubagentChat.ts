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
import { IOpenSubagentChatContext, OpenSubagentChatActionViewItem, shouldShowSubagentModel, subagentChatOpenerRegistry } from '../../../../../workbench/contrib/chat/browser/widget/chatContentParts/chatSubagentOpenChat.js';
import { fillSessionChatDragData } from '../../../../browser/dnd.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { isAgentHostProvider } from '../../../../common/agentHostSessionsProvider.js';
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

/** The subagent chat and its spawning chat; the subagent belongs to the session that lists the spawning chat. */
type SubagentChatTarget = Pick<IOpenSubagentChatContext, 'chatResource' | 'parentSessionResource'>;

/** Maps a session's chat to the backend chat the host recorded for it. */
type BackendChatResolver = (session: IActiveSession, chat: IChat) => URI | undefined;

function ownerSession(sessions: readonly IActiveSession[], target: SubagentChatTarget, reader: IReader | undefined): IActiveSession | undefined {
	const parent = target.parentSessionResource;
	if (parent) {
		// A client chat resource is its session resource plus a chat fragment.
		const parentSession = URI.parse(parent).with({ fragment: '' }).toString();
		return sessions.find(session => session.resource.toString() === parentSession || session.chats.read(reader).some(chat => chat.resource.toString() === parent));
	}
	const legacyParentPath = parseSubagentSessionUri(target.chatResource)?.parentSession.path;
	return legacyParentPath === undefined ? undefined : sessions.find(session => session.resource.path === legacyParentPath);
}

function findSubagentChat(sessionsService: ISessionsService, backendChatOf: BackendChatResolver, target: SubagentChatTarget, reader?: IReader): { readonly session: IActiveSession; readonly chat: IChat } | undefined {
	const resource = target.chatResource;
	const chatId = chatIdFromResource(resource);
	const allSessions = [sessionsService.activeSession.read(reader), ...sessionsService.visibleSessions.read(reader)]
		.filter((session): session is IActiveSession => !!session);
	const owner = ownerSession(allSessions, target, reader);
	const candidates = owner ? [owner] : allSessions;
	for (const session of candidates) {
		const chat = session.chats.read(reader).find(candidate => backendChatOf(session, candidate)?.toString() === resource);
		if (chat) {
			return { session, chat };
		}
	}
	for (const session of candidates) {
		const chat = session.chats.read(reader).find(candidate => matchesResource(candidate, resource, chatId));
		if (chat) {
			return { session, chat };
		}
	}
	return undefined;
}

export class OpenSubagentChatActionViewItemContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.openSubagentChatActionViewItem';

	constructor(
		@IActionViewItemService actionViewItemService: IActionViewItemService,
		@ISessionsService sessionsService: ISessionsService,
		@ISessionsProvidersService sessionsProvidersService: ISessionsProvidersService,
		@ILogService logService: ILogService,
	) {
		super();
		const backendChatOf: BackendChatResolver = (session, chat) => {
			const provider = sessionsProvidersService.getProvider(session.providerId);
			return provider && isAgentHostProvider(provider) ? provider.getBackendChatResource(chat.resource) : undefined;
		};
		this._register(subagentChatOpenerRegistry.register({
			open: async context => {
				const resource = context.chatResource;
				const match = findSubagentChat(sessionsService, backendChatOf, context);
				if (match) {
					await sessionsService.openChatToSide(match.session, match.chat.resource, context.parentSessionResource
						? { referenceChatResource: URI.parse(context.parentSessionResource) }
						: undefined);
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
			const viewItem = instantiationService.createInstance(OpenSubagentChatActionViewItem, undefined, action, { ...options, draggable: true }, false);
			viewItem.trackEnabled((context, update) => autorun(reader => update(!!findSubagentChat(sessionsService, backendChatOf, context, reader))));
			viewItem.setDragDataProvider((context, event) => {
				const match = findSubagentChat(sessionsService, backendChatOf, context);
				if (!match || !event.dataTransfer) {
					return false;
				}
				fillSessionChatDragData(event, match.session.sessionId, match.chat.resource);
				event.dataTransfer.effectAllowed = 'move';
				return true;
			});
			return viewItem;
		}, onDidRegister.event));
		onDidRegister.fire();
	}
}

registerWorkbenchContribution2(OpenSubagentChatActionViewItemContribution.ID, OpenSubagentChatActionViewItemContribution, WorkbenchPhase.BlockStartup);
