/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { autorun, observableSignalFromEvent } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { IAgentHostConnectionsService } from '../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { createChatRequestHistoryChatMatcher, getChatRequestHistoryLinkTargetOf, IChatRequestHistoryEntry, IChatRequestHistoryService, retargetChatRequestHistoryLink } from '../../../../workbench/contrib/chat/common/requestHistory/chatRequestHistory.js';
import { ISessionsManagementService } from '../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { IWorkbenchEnvironmentService } from '../../../../workbench/services/environment/common/environmentService.js';
import { ISession } from '../../../../workbench/services/sessions/common/session.js';

/**
 * Keeps the request history in step with the sessions of the Agents window: the requests of a deleted session or chat
 * are forgotten, and those of a chat that moves to another session, or whose session is replaced, follow it, so their
 * links keep opening the chat. Entries match by the chat resource they were recorded in, or by the chat their link
 * opens for entries another window recorded.
 */
export class ChatRequestHistorySessionsContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.chatRequestHistorySessions';

	constructor(
		@ISessionsManagementService sessionsManagementService: ISessionsManagementService,
		@IChatRequestHistoryService private readonly _history: IChatRequestHistoryService,
		@IAgentHostConnectionsService private readonly _connectionsService: IAgentHostConnectionsService,
		@IWorkbenchEnvironmentService private readonly _environmentService: IWorkbenchEnvironmentService,
	) {
		super();
		this._register(sessionsManagementService.onDidDeleteSession(session => this._history.remove(this._matcher(session.resource, 'session'))));
		this._register(sessionsManagementService.onDidDeleteChat(({ chatResource }) => this._history.remove(this._matcher(chatResource, 'chat'))));
		this._register(sessionsManagementService.onDidMoveChat(({ from, to }) => this._moveChats(new ResourceMap<URI>([[from.chat, to.chat]]))));
		this._register(sessionsManagementService.onDidReplaceSession(({ from, to, chats }) => this._replaceSession(from, to, chats)));

		// Keep each entry's title snapshot as the Sessions list shows its chat, so results stay readable offline.
		const sessionsChanged = observableSignalFromEvent(this, sessionsManagementService.onDidChangeSessions);
		this._register(autorun(reader => {
			sessionsChanged.read(reader);
			const recorded = new Set(this._history.entries.read(reader).map(entry => entry.chatResource));
			const titles = new Map<string, string>();
			for (const session of sessionsManagementService.getSessions()) {
				const mainChat = session.mainChat.read(reader);
				for (const chat of session.chats.read(reader)) {
					const key = chat.resource.toString();
					if (recorded.has(key)) {
						titles.set(key, key === mainChat.resource.toString() ? session.title.read(reader) : chat.title.read(reader));
					}
				}
			}
			if (titles.size) {
				this._history.update(entry => {
					const title = titles.get(entry.chatResource);
					return title ? { title } : undefined;
				});
			}
		}));
	}

	/** Moves the entries of each chat that `moves` maps to its new resource. */
	private _moveChats(moves: ResourceMap<URI>): void {
		const sources = [...moves].map(([from, to]) => ({ to, matches: this._matcher(from, 'chat'), toTarget: getChatRequestHistoryLinkTargetOf(to, this._connectionsService) }));
		this._history.update(entry => {
			const move = sources.find(({ matches }) => matches(entry));
			return move && {
				chatResource: move.to.toString(),
				...(move.toTarget ? { link: retargetChatRequestHistoryLink(entry.link, move.toTarget) } : {}),
			};
		});
	}

	private _replaceSession(from: ISession, to: ISession, chats: ResourceMap<URI> | undefined): void {
		const moves = new ResourceMap<URI>();
		const sessionKey = from.resource.with({ fragment: '' }).toString();
		for (const entry of this._history.entries.get()) {
			const chat = URI.parse(entry.chatResource);
			if (chat.with({ fragment: '' }).toString() === sessionKey) {
				moves.set(chat, chats?.get(chat) ?? to.resource.with({ fragment: chat.fragment }));
			}
		}
		if (moves.size) {
			this._moveChats(moves);
		}
	}

	private _matcher(chatResource: URI, scope: 'chat' | 'session'): (entry: IChatRequestHistoryEntry) => boolean {
		return createChatRequestHistoryChatMatcher(chatResource, scope, this._connectionsService, this._environmentService.remoteAuthority);
	}
}
