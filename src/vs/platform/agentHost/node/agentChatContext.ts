/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';
import type { IAgentChatContext } from '../common/agent.js';
import { buildDefaultChatUri, isDefaultChatUri, type URI as ProtocolURI } from '../common/state/sessionState.js';
import type { AgentHostStateManager } from './agentHostStateManager.js';

function toKey(resource: URI | ProtocolURI): ProtocolURI {
	return typeof resource === 'string' ? resource : resource.toString();
}

function toUri(resource: URI | ProtocolURI): URI {
	return typeof resource === 'string' ? URI.parse(resource) : resource;
}

/**
 * Builds the host-owned {@link IAgentChatContext} for an addressed chat
 * operation — the single place Agent Host derives the transient context handed
 * to a provider, so every boundary (create, materialize, send, truncate,
 * dispose, release, model/agent change, history read) carries the same facts:
 *
 * - `resource` — provider-owned persistence scope for the exact chat;
 * - `configurationResource` — opaque scope for shared configuration;
 * - `origin` — how the chat came into existence, read from its `ChatSummary`.
 *   Absent only in the narrow restore window before a chat is registered,
 *   where the restoring caller supplies the origin itself;
 * - `customizations` — the owning session's effective host customizations.
 *
 * Accepts either resource form so callers already holding protocol URI strings
 * (the action pipeline) need not round-trip through {@link URI}.
 */
export function createAgentChatContext(stateManager: AgentHostStateManager, session: URI | ProtocolURI, chat: URI | ProtocolURI): IAgentChatContext {
	const sessionKey = toKey(session);
	const chatKey = toKey(chat);
	const origin = stateManager.getChatOrigin(chatKey);
	const customizations = stateManager.getSessionState(sessionKey)?.customizations;
	const sessionUri = toUri(session);
	return {
		resource: isDefaultChatUri(chatKey) ? sessionUri : toUri(chat),
		configurationResource: sessionUri,
		...(origin ? { origin } : {}),
		...(customizations ? { customizations } : {}),
	};
}

/**
 * The exact chats an active client's contribution fans out to, owned by Agent
 * Host — or `undefined` when the host holds no state for the session.
 *
 * An empty/absent catalog is not the same as "only the default chat": a
 * session whose state hasn't been published yet has no authoritative
 * membership, so callers must skip provider fan-out rather than fabricate a
 * default-chat URI. Returned lists are always complete and non-empty.
 */
export function getSessionChatsForFanOut(stateManager: AgentHostStateManager, session: URI | ProtocolURI): URI[] | undefined {
	const sessionKey = toKey(session);
	const state = stateManager.getSessionState(sessionKey);
	if (!state) {
		return undefined;
	}
	const defaultChat = state.defaultChat ?? buildDefaultChatUri(sessionKey);
	const seen = new Set<string>();
	const chats: URI[] = [];
	for (const summary of state.chats) {
		if (!seen.has(summary.resource)) {
			seen.add(summary.resource);
			chats.push(URI.parse(summary.resource));
		}
	}
	if (!seen.has(defaultChat)) {
		chats.unshift(URI.parse(defaultChat));
	}
	return chats;
}
