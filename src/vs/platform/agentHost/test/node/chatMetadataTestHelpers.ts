/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ISessionDataService } from '../../common/sessionDataService.js';
import type { IAgentHostPeerChatPersistenceService } from '../../node/agentHostPeerChatStore.js';
import type { IAgentHostDatabase, IAgentHostDatabaseChatOwner, IAgentHostDatabaseSession, IAgentHostDatabaseSessionListCatalog, IAgentHostDatabaseSessionRegistrations } from '../../node/agentHostDatabase.js';
import { chatCatalogV2ToCatalogChats } from '../../node/agentHostCatalogSourceResolver.js';
import { decodeAgentHostCatalogPayload } from '../../node/agentHostCatalogProjection.js';
import type { IAgentHostSessionStateDatabase } from '../../node/agentHostSessionStateDatabase.js';
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

async function registeredTestSessions(database: IAgentHostDatabase): Promise<string[]> {
	return [...new Set([
		...(await database.listSessionV2Registrations()).map(identity => identity.session),
		...(await database.listSessions()).map(identity => identity.session),
	])];
}

/** In-memory counterpart of {@link IAgentHostDatabase.findCentralChatOwners} for database fakes. */
export async function findTestCentralChatOwners(database: IAgentHostDatabase, chats: readonly string[]): ReturnType<IAgentHostDatabase['findCentralChatOwners']> {
	const sessions = await registeredTestSessions(database);
	const snapshots = await database.readCatalogSnapshot(sessions);
	const owners = new Map<string, IAgentHostDatabaseChatOwner>();
	for (const chat of chats) {
		const normalized = snapshots.find(snapshot => snapshot.chats.some(entry => entry.chat === chat));
		if (normalized) {
			owners.set(chat, { ownerSession: normalized.session, source: 'normalized', deleted: await database.isSessionTombstoned(normalized.session) });
			continue;
		}
		for (const session of sessions) {
			if ((await database.getSessionChatCatalog(session))?.chats.some(entry => entry.chat === chat)) {
				owners.set(chat, { ownerSession: session, source: 'legacyCatalog', deleted: await database.isSessionTombstoned(session) });
				break;
			}
		}
	}
	return owners;
}

/** In-memory counterpart of {@link IAgentHostDatabase.findCatalogPayloadChatOwners} for database fakes. */
export async function findTestCatalogPayloadChatOwners(database: IAgentHostDatabase, chats: readonly string[]): ReturnType<IAgentHostDatabase['findCatalogPayloadChatOwners']> {
	const rows = await database.listSessionsV2(await registeredTestSessions(database));
	const owners = new Map<string, IAgentHostDatabaseChatOwner>();
	for (const chat of chats) {
		for (const row of rows) {
			const decoded = decodeAgentHostCatalogPayload(row.payload);
			if (decoded.ok && decoded.value.data.chats.some(entry => entry.uri === chat)) {
				owners.set(chat, { ownerSession: row.session, source: 'catalogPayload', deleted: await database.isSessionTombstoned(row.session) });
				break;
			}
		}
	}
	return owners;
}

const testRegistrationGenerations = new Map<string, number>();

/** A database fake's registration generation: it changes exactly when the registrations it lists change. */
export function testRegistrationGeneration(...registrations: Iterable<IAgentHostDatabaseSession>[]): number {
	const fingerprint = registrations.map(list => [...list].map(registration => `${registration.session} ${registration.provider}`).join('\n')).join('\n\n');
	let generation = testRegistrationGenerations.get(fingerprint);
	if (generation === undefined) {
		generation = testRegistrationGenerations.size;
		testRegistrationGenerations.set(fingerprint, generation);
	}
	return generation;
}

/** In-memory counterpart of {@link IAgentHostDatabase.readSessionRegistrations} for database fakes. */
export async function readTestSessionRegistrations(database: IAgentHostDatabase): Promise<IAgentHostDatabaseSessionRegistrations> {
	const generation = await database.getRegistrationGeneration();
	const [current, legacy] = await Promise.all([database.listSessionV2Registrations(), database.listSessions()]);
	// Database fakes keep no normalized chat catalogs.
	return { generation, current, legacy, normalizedCatalogs: [] };
}

function unsupportedSessionState(): never {
	throw new Error('Session state is not supported by this database fake');
}

/** Base for database fakes that do not hold central session state. */
export abstract class SessionStateUnsupportedDatabase implements IAgentHostSessionStateDatabase {
	readSessionState(): ReturnType<IAgentHostSessionStateDatabase['readSessionState']> { return unsupportedSessionState(); }
	readSessionStateValues(): ReturnType<IAgentHostSessionStateDatabase['readSessionStateValues']> { return unsupportedSessionState(); }
	importSessionState(): ReturnType<IAgentHostSessionStateDatabase['importSessionState']> { return unsupportedSessionState(); }
	writeSessionState(): ReturnType<IAgentHostSessionStateDatabase['writeSessionState']> { return unsupportedSessionState(); }
	markSessionStateLegacyMirrored(): ReturnType<IAgentHostSessionStateDatabase['markSessionStateLegacyMirrored']> { return unsupportedSessionState(); }
	recordSessionStateLegacyMirrorPayload(): ReturnType<IAgentHostSessionStateDatabase['recordSessionStateLegacyMirrorPayload']> { return unsupportedSessionState(); }
	bumpSessionStateRowsRevision(): ReturnType<IAgentHostSessionStateDatabase['bumpSessionStateRowsRevision']> { return unsupportedSessionState(); }
	markSessionStateRowsMirrored(): ReturnType<IAgentHostSessionStateDatabase['markSessionStateRowsMirrored']> { return unsupportedSessionState(); }
	markSessionStateLaunchDirsBackfilled(): ReturnType<IAgentHostSessionStateDatabase['markSessionStateLaunchDirsBackfilled']> { return unsupportedSessionState(); }
	markSessionStateRowsMoved(): ReturnType<IAgentHostSessionStateDatabase['markSessionStateRowsMoved']> { return unsupportedSessionState(); }
	readBranchChangeset(): ReturnType<IAgentHostSessionStateDatabase['readBranchChangeset']> { return unsupportedSessionState(); }
	nextSessionCheckpointSequence(): ReturnType<IAgentHostSessionStateDatabase['nextSessionCheckpointSequence']> { return unsupportedSessionState(); }
	upsertTurnCheckpoints(): ReturnType<IAgentHostSessionStateDatabase['upsertTurnCheckpoints']> { return unsupportedSessionState(); }
	readTurnCheckpoints(): ReturnType<IAgentHostSessionStateDatabase['readTurnCheckpoints']> { return unsupportedSessionState(); }
	deleteTurnCheckpoints(): ReturnType<IAgentHostSessionStateDatabase['deleteTurnCheckpoints']> { return unsupportedSessionState(); }
	addCheckpointRepositories(): ReturnType<IAgentHostSessionStateDatabase['addCheckpointRepositories']> { return unsupportedSessionState(); }
	readCheckpointRepositories(): ReturnType<IAgentHostSessionStateDatabase['readCheckpointRepositories']> { return unsupportedSessionState(); }
	readChatRowMirror(): ReturnType<IAgentHostSessionStateDatabase['readChatRowMirror']> { return unsupportedSessionState(); }
	writeChatRowMirror(): ReturnType<IAgentHostSessionStateDatabase['writeChatRowMirror']> { return unsupportedSessionState(); }
	countStorageReferences(): ReturnType<IAgentHostSessionStateDatabase['countStorageReferences']> { return unsupportedSessionState(); }
	listSessionStateGarbage(): ReturnType<IAgentHostSessionStateDatabase['listSessionStateGarbage']> { return unsupportedSessionState(); }
	deleteSessionStateGarbage(): ReturnType<IAgentHostSessionStateDatabase['deleteSessionStateGarbage']> { return unsupportedSessionState(); }
}
