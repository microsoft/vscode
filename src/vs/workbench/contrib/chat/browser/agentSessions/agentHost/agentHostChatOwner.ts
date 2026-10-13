/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceTimeout } from '../../../../../../base/common/async.js';
import { toErrorMessage } from '../../../../../../base/common/errorMessage.js';
import { isDefined } from '../../../../../../base/common/types.js';
import { URI } from '../../../../../../base/common/uri.js';
import type { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { AMBIENT_AGENT_HOST_AUTHORITY } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { agentHostAuthority } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import type { IRemoteAgentHostService } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
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

/** The session that owns a chat, resolved across the local host and the connected remote hosts. */
export interface IResolvedAgentHostChatOwner {
	readonly session: URI;
	/** `undefined` when the owner's state or record names no default chat. */
	readonly defaultChat: string | undefined;
	/**
	 * The authority of the host connection that owns the session:
	 * {@link AMBIENT_AGENT_HOST_AUTHORITY} for the local host, `undefined` for a
	 * bare session URI whose host is unknown.
	 */
	readonly connectionAuthority: string | undefined;
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
 * Resolves the session that owns a backend chat: first from session state
 * this client already holds, then from the session records of the local host
 * and of each connected remote host, queried in parallel with a per-host
 * timeout. Preference is deterministic: held state, then local, then remotes
 * in connection order. A value that is not a chat channel is a session URI and
 * owns itself. Returns the owner's advertised default chat and the authority of
 * the connection it was found on with it. Never derives the owner or the
 * default chat from the chat URI.
 */
export async function resolveAgentHostChatOwner(chat: URI, localHost: AgentHostChatOwnerSource, remoteHosts: IRemoteAgentHostService, logService: ILogService, timeoutMs: number): Promise<IResolvedAgentHostChatOwner | undefined> {
	const chatString = chat.toString();
	if (!isAhpChatChannel(chatString)) {
		return { session: chat, defaultChat: undefined, connectionAuthority: undefined };
	}
	const connections: { readonly label: string; readonly connectionAuthority: string; readonly connection: AgentHostChatOwnerSource }[] = [
		{ label: 'local', connectionAuthority: AMBIENT_AGENT_HOST_AUTHORITY, connection: localHost },
		...remoteHosts.connections
			.filter(info => info.status.kind === 'connected')
			.map(info => {
				const connectionAuthority = agentHostAuthority(info.address);
				const connection = remoteHosts.getConnectionByAuthority(connectionAuthority);
				return connection && { label: info.address, connectionAuthority, connection };
			})
			.filter(isDefined),
	];
	for (const { connectionAuthority, connection } of connections) {
		const owner = findChatOwnerInSubscribedState(connection, chatString);
		if (owner !== undefined) {
			return { session: URI.parse(owner.session), defaultChat: owner.defaultChat, connectionAuthority };
		}
	}
	const lookups = connections.map(({ label, connection }) => raceTimeout(
		findChatOwnerInSessionRecords(connection, chatString).catch(error => {
			logService.trace(`[AgentHostChatOwner] ${label} could not list sessions: ${toErrorMessage(error)}`);
			return undefined;
		}),
		timeoutMs,
		() => logService.trace(`[AgentHostChatOwner] ${label} did not list sessions within ${timeoutMs}ms`),
	));
	for (const [index, lookup] of lookups.entries()) {
		const owner = await lookup;
		if (owner !== undefined) {
			return { session: URI.parse(owner.session), defaultChat: owner.defaultChat, connectionAuthority: connections[index].connectionAuthority };
		}
	}
	return undefined;
}
