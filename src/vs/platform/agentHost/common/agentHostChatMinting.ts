/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { generateUuid } from '../../../base/common/uuid.js';
import { isShapedChatUri, uuidFromSha1 } from './agentHostChatIdentity.js';
import { AHP_CHAT_SCHEME, buildChatUri, buildDefaultChatUri, buildSubagentChatUri } from './state/sessionState.js';

/**
 * The spelling new chats of a session use. It follows the session's recorded
 * default chat so every chat of a session is addressable by the same clients.
 */
export type ChatUriFormat = 'opaque' | 'shaped';

/** The format new chats follow for a session whose recorded default chat is `defaultChat`. */
export function chatUriFormatOf(defaultChat: string | undefined): ChatUriFormat {
	return defaultChat !== undefined && !isShapedChatUri(defaultChat) ? 'opaque' : 'shaped';
}

function opaqueChatUri(uuid: string): string {
	return `${AHP_CHAT_SCHEME}:/${uuid}`;
}

/** Mints the default chat of a new (or recreated) session. `generation` only distinguishes a shaped default of a reused session id. */
export function mintDefaultChatUri(format: ChatUriFormat, session: string, generation: string | undefined): string {
	return format === 'opaque'
		? opaqueChatUri(generateUuid())
		: buildDefaultChatUri(session) + (generation === undefined ? '' : `?generation=${generation}`);
}

/** Mints an additional chat of `session`. */
export function mintPeerChatUri(format: ChatUriFormat, session: string): string {
	const uuid = generateUuid();
	return format === 'opaque' ? opaqueChatUri(uuid) : buildChatUri(session, uuid);
}

/**
 * The id of the chat that runs a subagent. Opaque ids derive from the root
 * conversation chat that issued the tool call, so the same call always yields
 * the same chat and distinct chats never collide on a tool call id.
 */
export function subagentChatUri(format: ChatUriFormat, session: string, rootConversationChat: string, toolCallId: string): string {
	return format === 'opaque'
		? opaqueChatUri(uuidFromSha1(`${rootConversationChat}\0${toolCallId}`))
		: buildSubagentChatUri(session, toolCallId);
}
