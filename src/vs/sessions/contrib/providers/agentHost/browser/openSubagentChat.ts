/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { autorun, derived, IReader } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { IActionViewItemService } from '../../../../../platform/actions/browser/actionViewItemService.js';
import { MenuId, MenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { getAgentHostChatId, isAhpChatChannel, parseSubagentSessionUri } from '../../../../../platform/agentHost/common/state/sessionState.js';
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
	if (isAhpChatChannel(resource)) {
		return getAgentHostChatId(resource);
	}
	const fromSessionUri = parseSubagentSessionUri(resource);
	return fromSessionUri ? `subagent/${fromSessionUri.toolCallId}` : undefined;
}

/** The subagent chat and its spawning chat; the subagent belongs to the session that lists the spawning chat. */
type SubagentChatTarget = Pick<IOpenSubagentChatContext, 'chatResource' | 'parentSessionResource'>;

/** Maps a session's chat to the backend chat the host recorded for it. */
type BackendChatResolver = (session: IActiveSession, chat: IChat) => URI | undefined;

interface ISubagentChatMatch {
	readonly session: IActiveSession;
	readonly chat: IChat;
	readonly order: number;
}

class SubagentChatIndex {
	readonly byBackendResource = new ResourceMap<ISubagentChatMatch>();
	readonly byClientResource = new ResourceMap<ISubagentChatMatch>();
	private readonly byChatId = new Map<string, ISubagentChatMatch>();

	constructor(readonly order: number) { }

	add(match: ISubagentChatMatch, backendResource: URI | undefined): void {
		if (backendResource && !this.byBackendResource.has(backendResource)) {
			this.byBackendResource.set(backendResource, match);
		}
		if (!this.byClientResource.has(match.chat.resource)) {
			this.byClientResource.set(match.chat.resource, match);
		}
		if (!this.byChatId.has(match.chat.resource.fragment)) {
			this.byChatId.set(match.chat.resource.fragment, match);
		}
	}

	find(resource: URI, chatId: string | undefined): ISubagentChatMatch | undefined {
		const backend = this.byBackendResource.get(resource);
		if (backend) {
			return backend;
		}
		const exact = this.byClientResource.get(resource);
		const byId = chatId ? this.byChatId.get(chatId) : undefined;
		return exact && (!byId || exact.order < byId.order) ? exact : byId;
	}
}

function createSubagentChatLookup(sessionsService: ISessionsService, backendChatOf: BackendChatResolver, reader: IReader): (target: SubagentChatTarget) => ISubagentChatMatch | undefined {
	const allChats = new SubagentChatIndex(0);
	const bySession = new ResourceMap<SubagentChatIndex>();
	const byLegacyPath = new Map<string, SubagentChatIndex>();
	const sessions = [sessionsService.activeSession.read(reader), ...sessionsService.visibleSessions.read(reader)];
	let order = 0;
	for (const session of sessions) {
		if (!session || bySession.has(session.resource)) {
			continue;
		}
		const index = new SubagentChatIndex(order);
		bySession.set(session.resource, index);
		if (!byLegacyPath.has(session.resource.path)) {
			byLegacyPath.set(session.resource.path, index);
		}
		for (const chat of session.chats.read(reader)) {
			const match = { session, chat, order: order++ };
			const backend = backendChatOf(session, chat);
			index.add(match, backend);
			allChats.add(match, backend);
		}
	}

	return target => {
		const resource = URI.parse(target.chatResource);
		let owner: SubagentChatIndex | undefined;
		if (target.parentSessionResource) {
			const parent = URI.parse(target.parentSessionResource);
			const sessionOwner = bySession.get(parent.with({ fragment: '' }));
			const parentChat = allChats.byClientResource.get(parent);
			const chatOwner = parentChat && bySession.get(parentChat.session.resource);
			owner = sessionOwner && (!chatOwner || sessionOwner.order <= chatOwner.order) ? sessionOwner : chatOwner;
		} else {
			const legacyPath = parseSubagentSessionUri(target.chatResource)?.parentSession.path;
			owner = legacyPath === undefined ? undefined : byLegacyPath.get(legacyPath);
		}
		return (owner ?? allChats).find(resource, chatIdFromResource(target.chatResource));
	};
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
		const findSubagentChat = derived(this, reader => createSubagentChatLookup(sessionsService, backendChatOf, reader));
		this._register(subagentChatOpenerRegistry.register({
			open: async context => {
				const resource = context.chatResource;
				const match = findSubagentChat.get()(context);
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
			viewItem.trackEnabled((context, update) => autorun(reader => update(!!findSubagentChat.read(reader)(context))));
			viewItem.setDragDataProvider((context, event) => {
				const match = findSubagentChat.get()(context);
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
