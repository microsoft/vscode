/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { vArray, vBoolean, vNumber, vObj, vOptionalProp, vString, type ValidatorType } from '../../../base/common/validation.js';

/**
 * Searches the text of requests users sent to this host's chats. Gated by the
 * `vscode.searchRequests` initialize capability; read-only.
 */
export const SearchAgentHostRequestsExtensionMethod = 'vscode/searchRequests';

/** Longest accepted query, in characters. */
export const AGENT_HOST_REQUEST_SEARCH_MAX_QUERY_LENGTH = 200;
/** Most whitespace-separated terms a query may use; each must match. */
export const AGENT_HOST_REQUEST_SEARCH_MAX_TERMS = 8;
/** Hits returned when a request does not ask for a limit. */
export const AGENT_HOST_REQUEST_SEARCH_DEFAULT_LIMIT = 20;
/** Most hits a host returns for one request. */
export const AGENT_HOST_REQUEST_SEARCH_MAX_LIMIT = 50;
/** Longest snippet a host returns for a hit, in characters. */
export const AGENT_HOST_REQUEST_SEARCH_SNIPPET_LENGTH = 200;

export const searchAgentHostRequestsParamsValidator = vObj({
	query: vString(),
	limit: vOptionalProp(vNumber()),
});

export type SearchAgentHostRequestsParams = ValidatorType<typeof searchAgentHostRequestsParamsValidator>;

/** One request whose text matched every term of a query. */
export interface IAgentHostRequestSearchHit {
	/** The backend session URI that owns the chat now. */
	readonly session: string;
	/** The chat's URI; absent for the session's default chat. */
	readonly chat?: string;
	/** The turn ID the host currently exposes for the request, for an `agent-host-session` link's `turn`. */
	readonly turnId: string;
	/** ISO 8601 time the host received the request. */
	readonly startedAt: string;
	/** Part of the request around its first match, with whitespace collapsed. */
	readonly snippet: string;
	readonly sessionTitle?: string;
	/** Present for a chat that is not the session's default chat. */
	readonly chatTitle?: string;
}

export interface IAgentHostRequestSearchResult {
	/** `false` when the host's request index is turned off; it then returns no hits. */
	readonly indexEnabled: boolean;
	/** Newest first. */
	readonly hits: readonly IAgentHostRequestSearchHit[];
	/** More requests matched than were returned. */
	readonly truncated: boolean;
	/** ISO 8601 time of the oldest request the index still holds; absent while it is empty. */
	readonly indexedSince?: string;
}

/** Validates a result received from a host, which may be any conforming implementation. */
export const agentHostRequestSearchResultValidator = vObj({
	indexEnabled: vBoolean(),
	hits: vArray(vObj({
		session: vString(),
		chat: vOptionalProp(vString()),
		turnId: vString(),
		startedAt: vString(),
		snippet: vString(),
		sessionTitle: vOptionalProp(vString()),
		chatTitle: vOptionalProp(vString()),
	})),
	truncated: vBoolean(),
	indexedSince: vOptionalProp(vString()),
});

/**
 * Splits a query into the lower-cased terms a request must all contain, or
 * `undefined` when the query is empty or exceeds the limits.
 */
export function parseAgentHostRequestSearchTerms(query: string): readonly string[] | undefined {
	if (query.length > AGENT_HOST_REQUEST_SEARCH_MAX_QUERY_LENGTH) {
		return undefined;
	}
	const terms = [...new Set(query.toLowerCase().split(/\s+/).filter(term => term.length > 0))];
	return terms.length > 0 && terms.length <= AGENT_HOST_REQUEST_SEARCH_MAX_TERMS ? terms : undefined;
}
