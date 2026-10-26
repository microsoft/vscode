/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, markAsSingleton, toDisposable } from '../../../../base/common/lifecycle.js';
import type { URI } from '../../../../base/common/uri.js';
import { NullLogService } from '../../../log/common/log.js';
import type { IAgentHostChatRowStore } from '../../common/agentHostSessionStateStore.js';
import { AgentHostSessionStateStore } from '../../node/agentHostSessionStateStore.js';
import type { ISessionDataService } from '../../common/sessionDataService.js';
import type { IAgentHostPeerChatPersistenceService } from '../../node/agentHostPeerChatStore.js';
import { AgentHostDatabase, IAgentHostDatabase, IAgentHostDatabaseChatOwner, IAgentHostDatabaseSession, IAgentHostDatabaseSessionListCatalog, IAgentHostDatabaseSessionRegistrations } from '../../node/agentHostDatabase.js';
import { type ISessionAdditionalWorktree, readSessionAdditionalWorktrees, writeSessionAdditionalWorktrees } from '../../node/shared/sessionAdditionalWorktrees.js';
import { chatCatalogV2ToCatalogChats } from '../../node/agentHostCatalogSourceResolver.js';
import { decodeAgentHostCatalogPayload } from '../../node/agentHostCatalogProjection.js';
import type { IAgentHostSessionStateDatabase } from '../../node/agentHostSessionStateDatabase.js';
import type { IAgentHostScratchFolderDatabase } from '../../node/agentHostScratchFolderDatabase.js';
import type { IAgentHostWorktreeRemovalDatabase } from '../../node/agentHostWorktreeRemovalDatabase.js';
import { AgentHostWorktreeCleanupService } from '../../node/agentHostWorktreeCleanupService.js';
import type { IAgentHostWorktreeIsolation } from '../../node/shared/worktreeIsolation.js';
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

/**
 * Base for database fakes: central session state and pending worktree removals are held by a private
 * in-memory database, the rest of the fake keeps its own catalog bookkeeping.
 */
const liveSessionStateDatabases = new Set<SessionStateUnsupportedDatabase>();

/** Releases every {@link SessionStateUnsupportedDatabase} still alive; for the teardown of suites that create them. */
export function disposeTestSessionStateDatabases(): void {
	for (const database of [...liveSessionStateDatabases]) {
		database.dispose();
	}
}

export abstract class SessionStateUnsupportedDatabase implements IAgentHostSessionStateDatabase, IAgentHostWorktreeRemovalDatabase, IAgentHostScratchFolderDatabase {
	private _sessionStateDatabase: IAgentHostDatabase | undefined;

	private get _sessionState(): IAgentHostDatabase {
		return this._sessionStateDatabase ??= new AgentHostDatabase(':memory:');
	}

	constructor() {
		liveSessionStateDatabases.add(this);
	}

	/**
	 * A no-op: the fake stands for a durable database that tests reuse across a simulated host restart, whose
	 * shutdown closes it. {@link dispose} releases its connection.
	 */
	async close(): Promise<void> { }

	/** Releases the private session state database; derived fakes inherit this as their own teardown. */
	dispose(): void {
		liveSessionStateDatabases.delete(this);
		this._sessionStateDatabase?.dispose();
		this._sessionStateDatabase = undefined;
	}

	readSessionState(...args: Parameters<IAgentHostSessionStateDatabase['readSessionState']>): ReturnType<IAgentHostSessionStateDatabase['readSessionState']> { return this._sessionState.readSessionState(...args); }
	getWorktreeDiskUsageRevision(...args: Parameters<IAgentHostDatabase['getWorktreeDiskUsageRevision']>): ReturnType<IAgentHostDatabase['getWorktreeDiskUsageRevision']> { return this._sessionState.getWorktreeDiskUsageRevision(...args); }
	readWorktreeDiskUsage(...args: Parameters<IAgentHostDatabase['readWorktreeDiskUsage']>): ReturnType<IAgentHostDatabase['readWorktreeDiskUsage']> { return this._sessionState.readWorktreeDiskUsage(...args); }
	writeWorktreeDiskUsage(...args: Parameters<IAgentHostDatabase['writeWorktreeDiskUsage']>): ReturnType<IAgentHostDatabase['writeWorktreeDiskUsage']> { return this._sessionState.writeWorktreeDiskUsage(...args); }
	deleteWorktreeDiskUsage(...args: Parameters<IAgentHostDatabase['deleteWorktreeDiskUsage']>): ReturnType<IAgentHostDatabase['deleteWorktreeDiskUsage']> { return this._sessionState.deleteWorktreeDiskUsage(...args); }
	readSessionStateValues(...args: Parameters<IAgentHostSessionStateDatabase['readSessionStateValues']>): ReturnType<IAgentHostSessionStateDatabase['readSessionStateValues']> { return this._sessionState.readSessionStateValues(...args); }
	importSessionState(...args: Parameters<IAgentHostSessionStateDatabase['importSessionState']>): ReturnType<IAgentHostSessionStateDatabase['importSessionState']> { return this._sessionState.importSessionState(...args); }
	writeSessionState(...args: Parameters<IAgentHostSessionStateDatabase['writeSessionState']>): ReturnType<IAgentHostSessionStateDatabase['writeSessionState']> { return this._sessionState.writeSessionState(...args); }
	markSessionStateLegacyMirrored(...args: Parameters<IAgentHostSessionStateDatabase['markSessionStateLegacyMirrored']>): ReturnType<IAgentHostSessionStateDatabase['markSessionStateLegacyMirrored']> { return this._sessionState.markSessionStateLegacyMirrored(...args); }
	recordSessionStateLegacyMirrorPayload(...args: Parameters<IAgentHostSessionStateDatabase['recordSessionStateLegacyMirrorPayload']>): ReturnType<IAgentHostSessionStateDatabase['recordSessionStateLegacyMirrorPayload']> { return this._sessionState.recordSessionStateLegacyMirrorPayload(...args); }
	bumpSessionStateRowsRevision(...args: Parameters<IAgentHostSessionStateDatabase['bumpSessionStateRowsRevision']>): ReturnType<IAgentHostSessionStateDatabase['bumpSessionStateRowsRevision']> { return this._sessionState.bumpSessionStateRowsRevision(...args); }
	markSessionStateRowsMirrored(...args: Parameters<IAgentHostSessionStateDatabase['markSessionStateRowsMirrored']>): ReturnType<IAgentHostSessionStateDatabase['markSessionStateRowsMirrored']> { return this._sessionState.markSessionStateRowsMirrored(...args); }
	markSessionStateLaunchDirsBackfilled(...args: Parameters<IAgentHostSessionStateDatabase['markSessionStateLaunchDirsBackfilled']>): ReturnType<IAgentHostSessionStateDatabase['markSessionStateLaunchDirsBackfilled']> { return this._sessionState.markSessionStateLaunchDirsBackfilled(...args); }
	markSessionStateRowsMoved(...args: Parameters<IAgentHostSessionStateDatabase['markSessionStateRowsMoved']>): ReturnType<IAgentHostSessionStateDatabase['markSessionStateRowsMoved']> { return this._sessionState.markSessionStateRowsMoved(...args); }
	readChatRowMirror(...args: Parameters<IAgentHostSessionStateDatabase['readChatRowMirror']>): ReturnType<IAgentHostSessionStateDatabase['readChatRowMirror']> { return this._sessionState.readChatRowMirror(...args); }
	writeChatRowMirror(...args: Parameters<IAgentHostSessionStateDatabase['writeChatRowMirror']>): ReturnType<IAgentHostSessionStateDatabase['writeChatRowMirror']> { return this._sessionState.writeChatRowMirror(...args); }
	deleteSessionChatState(...args: Parameters<IAgentHostSessionStateDatabase['deleteSessionChatState']>): ReturnType<IAgentHostSessionStateDatabase['deleteSessionChatState']> { return this._sessionState.deleteSessionChatState(...args); }
	countStorageReferences(...args: Parameters<IAgentHostSessionStateDatabase['countStorageReferences']>): ReturnType<IAgentHostSessionStateDatabase['countStorageReferences']> { return this._sessionState.countStorageReferences(...args); }
	listSessionStateGarbage(...args: Parameters<IAgentHostSessionStateDatabase['listSessionStateGarbage']>): ReturnType<IAgentHostSessionStateDatabase['listSessionStateGarbage']> { return this._sessionState.listSessionStateGarbage(...args); }
	deleteSessionStateGarbage(...args: Parameters<IAgentHostSessionStateDatabase['deleteSessionStateGarbage']>): ReturnType<IAgentHostSessionStateDatabase['deleteSessionStateGarbage']> { return this._sessionState.deleteSessionStateGarbage(...args); }
	upsertPendingWorktreeRemoval(...args: Parameters<IAgentHostWorktreeRemovalDatabase['upsertPendingWorktreeRemoval']>): ReturnType<IAgentHostWorktreeRemovalDatabase['upsertPendingWorktreeRemoval']> { return this._sessionState.upsertPendingWorktreeRemoval(...args); }
	deletePendingWorktreeRemoval(...args: Parameters<IAgentHostWorktreeRemovalDatabase['deletePendingWorktreeRemoval']>): ReturnType<IAgentHostWorktreeRemovalDatabase['deletePendingWorktreeRemoval']> { return this._sessionState.deletePendingWorktreeRemoval(...args); }
	readPendingWorktreeRemoval(...args: Parameters<IAgentHostWorktreeRemovalDatabase['readPendingWorktreeRemoval']>): ReturnType<IAgentHostWorktreeRemovalDatabase['readPendingWorktreeRemoval']> { return this._sessionState.readPendingWorktreeRemoval(...args); }
	listPendingWorktreeRemovals(...args: Parameters<IAgentHostWorktreeRemovalDatabase['listPendingWorktreeRemovals']>): ReturnType<IAgentHostWorktreeRemovalDatabase['listPendingWorktreeRemovals']> { return this._sessionState.listPendingWorktreeRemovals(...args); }
	recordPendingWorktreeRemovalFailure(...args: Parameters<IAgentHostWorktreeRemovalDatabase['recordPendingWorktreeRemovalFailure']>): ReturnType<IAgentHostWorktreeRemovalDatabase['recordPendingWorktreeRemovalFailure']> { return this._sessionState.recordPendingWorktreeRemovalFailure(...args); }
	isWorktreeInUse(...args: Parameters<IAgentHostWorktreeRemovalDatabase['isWorktreeInUse']>): ReturnType<IAgentHostWorktreeRemovalDatabase['isWorktreeInUse']> { return this._sessionState.isWorktreeInUse(...args); }
	readSessionArchived(...args: Parameters<IAgentHostWorktreeRemovalDatabase['readSessionArchived']>): ReturnType<IAgentHostWorktreeRemovalDatabase['readSessionArchived']> { return this._sessionState.readSessionArchived(...args); }
	listWorktreeCoOwnersOfSession(...args: Parameters<IAgentHostWorktreeRemovalDatabase['listWorktreeCoOwnersOfSession']>): ReturnType<IAgentHostWorktreeRemovalDatabase['listWorktreeCoOwnersOfSession']> { return this._sessionState.listWorktreeCoOwnersOfSession(...args); }
	readWorktreeCoOwners(...args: Parameters<IAgentHostWorktreeRemovalDatabase['readWorktreeCoOwners']>): ReturnType<IAgentHostWorktreeRemovalDatabase['readWorktreeCoOwners']> { return this._sessionState.readWorktreeCoOwners(...args); }
	pruneWorktreeCoOwners(...args: Parameters<IAgentHostWorktreeRemovalDatabase['pruneWorktreeCoOwners']>): ReturnType<IAgentHostWorktreeRemovalDatabase['pruneWorktreeCoOwners']> { return this._sessionState.pruneWorktreeCoOwners(...args); }
	findAdditionalWorktreeOwners(...args: Parameters<IAgentHostWorktreeRemovalDatabase['findAdditionalWorktreeOwners']>): ReturnType<IAgentHostWorktreeRemovalDatabase['findAdditionalWorktreeOwners']> { return this._sessionState.findAdditionalWorktreeOwners(...args); }
	isSessionLive(...args: Parameters<IAgentHostWorktreeRemovalDatabase['isSessionLive']>): ReturnType<IAgentHostWorktreeRemovalDatabase['isSessionLive']> { return this._sessionState.isSessionLive(...args); }
	pruneDeletedWorktreeCoOwners(...args: Parameters<IAgentHostWorktreeRemovalDatabase['pruneDeletedWorktreeCoOwners']>): ReturnType<IAgentHostWorktreeRemovalDatabase['pruneDeletedWorktreeCoOwners']> { return this._sessionState.pruneDeletedWorktreeCoOwners(...args); }
	clearStaleWorktreeCoOwners(...args: Parameters<IAgentHostWorktreeRemovalDatabase['clearStaleWorktreeCoOwners']>): ReturnType<IAgentHostWorktreeRemovalDatabase['clearStaleWorktreeCoOwners']> { return this._sessionState.clearStaleWorktreeCoOwners(...args); }
	insertScratchFolder(...args: Parameters<IAgentHostScratchFolderDatabase['insertScratchFolder']>): ReturnType<IAgentHostScratchFolderDatabase['insertScratchFolder']> { return this._sessionState.insertScratchFolder(...args); }
	markScratchFolderOwned(...args: Parameters<IAgentHostScratchFolderDatabase['markScratchFolderOwned']>): ReturnType<IAgentHostScratchFolderDatabase['markScratchFolderOwned']> { return this._sessionState.markScratchFolderOwned(...args); }
	markScratchFolderRemoving(...args: Parameters<IAgentHostScratchFolderDatabase['markScratchFolderRemoving']>): ReturnType<IAgentHostScratchFolderDatabase['markScratchFolderRemoving']> { return this._sessionState.markScratchFolderRemoving(...args); }
	listScratchFolders(...args: Parameters<IAgentHostScratchFolderDatabase['listScratchFolders']>): ReturnType<IAgentHostScratchFolderDatabase['listScratchFolders']> { return this._sessionState.listScratchFolders(...args); }
	hasScratchFolder(...args: Parameters<IAgentHostScratchFolderDatabase['hasScratchFolder']>): ReturnType<IAgentHostScratchFolderDatabase['hasScratchFolder']> { return this._sessionState.hasScratchFolder(...args); }
	recordScratchFolderRemovalFailure(...args: Parameters<IAgentHostScratchFolderDatabase['recordScratchFolderRemovalFailure']>): ReturnType<IAgentHostScratchFolderDatabase['recordScratchFolderRemovalFailure']> { return this._sessionState.recordScratchFolderRemovalFailure(...args); }
	deleteScratchFolder(...args: Parameters<IAgentHostScratchFolderDatabase['deleteScratchFolder']>): ReturnType<IAgentHostScratchFolderDatabase['deleteScratchFolder']> { return this._sessionState.deleteScratchFolder(...args); }
	isScratchFolderInUse(...args: Parameters<IAgentHostScratchFolderDatabase['isScratchFolderInUse']>): ReturnType<IAgentHostScratchFolderDatabase['isScratchFolderInUse']> { return this._sessionState.isScratchFolderInUse(...args); }
	markOrphanedScratchFolderRemoving(...args: Parameters<IAgentHostScratchFolderDatabase['markOrphanedScratchFolderRemoving']>): ReturnType<IAgentHostScratchFolderDatabase['markOrphanedScratchFolderRemoving']> { return this._sessionState.markOrphanedScratchFolderRemoving(...args); }
}

/** A real session state store over `database` and `service`, outside the leak check. */
export function createTestSessionStateStore(database: IAgentHostDatabase, service: ISessionDataService): AgentHostSessionStateStore {
	return markAsSingleton(new AgentHostSessionStateStore(0, database, service, new NullLogService()));
}

/** A real worktree clean-up service over `worktree` and a private in-memory agent-host.db. */
export function createTestWorktreeCleanupService(disposables: Pick<DisposableStore, 'add'>, worktree: IAgentHostWorktreeIsolation, database: IAgentHostDatabase = disposables.add(new AgentHostDatabase(':memory:'))): AgentHostWorktreeCleanupService {
	return disposables.add(new AgentHostWorktreeCleanupService(undefined, database, worktree, new NullLogService()));
}

/** The chat rows of a real session state store over `service`; the store and its database are released with `disposables`. */
export function createTestChatRows(service: ISessionDataService, disposables: Pick<DisposableStore, 'add'>): IAgentHostChatRowStore {
	const database = new AgentHostDatabase(':memory:');
	const store = createTestSessionStateStore(database, service);
	disposables.add(toDisposable(() => {
		store.dispose();
		database.dispose();
	}));
	return store.chatRows;
}

/** Seeds a session's additional worktrees through a throwaway store over `service`'s session database. */
export async function seedSessionAdditionalWorktrees(service: ISessionDataService, session: URI, worktrees: readonly ISessionAdditionalWorktree[]): Promise<void> {
	const database = new AgentHostDatabase(':memory:');
	const store = createTestSessionStateStore(database, service);
	try {
		await writeSessionAdditionalWorktrees(store, session, worktrees);
	} finally {
		store.dispose();
		await database.close();
	}
}

/** Reads a session's additional worktrees through a throwaway store over `service` (no central state: its session database). */
export async function readTestSessionAdditionalWorktrees(service: ISessionDataService, session: URI): Promise<readonly ISessionAdditionalWorktree[]> {
	const database = new AgentHostDatabase(':memory:');
	const store = createTestSessionStateStore(database, service);
	try {
		return await readSessionAdditionalWorktrees(store, session);
	} finally {
		store.dispose();
		await database.close();
	}
}
