/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const MAX_SESSION_SEARCH_QUERY_LENGTH = 512;
export const AGENT_CHAT_SEARCH_MAX_RESULTS = 20;

export interface IAgentChatSearchMatch {
	readonly turnId: string;
	readonly role: 'user' | 'assistant';
	readonly snippet: string;
}

export interface IAgentSessionSearchMatch extends IAgentChatSearchMatch {
	readonly chat: string;
}

export interface IAgentChatSearchResult {
	readonly matches: IAgentChatSearchMatch[];
	readonly hasMore: boolean;
}

export interface IAgentSessionSearchResult {
	readonly matches: IAgentSessionSearchMatch[];
	readonly hasMore: boolean;
}

export function validateSessionSearchQuery(query: string): void {
	if (query.length > MAX_SESSION_SEARCH_QUERY_LENGTH) {
		throw new Error('Conversation search query exceeds the maximum length');
	}
	if (!query.trim()) {
		throw new Error('Conversation search query must not be empty');
	}
}

/** Search uses literal Unicode words joined with AND; punctuation and quotes are separators, not query syntax. */
export function getAgentSessionSearchTerms(query: string): string[] {
	validateSessionSearchQuery(query);
	return query.match(/[\p{L}\p{N}\p{M}\p{Co}]+/gu) ?? [];
}
