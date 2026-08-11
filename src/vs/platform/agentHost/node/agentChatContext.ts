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
 * operation.
 *
 * This is the single place Agent Host derives the transient context it hands to
 * a provider, so every boundary (create, materialize, send, truncate, dispose,
 * release, model/agent change, history read) carries the same, exhaustive
 * facts:
 *
 * - `resource` — the provider-owned persistence scope for the exact chat;
 * - `configurationResource` — the opaque scope for shared configuration;
 * - `origin` — the catalog's record of how the chat came into existence, read
 *   from the chat's authoritative `ChatSummary`. Restored chats register their
 *   summary before any state is resolved, and provider-spawned subagent chats
 *   record their tool spawn edge when the host adds them, so this is exhaustive
 *   for both. It is absent only in the narrow restore window before a chat is
 *   registered, where the restoring caller supplies the origin itself;
 * - `customizations` — the owning session's effective host customizations,
 *   including user enablement toggles.
 *
 * Accepts either resource form so callers that already hold protocol URI
 * strings (the action pipeline) do not have to round-trip through {@link URI}.
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
 * Returns the session's authoritative chat catalog (default chat first). The
 * distinction matters: an empty-or-absent catalog is NOT the same as "the
 * session has exactly its default chat". A session whose state the host has not
 * published yet has no authoritative membership at all, and Agent Host must not
 * invent one — callers skip the provider fan-out until real state exists rather
 * than fabricating a default-chat URI. Providers therefore only ever see a
 * complete, non-empty membership list.
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
