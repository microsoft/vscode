/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';
import type { IAgent } from '../common/agent.js';
import type { IAgentSessionSearchMatch, IAgentSessionSearchResult } from '../common/agentHostSessionSearch.js';
import type { ISessionDataService } from '../common/sessionDataService.js';
import { ChatOriginKind, isSubagentChatUri, parseRequiredSessionUriFromChatUri, type ChatOrigin } from '../common/state/sessionState.js';
import { createAgentChatContext } from './agentChatContext.js';
import type { AgentHostStateManager } from './agentHostStateManager.js';

interface ISearchableChat {
	readonly uri: string;
	readonly providerData?: string;
	readonly origin?: ChatOrigin;
}

/** Routes a persisted catalog to its provider without subscribing to or materializing chats. */
export async function searchSessionChats(session: URI, chats: readonly ISearchableChat[], query: string, provider: IAgent, stateManager: AgentHostStateManager, sessionDataService: ISessionDataService): Promise<IAgentSessionSearchResult> {
	if (!provider.searchChatHistory) {
		throw new Error('This provider does not support persisted conversation search');
	}
	const matches: IAgentSessionSearchResult['matches'] = [];
	let hasMore = false;
	for (const entry of chats) {
		if (entry.origin?.kind === ChatOriginKind.Tool || isSubagentChatUri(entry.uri)) {
			continue;
		}
		const chat = URI.parse(entry.uri);
		if (parseRequiredSessionUriFromChatUri(chat) !== session.toString()) {
			throw new Error('Persisted search chat does not belong to its session');
		}
		const context = { ...createAgentChatContext(stateManager, session, chat), ...(entry.origin ? { origin: entry.origin } : {}) };
		const result = await provider.searchChatHistory(chat, context, entry.providerData, query);
		const remaining = 100 - matches.length;
		matches.push(...result.matches.slice(0, remaining).map(match => ({ ...match, chat: entry.uri })));
		// Semantic retrieval needs every eligible chat refreshed, even after the lexical result cap.
		hasMore ||= result.hasMore || result.matches.length > remaining;
	}
	return { matches: await remapSessionSearchMatches(session, matches, stateManager, sessionDataService), hasMore };
}

export async function remapSessionSearchMatches<T extends IAgentSessionSearchMatch>(session: URI, matches: readonly T[], stateManager: AgentHostStateManager, sessionDataService: ISessionDataService): Promise<T[]> {
	const mappings = new Map<string, Map<string, string>>();
	for (const chatUri of new Set(matches.map(match => match.chat))) {
		const chat = URI.parse(chatUri);
		const context = createAgentChatContext(stateManager, session, chat);
		const turnIds = new Map<string, string>();
		const liveChat = stateManager.getChatState(chatUri);
		const liveTurnIds = liveChat?.turns.map(turn => turn.id) ?? [];
		if (liveChat?.activeTurn) {
			liveTurnIds.push(liveChat.activeTurn.id);
		}
		if (liveTurnIds.length) {
			const ref = await sessionDataService.tryOpenDatabase(context.resource);
			if (ref) {
				try {
					for (const turnId of liveTurnIds) {
						const eventId = await ref.object.getTurnEventId(turnId);
						if (eventId) {
							turnIds.set(eventId, turnId);
						}
					}
				} finally {
					ref.dispose();
				}
			}
		}
		mappings.set(chatUri, turnIds);
	}
	return matches.map(match => ({ ...match, turnId: mappings.get(match.chat)?.get(match.turnId) ?? match.turnId }));
}
