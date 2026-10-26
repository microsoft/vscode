/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceTimeout } from '../../../../../../base/common/async.js';
import { toErrorMessage } from '../../../../../../base/common/errorMessage.js';
import { URI } from '../../../../../../base/common/uri.js';
import type { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { isAhpChatChannel, StateComponents } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import type { ILogService } from '../../../../../../platform/log/common/log.js';

/** The parts of an agent host connection that record which session owns a chat. */
export type AgentHostChatOwnerSource = Pick<IAgentConnection, 'getActiveSubscriptions' | 'getSubscriptionUnmanaged' | 'listSessions'>;

/** How long a chat owner lookup waits for one host before skipping it. */
export const AGENT_HOST_CHAT_OWNER_TIMEOUT_MS = 5000;

/** The session that owns a chat, with that session's advertised default chat. */
export interface IAgentHostChatOwner {
	readonly session: string;
	/** `undefined` when the owner's state or record names no default chat. */
	readonly defaultChat: string | undefined;
	/** Whether the chat is the owner's default chat. */
	readonly isDefaultChat: boolean;
}

/** The session that owns a chat, resolved on the host connection that holds it. */
export interface IResolvedAgentHostChatOwner {
	readonly session: URI;
	/** `undefined` when the owner's state or record names no default chat. */
	readonly defaultChat: string | undefined;
	/** The authority of the host connection that owns the session. */
	readonly connectionAuthority: string;
}

/** The subscribed session whose state lists `chat` as its default chat or one of its chats. */
export function findChatOwnerInSubscribedState(connection: AgentHostChatOwnerSource, chat: string): IAgentHostChatOwner | undefined {
	for (const subscription of connection.getActiveSubscriptions()) {
		if (subscription.kind !== StateComponents.Session) {
			continue;
		}
		const state = connection.getSubscriptionUnmanaged(StateComponents.Session, subscription.resource)?.value;
		if (!state || state instanceof Error) {
			continue;
		}
		const defaultChat = state.defaultChat?.toString();
		if (defaultChat === chat || state.chats.some(summary => summary.resource.toString() === chat)) {
			return { session: subscription.resource.toString(), defaultChat, isDefaultChat: defaultChat === chat };
		}
	}
	return undefined;
}

/** The session whose host record lists `chat`, its default chat included. */
export async function findChatOwnerInSessionRecords(connection: AgentHostChatOwnerSource, chat: string): Promise<IAgentHostChatOwner | undefined> {
	for (const metadata of await connection.listSessions()) {
		const entry = metadata.chats?.find(candidate => candidate.chat.toString() === chat);
		if (entry) {
			return { session: metadata.session.toString(), defaultChat: metadata.chats?.find(candidate => candidate.kind === 'default')?.chat.toString(), isDefaultChat: entry.kind === 'default' };
		}
	}
	return undefined;
}

/**
 * Resolves the session that owns a backend chat on the one host connection
 * that holds it: first from session state this client already holds, then
 * from that host's session records, waiting at most `timeoutMs`. A chat
 * reference never crosses agent hosts, so callers pass the connection of the
 * chat that shows the reference; no other host is consulted. A value that is
 * not a chat channel is a session URI and owns itself. Returns the owner's
 * advertised default chat and `connectionAuthority` with it. Never derives the
 * owner or the default chat from the chat URI.
 */
export async function resolveAgentHostChatOwner(chat: URI, connection: AgentHostChatOwnerSource, connectionAuthority: string, logService: ILogService, timeoutMs: number): Promise<IResolvedAgentHostChatOwner | undefined> {
	const chatString = chat.toString();
	if (!isAhpChatChannel(chatString)) {
		return { session: chat, defaultChat: undefined, connectionAuthority };
	}
	const held = findChatOwnerInSubscribedState(connection, chatString);
	if (held !== undefined) {
		return { session: URI.parse(held.session), defaultChat: held.defaultChat, connectionAuthority };
	}
	const recorded = await raceTimeout(
		findChatOwnerInSessionRecords(connection, chatString).catch(error => {
			logService.trace(`[AgentHostChatOwner] ${connectionAuthority} could not list sessions: ${toErrorMessage(error)}`);
			return undefined;
		}),
		timeoutMs,
		() => logService.trace(`[AgentHostChatOwner] ${connectionAuthority} did not list sessions within ${timeoutMs}ms`),
	);
	return recorded && { session: URI.parse(recorded.session), defaultChat: recorded.defaultChat, connectionAuthority };
}
