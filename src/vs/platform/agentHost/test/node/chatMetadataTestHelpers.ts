/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ISessionDataService } from '../../common/sessionDataService.js';
import type { IAgentHostPeerChatPersistenceService } from '../../node/agentHostPeerChatStore.js';
import type { IAgentHostDatabase, IAgentHostDatabaseSessionListCatalog } from '../../node/agentHostDatabase.js';
import { chatCatalogV2ToCatalogChats } from '../../node/agentHostCatalogSourceResolver.js';
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
