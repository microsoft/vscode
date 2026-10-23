/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { parseAnnotationsUri } from './annotationsUri.js';
import { changesetSession, parseChangesetUri, parseFolderChangesetOwnerUri } from './changesetUri.js';
import { parseNonPtyShellTerminalUri } from './nonPtyShellTerminalUri.js';
import { parseCanvasChatUri } from './canvasUri.js';
import { isAhpChatChannel, parseSubagentSessionUri } from './state/sessionState.js';

export const IAgentHostSubscriptionService = createDecorator<IAgentHostSubscriptionService>('agentHostSubscriptionService');

/**
 * Authoritative registry of logical protocol clients observing Agent Host state.
 */
export interface IAgentHostSubscriptionService {
	readonly _serviceBrand: undefined;

	readonly subscribedResources: Iterable<URI>;

	addSubscriber(resource: URI, clientId: string): boolean;
	removeSubscriber(resource: URI, clientId: string): boolean;
	hasSubscribers(resource: URI): boolean;
	/** Records the owning session of a subscribed chat; kept until its last subscriber leaves. */
	setSubscriptionOwner(resource: URI, session: string): void;
	/** Maps a subscribed resource to its session using the owner recorded for it. */
	resolveSubscribedSession(resource: URI): URI | undefined;
	/** Whether any subscribed resource belongs to `session`, using recorded owners. */
	hasSessionSubscribers(session: URI): boolean;
}

/** Looks up the session that owns a chat from recorded ownership, never from the chat URI. */
export type AgentHostChatOwnerLookup = (chat: string) => string | undefined;

/**
 * Maps a subscribable resource to its owning session. Returns `undefined` for a
 * chat (or chat-scoped canvas) whose owner is not recorded.
 */
export function resolveAgentHostSession(resource: URI, getChatOwner: AgentHostChatOwnerLookup): URI | undefined {
	const resourceString = resource.toString();
	const changeset = parseChangesetUri(resourceString);
	if (changeset) {
		const session = changesetSession(changeset, getChatOwner);
		return session === undefined ? undefined : resolveAgentHostRootSession(URI.parse(session));
	}
	const annotationsSession = parseAnnotationsUri(resourceString)?.sessionUri;
	const folderSession = parseFolderChangesetOwnerUri(resourceString)?.sessionUri;
	let sessionString = annotationsSession ?? folderSession;
	if (sessionString === undefined) {
		const chat = resourceChat(resource);
		if (chat !== undefined) {
			sessionString = getChatOwner(chat);
			if (sessionString === undefined) {
				return undefined;
			}
		}
	}
	return resolveAgentHostRootSession(URI.parse(sessionString ?? resourceString));
}

/**
 * The chat a chat-scoped resource belongs to: a chat channel, a chat's canvas,
 * or a retained terminal link (by the chat it names, not the session it embeds).
 */
export function resourceChat(resource: URI): string | undefined {
	const terminalChat = parseNonPtyShellTerminalUri(resource)?.chat.toString();
	if (terminalChat !== undefined) {
		return terminalChat;
	}
	const canvasChat = parseCanvasChatUri(resource);
	if (canvasChat) {
		return canvasChat.toString();
	}
	const resourceString = resource.toString();
	return isAhpChatChannel(resourceString) ? resourceString : undefined;
}

/** Maps a (possibly nested subagent) session URI to its top-level session. */
export function resolveAgentHostRootSession(session: URI): URI {
	let subagent;
	while ((subagent = parseSubagentSessionUri(session))) {
		session = subagent.parentSession;
	}
	return session;
}
