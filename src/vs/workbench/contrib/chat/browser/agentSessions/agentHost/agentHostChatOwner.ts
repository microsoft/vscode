/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceTimeout } from '../../../../../../base/common/async.js';
import { toErrorMessage } from '../../../../../../base/common/errorMessage.js';
import { isDefined } from '../../../../../../base/common/types.js';
import { URI } from '../../../../../../base/common/uri.js';
import type { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { agentHostAuthority } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import type { IRemoteAgentHostService } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { buildDefaultChatUri, isAhpChatChannel, StateComponents, type SessionState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import type { ILogService } from '../../../../../../platform/log/common/log.js';

/** The parts of an agent host connection that record which session owns a chat. */
export type AgentHostChatOwnerSource = Pick<IAgentConnection, 'getActiveSubscriptions' | 'getSubscriptionUnmanaged' | 'listSessions'>;

/** How long a chat owner lookup waits for one host before skipping it. */
export const AGENT_HOST_CHAT_OWNER_TIMEOUT_MS = 5000;

function listsChat(session: string, state: Pick<SessionState, 'defaultChat' | 'chats'>, chat: string): boolean {
	return (state.defaultChat?.toString() ?? buildDefaultChatUri(session)) === chat || state.chats.some(summary => summary.resource.toString() === chat);
}

/** The subscribed session whose state lists `chat` as its default chat or one of its chats. */
export function findChatOwnerInSubscribedState(connection: AgentHostChatOwnerSource, chat: string): string | undefined {
	for (const subscription of connection.getActiveSubscriptions()) {
		if (subscription.kind !== StateComponents.Session) {
			continue;
		}
		const state = connection.getSubscriptionUnmanaged(StateComponents.Session, subscription.resource)?.value;
		if (state && !(state instanceof Error) && listsChat(subscription.resource.toString(), state, chat)) {
			return subscription.resource.toString();
		}
	}
	return undefined;
}

/** The session whose host record lists `chat`; a record listing no chats owns its default chat. */
export async function findChatOwnerInSessionRecords(connection: AgentHostChatOwnerSource, chat: string, defaultChatOnly: boolean): Promise<string | undefined> {
	for (const metadata of await connection.listSessions()) {
		const session = metadata.session.toString();
		const chats = metadata.chats?.filter(entry => !defaultChatOnly || entry.kind === 'default') ?? [];
		const listed = chats.length ? chats.some(entry => entry.chat.toString() === chat) : buildDefaultChatUri(session) === chat;
		if (listed) {
			return session;
		}
	}
	return undefined;
}

/**
 * Resolves the session that owns a backend chat: first from session state
 * this client already holds, then from the session records of the local host
 * and of each connected remote host, queried in parallel with a per-host
 * timeout. Preference is deterministic: held state, then local, then remotes
 * in connection order. A value that is not a chat channel is a session URI and
 * owns itself. Never derives the owner from the chat URI.
 */
export async function resolveAgentHostChatOwner(chat: URI, localHost: AgentHostChatOwnerSource, remoteHosts: IRemoteAgentHostService, logService: ILogService, timeoutMs: number): Promise<URI | undefined> {
	const chatString = chat.toString();
	if (!isAhpChatChannel(chatString)) {
		return chat;
	}
	const connections: { readonly label: string; readonly connection: AgentHostChatOwnerSource }[] = [
		{ label: 'local', connection: localHost },
		...remoteHosts.connections
			.filter(info => info.status.kind === 'connected')
			.map(info => {
				const connection = remoteHosts.getConnectionByAuthority(agentHostAuthority(info.address));
				return connection && { label: info.address, connection };
			})
			.filter(isDefined),
	];
	for (const { connection } of connections) {
		const owner = findChatOwnerInSubscribedState(connection, chatString);
		if (owner !== undefined) {
			return URI.parse(owner);
		}
	}
	const lookups = connections.map(({ label, connection }) => raceTimeout(
		findChatOwnerInSessionRecords(connection, chatString, false).catch(error => {
			logService.trace(`[AgentHostChatOwner] ${label} could not list sessions: ${toErrorMessage(error)}`);
			return undefined;
		}),
		timeoutMs,
		() => logService.trace(`[AgentHostChatOwner] ${label} did not list sessions within ${timeoutMs}ms`),
	));
	for (const lookup of lookups) {
		const owner = await lookup;
		if (owner !== undefined) {
			return URI.parse(owner);
		}
	}
	return undefined;
}
