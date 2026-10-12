/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isDefined } from '../../../../../../base/common/types.js';
import { URI } from '../../../../../../base/common/uri.js';
import type { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { agentHostAuthority } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import type { IRemoteAgentHostService } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { buildDefaultChatUri, StateComponents, type SessionState } from '../../../../../../platform/agentHost/common/state/sessionState.js';

function listsChat(session: string, state: Pick<SessionState, 'defaultChat' | 'chats'>, chat: string): boolean {
	return (state.defaultChat?.toString() ?? buildDefaultChatUri(session)) === chat || state.chats.some(summary => summary.resource.toString() === chat);
}

function findOwnerInSubscribedState(connection: IAgentConnection, chat: string): string | undefined {
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

async function findOwnerInSessionRecords(connection: IAgentConnection, chat: string): Promise<string | undefined> {
	for (const metadata of await connection.listSessions()) {
		const session = metadata.session.toString();
		const listed = metadata.chats?.length ? metadata.chats.some(entry => entry.chat.toString() === chat) : buildDefaultChatUri(session) === chat;
		if (listed) {
			return session;
		}
	}
	return undefined;
}

/**
 * Resolves the session that owns a backend chat: first from session state
 * this client already holds, then from the session records of the local host
 * and of each connected remote host. Never derives the owner from the chat URI.
 */
export async function resolveAgentHostChatOwner(chat: URI, localHost: IAgentConnection, remoteHosts: IRemoteAgentHostService): Promise<URI | undefined> {
	const chatString = chat.toString();
	const connections = [
		localHost,
		...remoteHosts.connections
			.filter(connection => connection.status.kind === 'connected')
			.map(connection => remoteHosts.getConnectionByAuthority(agentHostAuthority(connection.address)))
			.filter(isDefined),
	];
	for (const connection of connections) {
		const owner = findOwnerInSubscribedState(connection, chatString);
		if (owner !== undefined) {
			return URI.parse(owner);
		}
	}
	for (const connection of connections) {
		try {
			const owner = await findOwnerInSessionRecords(connection, chatString);
			if (owner !== undefined) {
				return URI.parse(owner);
			}
		} catch {
			// An unreachable host cannot own the chat; keep looking.
		}
	}
	return undefined;
}
