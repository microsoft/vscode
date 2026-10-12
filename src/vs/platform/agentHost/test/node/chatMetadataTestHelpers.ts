/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ISessionDataService } from '../../common/sessionDataService.js';
import type { IAgentHostPeerChatPersistenceService } from '../../node/agentHostPeerChatStore.js';
import type { IAgentHostDatabase, IAgentHostDatabaseSessionListCatalog } from '../../node/agentHostDatabase.js';
import { chatCatalogV2ToCatalogChats } from '../../node/agentHostCatalogSourceResolver.js';
import { decodeAgentHostCatalogPayload } from '../../node/agentHostCatalogProjection.js';
import { customChatTitleMetadataKey, customChatTitleSourceMetadataKey, SESSION_CUSTOM_TITLE_SOURCE_KEY } from '../../node/shared/persistSessionMetadata.js';

export function createLegacyChatMetadataPersistence(service: ISessionDataService): Pick<IAgentHostPeerChatPersistenceService, 'persistMetadata' | 'readNormalizedChat' | 'persistDefaultChatTitleSnapshot'> {
	return {
		readNormalizedChat: async () => ({ normalized: false }),
		persistDefaultChatTitleSnapshot: async (session, chat, title) => {
			const reference = service.openDatabase(session);
			try {
				const key = customChatTitleMetadataKey(chat.toString());
				await reference.object.setMetadataValuesIfAbsent(key, { [key]: title }, {
					[customChatTitleSourceMetadataKey(chat.toString())]: SESSION_CUSTOM_TITLE_SOURCE_KEY,
				});
			} finally {
				reference.dispose();
			}
		},
		persistMetadata: async (_session, resource, values) => {
			const reference = service.openDatabase(resource);
			try {
				await reference.object.setMetadataValues(values);
			} finally {
				reference.dispose();
			}
		},
	};
}

export async function readTestSessionListCatalogs(database: IAgentHostDatabase, sessions: readonly string[]): Promise<readonly IAgentHostDatabaseSessionListCatalog[]> {
	const [catalogs, snapshots] = await Promise.all([database.listSessionsV2(sessions), database.readCatalogSnapshot(sessions)]);
	const bySession = new Map(snapshots.map(snapshot => [snapshot.session, snapshot]));
	return catalogs.map(catalog => {
		const snapshot = bySession.get(catalog.session);
		return {
			...catalog,
			...(snapshot?.authorityVersion === 2 && snapshot.header ? { chatCatalog: { header: snapshot.header, chats: chatCatalogV2ToCatalogChats(snapshot) } } : {}),
		};
	});
}

export async function listTestLegacyChatCatalogSessions(database: IAgentHostDatabase, sessions: readonly string[]): ReturnType<IAgentHostDatabase['listLegacyChatCatalogSessions']> {
	return (await database.readCatalogSnapshot(sessions))
		.filter(entry => entry.authorityVersion === 1 && !entry.isChatBacking && !entry.provisional)
		.map(entry => entry.session);
}

export async function readTestChatV2(database: IAgentHostDatabase, session: string, chat: string): ReturnType<IAgentHostDatabase['readChatV2']> {
	const [snapshot] = await database.readCatalogSnapshot([session]);
	if (snapshot?.authorityVersion !== 2) {
		return { normalized: false };
	}
	const row = snapshot.chats.find(entry => entry.chat === chat);
	return { normalized: true, ...(row ? { chat: row } : {}) };
}

/** In-memory counterpart of {@link IAgentHostDatabase.findChatOwner} for database fakes. */
export async function findTestChatOwner(database: IAgentHostDatabase, chat: string): ReturnType<IAgentHostDatabase['findChatOwner']> {
	const sessions = [...new Set([
		...(await database.listSessionV2Registrations()).map(identity => identity.session),
		...(await database.listSessions()).map(identity => identity.session),
	])];
	for (const snapshot of await database.readCatalogSnapshot(sessions)) {
		if (snapshot.chats.some(entry => entry.chat === chat)) {
			return { ownerSession: snapshot.session, source: 'normalized', deleted: await database.isSessionTombstoned(snapshot.session) };
		}
	}
	for (const session of sessions) {
		if ((await database.getSessionChatCatalog(session))?.chats.some(entry => entry.chat === chat)) {
			return { ownerSession: session, source: 'legacyCatalog', deleted: await database.isSessionTombstoned(session) };
		}
	}
	for (const row of await database.listSessionsV2(sessions)) {
		const decoded = decodeAgentHostCatalogPayload(row.payload);
		if (decoded.ok && decoded.value.data.chats.some(entry => entry.uri === chat)) {
			return { ownerSession: row.session, source: 'catalogPayload', deleted: await database.isSessionTombstoned(row.session) };
		}
	}
	return undefined;
}
