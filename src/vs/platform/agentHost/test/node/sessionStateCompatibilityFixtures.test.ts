/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createTestSessionStateStore } from './chatMetadataTestHelpers.js';
import assert from 'assert';
import * as sinon from 'sinon';
import type { Database } from '@vscode/sqlite3';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { basename, join } from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { AgentHostDatabase } from '../../node/agentHostDatabase.js';
import { SESSION_CUSTOM_TITLE_KEY, SESSION_CUSTOM_TITLE_SOURCE_KEY } from '../../node/shared/persistSessionMetadata.js';
import { AgentHostPeerChatStore, type IPersistedPeerChat } from '../../node/agentHostPeerChatStore.js';
import { SessionDataService } from '../../node/sessionDataService.js';
import { FileService } from '../../../files/common/fileService.js';
import { CompatibleAgentHostDatabase } from '../../node/compatibleAgentHostDatabase.js';
import { migrateChatCatalogV2 } from '../../node/agentHostChatCatalogMigration.js';
import { createLiveChatOwnership } from './chatOwnershipTestUtils.js';
import { createLegacySessionFixture, editChatListAsOldBuild, InMemorySessionDataService, LEGACY_BUILDS, legacyPeerMetadata, legacySessionMetadata, normalizeLegacySessionFixture, readOldBuildView, reprojectLegacyFixturePayload, restorePeersAsOldBuild, writeLegacySessionState, type ILegacyChatFixture, type ILegacySessionFixture } from './sessionStateCompatibilityFixtures.js';
import { AH_META_IS_ARCHIVED_DB_KEY, buildChatUri, buildDefaultChatUri, ChatOriginKind } from '../../common/state/sessionState.js';
import { ChatInteractivity } from '../../common/state/protocol/state.js';

suite('Session state compatibility fixtures', () => {
	const store = new DisposableStore();
	let directory: string;

	setup(async () => directory = await mkdtemp(join(tmpdir(), 'ah-session-state-compat-')));
	teardown(async () => {
		store.clear();
		await rm(directory, { recursive: true, force: true });
	});
	ensureNoDisposablesAreLeakedInTestSuite();

	async function writeOldBuild(fixture: ILegacySessionFixture, sessionData: InMemorySessionDataService): Promise<void> {
		const oldBuild = store.add(new AgentHostDatabase(join(directory, 'agent-host.db')));
		await writeLegacySessionState(sessionData.createService(), oldBuild, fixture);
		await oldBuild.close();
	}

	/**
	 * A 1.143 fixture session converted to a normalized catalog whose older-build copy is published, as it is before
	 * a downgrade. Each {@link createStore} call is a fresh process's peer store.
	 */
	async function publishedNormalizedSession() {
		const fixture = createLegacySessionFixture('1.143');
		const sessionData = store.add(new InMemorySessionDataService());
		await writeOldBuild(fixture, sessionData);
		const today = store.add(new CompatibleAgentHostDatabase(join(directory, 'agent-host.db')));
		await today.initialize();
		const extra = await normalizeLegacySessionFixture(today.raw, fixture);
		const service = sessionData.createService(today.identity);
		const createStore = () => store.add(new AgentHostPeerChatStore(today, service, new NullLogService(), createLiveChatOwnership(() => undefined, () => undefined), createTestSessionStateStore(today, service)));
		const session = URI.parse(fixture.runtimeSession);
		const published = createStore();
		await published.reconcileOlderBuildCopy(session);
		const runtime = (uri: string) => today.identity.toRuntime(uri);
		const peers = async () => {
			const [snapshot] = await today.readCatalogSnapshot([fixture.runtimeSession]);
			return snapshot.chats.filter(chat => chat.order !== undefined && chat.chat !== snapshot.header?.defaultChatUri)
				.map(chat => ({ chat: chat.chat, archived: chat.archived, isRead: chat.isRead }));
		};
		const sessionChats = async () => {
			const sqlite = await (today.raw as unknown as { _ensureDatabase(): Promise<Database> })._ensureDatabase();
			return new Promise<Record<string, unknown>[]>((resolve, reject) => sqlite.all('SELECT * FROM session_chats WHERE session_uri = ? ORDER BY chat_order', [fixture.session], (error, rows) => error ? reject(error) : resolve(rows)));
		};
		return { fixture, sessionData, today, extra, createStore, session, runtime, peers, sessionChats };
	}

	for (const build of LEGACY_BUILDS) {
		test(`${build}: an old build reads back the state it wrote`, async () => {
			const fixture = createLegacySessionFixture(build);
			const sessionData = store.add(new InMemorySessionDataService());
			await writeOldBuild(fixture, sessionData);
			const oldBuild = store.add(new AgentHostDatabase(join(directory, 'agent-host.db')));
			const view = await readOldBuildView(sessionData.createService(), oldBuild, fixture);
			const [defaultChat, sameFolder, otherFolder] = fixture.chats;

			assert.deepStrictEqual({
				...view,
				agentHost: {
					...view.agentHost,
					chatCatalog: view.agentHost.chatCatalog && { ...view.agentHost.chatCatalog, chats: view.agentHost.chatCatalog.chats.map(chat => chat.chat) },
					catalogPayload: view.agentHost.catalogPayload?.chats.map(chat => [chat.uri, chat.kind]),
				},
			}, {
				sessionDb: legacySessionMetadata(fixture),
				peerDbs: { [sameFolder.uri]: legacyPeerMetadata(sameFolder), [otherFolder.uri]: legacyPeerMetadata(otherFolder) },
				drafts: { [defaultChat.uri]: 'Default chat draft', [sameFolder.uri]: 'Peer draft', [otherFolder.uri]: undefined },
				persistedTurns: [
					{ kind: 'failed', turnId: 'default-failed-1', chatUri: defaultChat.uri, anchorTurnId: 'default-turn-2' },
					{ kind: 'local', turnId: 'same-folder-local-1', chatUri: sameFolder.uri, anchorTurnId: 'same-folder-turn-1' },
					{ kind: 'failed', turnId: 'same-folder-failed-1', chatUri: sameFolder.uri, anchorTurnId: 'same-folder-turn-1' },
				],
				checkpointRefs: {
					'default-turn-1': 'refs/agents/fixture/checkpoints/turn/1',
					'default-turn-2': 'refs/agents/fixture/checkpoints/turn/2',
					'same-folder-turn-1': 'refs/agents/fixture/checkpoints/turn/3',
					'other-folder-turn-1': 'refs/agents/fixture/checkpoints/turn/4',
				},
				agentHost: {
					provider: 'copilotcli',
					chatCatalog: { revision: 1, legacyMirroredRevision: 1, chats: [sameFolder.uri, otherFolder.uri] },
					catalogPayload: [[defaultChat.uri, 'default'], [sameFolder.uri, 'peer'], [otherFolder.uri, 'peer']],
					sessionStorageIdentities: [{ key: 'sessionStorageIdentity:ahp-session:/fixture', value: JSON.stringify({ runtime: 'ahp-session:/fixture', storage: 'copilotcli:/fixture', provider: 'copilotcli' }) }],
					chatStorageIdentities: build === '2b' ? [
						{ runtime: sameFolder.runtimeUri, storage: sameFolder.uri },
						{ runtime: otherFolder.runtimeUri, storage: otherFolder.uri },
					] : [],
				},
			});
		});
	}

	for (const [build, historical, sessionWorkingDirectories] of [['1.143', false, true], ['2b', false, true], ['2b', true, true], ['2b', true, false]] as const) {
		test(`${build}${historical ? ' historical session' : ''}${sessionWorkingDirectories ? '' : ' without agentHost.sessionWorkingDirectories'}: today's build reads the old build's state in runtime spelling`, async () => {
			const fixture = createLegacySessionFixture(build, { historical, sessionWorkingDirectories });
			const sessionData = store.add(new InMemorySessionDataService());
			await writeOldBuild(fixture, sessionData);

			const today = store.add(new CompatibleAgentHostDatabase(join(directory, 'agent-host.db')));
			await today.initialize();
			const service = sessionData.createService(today.identity);
			const peers = new AgentHostPeerChatStore(today, service, new NullLogService(), createLiveChatOwnership(() => undefined, () => undefined), createTestSessionStateStore(today, service));
			const session = URI.parse(fixture.runtimeSession);
			const drafts: Record<string, string | undefined> = {};
			for (const chat of fixture.chats) {
				const reference = service.openDatabase(URI.parse(chat.isDefault ? fixture.runtimeSession : chat.runtimeUri));
				drafts[chat.runtimeUri] = (await reference.object.getChatDraft(URI.parse(chat.runtimeUri)))?.text;
				reference.dispose();
			}
			const [defaultChat, sameFolder, otherFolder] = fixture.chats;

			assert.deepStrictEqual({
				sessions: (await today.listSessionV2Registrations()).map(entry => entry.session),
				peers: (await peers.reconcileLegacy(session))?.map(entry => ({ uri: entry.uri, workingDirectories: entry.workingDirectories, providerData: entry.providerData })),
				drafts,
				databases: sessionData.resources,
			}, {
				sessions: [fixture.runtimeSession],
				peers: [
					{ uri: sameFolder.runtimeUri, workingDirectories: undefined, providerData: 'copilot-sdk-same-folder' },
					{ uri: otherFolder.runtimeUri, workingDirectories: ['file:///workspace/lib'], providerData: 'copilot-sdk-other-folder' },
				],
				// Older builds keep every chat's draft in the session db, so only the default chat's own database has one.
				drafts: { [defaultChat.runtimeUri]: 'Default chat draft', [sameFolder.runtimeUri]: undefined, [otherFolder.runtimeUri]: undefined },
				databases: [fixture.session, sameFolder.uri, otherFolder.uri].sort(),
			});
		});
	}
	for (const build of ['1.143', '2b'] as const) {
		test(`${build}: a normalized session publishes its peers' edits to what old builds read, never its private chats`, async () => {
			const fixture = createLegacySessionFixture(build);
			const sessionData = store.add(new InMemorySessionDataService());
			await writeOldBuild(fixture, sessionData);
			const today = store.add(new CompatibleAgentHostDatabase(join(directory, 'agent-host.db')));
			await today.initialize();
			const extra = await normalizeLegacySessionFixture(today.raw, fixture);
			const service = sessionData.createService(today.identity);
			const peers = new AgentHostPeerChatStore(today, service, new NullLogService(), createLiveChatOwnership(() => undefined, () => undefined), createTestSessionStateStore(today, service));
			const session = URI.parse(fixture.runtimeSession);
			const [, sameFolder, otherFolder] = fixture.chats;

			await peers.setArchived(session, URI.parse(sameFolder.runtimeUri), true);
			await peers.setRead(session, URI.parse(otherFolder.runtimeUri), false);
			await peers.flushCompatibilityPublishes(undefined, undefined);
			peers.dispose();

			const view = await readOldBuildView(sessionData.createService(), today.raw, fixture);
			const listed = (chat: ILegacyChatFixture, changes: { readonly isRead: boolean; readonly archived?: true }) => ({
				uri: chat.uri, ...changes, providerData: chat.providerData, origin: chat.origin,
				...(chat.inheritedTurnId !== undefined ? { inheritedTurnId: chat.inheritedTurnId } : {}),
				...(chat.pinnedWorkingDirectory ? { workingDirectories: chat.workingDirectories } : {}),
			});
			const catalog = view.agentHost.chatCatalog;
			assert.deepStrictEqual({
				peerChats: JSON.parse(view.sessionDb.peerChats),
				peerDbs: view.peerDbs,
				catalog: catalog && { acknowledged: catalog.legacyMirroredRevision === catalog.revision, chats: catalog.chats.map(chat => chat.chat) },
				copies: { movedInPeer: sessionData.resources.includes(extra.movedInPeer), sessionMovedPeer: sessionData.resources.includes(extra.sessionMovedPeer.chat) },
			}, {
				peerChats: [
					listed(sameFolder, { isRead: sameFolder.isRead, archived: true }),
					listed(otherFolder, { isRead: false }),
					{ uri: extra.movedInPeer, isRead: true },
					{ uri: extra.sessionMovedPeer.chat, isRead: true },
				],
				peerDbs: { [sameFolder.uri]: legacyPeerMetadata(sameFolder), [otherFolder.uri]: { ...legacyPeerMetadata(otherFolder), isRead: '' } },
				catalog: { acknowledged: true, chats: [sameFolder.uri, otherFolder.uri, extra.movedInPeer, extra.sessionMovedPeer.chat] },
				// Older builds read a peer's keys from the database at its URI: a peer stored elsewhere gets no copy there.
				copies: { movedInPeer: true, sessionMovedPeer: false },
			});
		});
	}

	test('a host stopped after a normalized write but before its publish leaves a consistent older-build copy: 1.141 does not revert the write', async () => {
		const fixture = createLegacySessionFixture('1.143');
		const sessionData = store.add(new InMemorySessionDataService());
		await writeOldBuild(fixture, sessionData);
		const today = store.add(new CompatibleAgentHostDatabase(join(directory, 'agent-host.db')));
		await today.initialize();
		await normalizeLegacySessionFixture(today.raw, fixture);
		const service = sessionData.createService(today.identity);
		const createStore = () => new AgentHostPeerChatStore(today, service, new NullLogService(), createLiveChatOwnership(() => undefined, () => undefined), createTestSessionStateStore(today, service));
		const session = URI.parse(fixture.runtimeSession);
		const [, sameFolder] = fixture.chats;
		const published = createStore();
		await published.setRead(session, URI.parse(sameFolder.runtimeUri), sameFolder.isRead);
		await published.flushCompatibilityPublishes(undefined, undefined);
		published.dispose();

		const interrupted = createStore();
		await interrupted.setArchived(session, URI.parse(sameFolder.runtimeUri), true);
		await interrupted.whenIdle();
		interrupted.dispose();

		const view = await readOldBuildView(sessionData.createService(), today.raw, fixture);
		const catalog = await today.raw.getSessionChatCatalog(fixture.session);
		const restored = await restorePeersAsOldBuild(sessionData.createService(), today.raw, fixture);
		assert.deepStrictEqual({
			acknowledgedPayloadIsPeerChats: catalog?.legacyMirroredPayload === view.sessionDb.peerChats,
			acknowledgedRevisionIsBehind: (catalog?.legacyMirroredRevision ?? 0) < (catalog?.revision ?? 0),
			sameFolderArchivedForOldBuild: restored.find(peer => peer.uri === sameFolder.uri)?.archived,
		}, {
			acknowledgedPayloadIsPeerChats: true,
			acknowledgedRevisionIsBehind: true,
			sameFolderArchivedForOldBuild: true,
		});
	});

	// 1.140 and 1.141 write session_chats, peerChats and its acknowledgement (probe 4a); no build writes only peerChats.
	for (const [build, writer] of [['1.143', 'centralCatalog'], ['2b', 'centralCatalog']] as const) {
		test(`${build}: a normalized session imports the chat list edits of an old build writing session_chats like 1.141`, async () => {
			const fixture = createLegacySessionFixture(build);
			const sessionData = store.add(new InMemorySessionDataService());
			await writeOldBuild(fixture, sessionData);
			const today = store.add(new CompatibleAgentHostDatabase(join(directory, 'agent-host.db')));
			await today.initialize();
			const extra = await normalizeLegacySessionFixture(today.raw, fixture);
			const service = sessionData.createService(today.identity);
			const createStore = () => new AgentHostPeerChatStore(today, service, new NullLogService(), createLiveChatOwnership(() => undefined, () => undefined), createTestSessionStateStore(today, service));
			const session = URI.parse(fixture.runtimeSession);
			// Another session records a chat the old build also lists in this one.
			const elsewhere = 'copilotcli:/elsewhere';
			const owned = buildChatUri(elsewhere, 'owned');
			await today.raw.registerRuntimeSession(elsewhere, { provider: 'copilotcli', startTime: 1, source: 'explicit' }, { checkTombstone: false });
			await today.raw.registerChatCatalogV2(elsewhere, { defaultChat: { chat: buildDefaultChatUri(elsewhere), order: 0 }, peers: [{ chat: owned, order: 1 }], privateDescendants: [] });
			// What a move or promotion runs first: the older-build copy is current when the build is downgraded.
			const published = createStore();
			await published.reconcileOlderBuildCopy(session);
			published.dispose();

			// Downgraded: the old build moves the moved-in peer first and marks it unread, archives two peers, deletes one and creates one.
			const [, sameFolder, otherFolder] = fixture.chats;
			const created = buildChatUri(fixture.session, 'created-by-old-build');
			await editChatListAsOldBuild(sessionData.createService(), today.raw, fixture, writer, peers => {
				const find = (uri: string) => peers.find(peer => peer.uri === uri)!;
				return [
					{ ...find(extra.movedInPeer), isRead: false },
					{ ...find(sameFolder.uri), archived: true },
					{ ...find(extra.sessionMovedPeer.chat), archived: true },
					{ uri: created, isRead: true, origin: { kind: ChatOriginKind.User } },
					{ uri: owned, isRead: true },
					// A chat the normalized catalog records as private: older builds never saw it, so it is not their addition.
					{ uri: extra.privateChat, isRead: true },
				];
			});
			// The old build deletes the removed peer's data folder (probe 4a).
			sessionData.remove(otherFolder.storage);

			const upgraded = createStore();
			const imported = await upgraded.reconcileLegacy(session);
			await upgraded.whenIdle();
			upgraded.dispose();
			const runtime = (uri: string) => today.identity.toRuntime(uri);
			const [snapshot] = await today.readCatalogSnapshot([fixture.runtimeSession]);
			const row = (uri: string) => snapshot.chats.find(chat => chat.chat === runtime(uri));
			const view = await readOldBuildView(sessionData.createService(), today.raw, fixture);
			const catalog = view.agentHost.chatCatalog;
			assert.deepStrictEqual({
				peers: imported?.map(peer => ({ uri: peer.uri, isRead: peer.isRead, archived: peer.archived })),
				privateChatKept: row(extra.privateChat) !== undefined,
				created: { storage: row(created)?.storageResource, origin: row(created)?.origin, metadata: row(created)?.metadata },
				// Recorded storage resolves to the folder the old build created for the chat.
				createdFolder: basename(new SessionDataService(URI.file('/data'), store.add(new FileService(new NullLogService())), new NullLogService(), undefined, today.identity).getSessionDataDir(URI.parse(row(created)!.storageResource!)).path),
				deleted: { tombstoned: (await today.findCentralChatOwners([otherFolder.runtimeUri])).get(otherFolder.runtimeUri)?.deleted, storageReopened: sessionData.resources.includes(otherFolder.storage) },
				sessionMovedStorage: row(extra.sessionMovedPeer.chat)?.storageResource,
				ownedBy: (await today.findCentralChatOwners([owned])).get(owned)?.ownerSession,
				republished: { peerChats: (JSON.parse(view.sessionDb.peerChats) as IPersistedPeerChat[]).map(peer => peer.uri), acknowledged: catalog?.legacyMirroredRevision === catalog?.revision },
			}, {
				peers: [
					{ uri: runtime(extra.movedInPeer), isRead: false, archived: false },
					{ uri: runtime(sameFolder.uri), isRead: sameFolder.isRead, archived: true },
					{ uri: runtime(extra.sessionMovedPeer.chat), isRead: true, archived: true },
					{ uri: runtime(created), isRead: true, archived: false },
				],
				privateChatKept: true,
				// A chat an old build created is stored where it put it, its own URI, recorded once at import.
				created: { storage: runtime(created), origin: JSON.stringify({ kind: ChatOriginKind.User }), metadata: { interactivity: ChatInteractivity.Full } },
				createdFolder: 'created-by-old-build-Y29waWxvdGNsaTovZml4dHVyZQ',
				deleted: { tombstoned: true, storageReopened: false },
				sessionMovedStorage: extra.sessionMovedPeer.storage,
				ownedBy: elsewhere,
				republished: { peerChats: [extra.movedInPeer, sameFolder.uri, extra.sessionMovedPeer.chat, created], acknowledged: true },
			});
		});
	}

	test('a peerChats-only old-build edit, then a normalized write: the deferred publish imports the edit instead of overwriting it', async () => {
		const { fixture, sessionData, today, createStore, session, peers } = await publishedNormalizedSession();
		const [, sameFolder, otherFolder] = fixture.chats;
		// A build that keeps the list only in peerChats (no release does; see the writer) changes one peer.
		await editChatListAsOldBuild(sessionData.createService(), today.raw, fixture, 'sessionDatabase', chats => chats.map(chat => chat.uri === sameFolder.uri ? { ...chat, providerData: 'old-build-provider', isRead: false } : chat));

		const upgraded = createStore();
		await upgraded.setArchived(session, URI.parse(otherFolder.runtimeUri), true);
		await upgraded.flushCompatibilityPublishes(undefined, undefined);
		const providerOf = async (chat: string) => (await upgraded.find(session, URI.parse(chat)))?.providerData;
		const view = await readOldBuildView(sessionData.createService(), today.raw, fixture);
		assert.deepStrictEqual({
			peers: (await peers()).slice(0, 2),
			providerData: [await providerOf(sameFolder.runtimeUri), await providerOf(otherFolder.runtimeUri)],
			copyAcknowledged: (await today.raw.getSessionChatCatalog(fixture.session))?.legacyMirroredPayload === view.sessionDb.peerChats,
		}, {
			peers: [
				{ chat: sameFolder.runtimeUri, archived: false, isRead: false },
				{ chat: otherFolder.runtimeUri, archived: true, isRead: otherFolder.isRead },
			],
			providerData: ['old-build-provider', otherFolder.providerData],
			copyAcknowledged: true,
		});
	});

	test('a copy this build wrote but stopped before acknowledging is just acknowledged, not imported', async () => {
		const { fixture, sessionData, today, createStore, session, peers } = await publishedNormalizedSession();
		const [, sameFolder] = fixture.chats;
		const acknowledged = await today.raw.getSessionChatCatalog(fixture.session);
		const writer = createStore();
		await writer.setArchived(session, URI.parse(sameFolder.runtimeUri), true);
		await writer.flushCompatibilityPublishes(undefined, undefined);
		// The publish wrote peerChats, then the host stopped before the acknowledgement: put the old one back.
		const sqlite = await (today.raw as unknown as { _ensureDatabase(): Promise<Database> })._ensureDatabase();
		await new Promise<void>((resolve, reject) => sqlite.run(`UPDATE session_chat_catalogs SET legacy_mirrored_revision = ? WHERE session_uri = ?`, [acknowledged!.legacyMirroredRevision, fixture.session], error => error ? reject(error) : resolve()));
		await new Promise<void>((resolve, reject) => sqlite.run(`UPDATE metadata SET value = ? WHERE key = ?`, [acknowledged!.legacyMirroredPayload, `sessionChatCatalogLegacyMirror:${fixture.session}`], error => error ? reject(error) : resolve()));
		const copy = (await readOldBuildView(sessionData.createService(), today.raw, fixture)).sessionDb.peerChats;
		const before = await peers();
		const sessionDatabase = sessionData.createService().openDatabase(URI.parse(fixture.session)).object;
		const rewrites = sinon.spy(sessionDatabase, 'setMetadata');

		const restarted = createStore();
		await restarted.reconcileOlderBuildCopy(session);
		const catalog = await today.raw.getSessionChatCatalog(fixture.session);
		assert.deepStrictEqual({
			unchanged: JSON.stringify(await peers()) === JSON.stringify(before),
			acknowledged: { current: catalog?.legacyMirroredRevision === catalog?.revision, payload: catalog?.legacyMirroredPayload === copy },
			copyRewrites: rewrites.callCount,
		}, { unchanged: true, acknowledged: { current: true, payload: true }, copyRewrites: 0 });
		rewrites.restore();
	});

	for (const build of ['1.143', '2b'] as const) {
		test(`${build}: converting a legacy compatibility session keeps an old build's pending edits and its provider-scheme address`, async () => {
			const fixture = createLegacySessionFixture(build);
			const sessionData = store.add(new InMemorySessionDataService());
			await writeOldBuild(fixture, sessionData);
			const today = store.add(new CompatibleAgentHostDatabase(join(directory, 'agent-host.db')));
			await today.initialize();
			const service = sessionData.createService(today.identity);
			const peers = new AgentHostPeerChatStore(today, service, new NullLogService(), createLiveChatOwnership(() => undefined, () => undefined), createTestSessionStateStore(today, service));
			const session = URI.parse(fixture.runtimeSession);
			const [, sameFolder, otherFolder] = fixture.chats;
			// Downgraded: the old build archives one peer and deletes the other before the upgrade converts the session.
			await editChatListAsOldBuild(sessionData.createService(), today.raw, fixture, 'centralCatalog', chats => chats
				.filter(chat => chat.uri !== otherFolder.uri)
				.map(chat => chat.uri === sameFolder.uri ? { ...chat, archived: true } : chat));

			// What the conversion batch runs: import the older build's edits, then convert. A payload that lags the
			// legacy list defers the conversion until catalog synchronization re-projects it.
			await peers.reconcileLegacy(session);
			const deferred = await migrateChatCatalogV2(today, service, session);
			await reprojectLegacyFixturePayload(sessionData.createService(), today.raw, fixture);
			const converted = await migrateChatCatalogV2(today, service, session);
			const [stored] = await today.raw.readCatalogSnapshot([fixture.session]);
			assert.deepStrictEqual({
				deferred: deferred.status,
				converted: converted.status,
				storedAt: stored?.session,
				authority: stored?.authorityVersion,
				peers: stored?.chats.filter(chat => chat.order !== undefined && chat.chat !== stored.header?.defaultChatUri).map(chat => ({ chat: chat.chat, archived: chat.archived })),
			}, {
				deferred: 'notReady',
				converted: 'applied',
				storedAt: fixture.session,
				authority: 2,
				peers: [{ chat: sameFolder.uri, archived: true }],
			});
		});
	}

	for (const write of ['archive', 'rename'] as const) {
		test(`after a restart, a normalized ${write} with no open in between first imports what an old build changed`, async () => {
			const { fixture, sessionData, today, extra, createStore, session, runtime, peers } = await publishedNormalizedSession();
			const [, sameFolder, otherFolder] = fixture.chats;
			await editChatListAsOldBuild(sessionData.createService(), today.raw, fixture, 'centralCatalog', chats => chats
				.filter(chat => chat.uri !== otherFolder.uri)
				.map(chat => chat.uri === sameFolder.uri ? { ...chat, archived: true } : chat));

			const restarted = createStore();
			const movedIn = URI.parse(runtime(extra.movedInPeer));
			if (write === 'archive') {
				await restarted.setArchived(session, movedIn, true);
			} else {
				await restarted.persistMetadata(session, movedIn, { [SESSION_CUSTOM_TITLE_KEY]: 'Renamed after the downgrade' });
			}
			await restarted.whenIdle();
			assert.deepStrictEqual(await peers(), [
				{ chat: sameFolder.runtimeUri, archived: true, isRead: sameFolder.isRead },
				{ chat: runtime(extra.movedInPeer), archived: write === 'archive', isRead: true },
				{ chat: runtime(extra.sessionMovedPeer.chat), archived: false, isRead: true },
			]);
		});
	}

	for (const write of ['create', 'archive', 'archive through metadata'] as const) {
		test(`a ${write} after an older build edited a session this process already imported is refused, imports the edit and retries`, async () => {
			const { fixture, sessionData, today, extra, createStore, session, runtime, peers } = await publishedNormalizedSession();
			const [, sameFolder, otherFolder] = fixture.chats;
			const running = createStore();
			await running.reconcileOlderBuildCopy(session);
			// Another process (an older build sharing the data) edits the list while this one runs.
			await editChatListAsOldBuild(sessionData.createService(), today.raw, fixture, 'centralCatalog', chats => chats
				.filter(chat => chat.uri !== otherFolder.uri)
				.map(chat => chat.uri === sameFolder.uri ? { ...chat, archived: true } : chat));
			const movedIn = URI.parse(runtime(extra.movedInPeer));
			const added = URI.parse(buildChatUri(fixture.runtimeSession, 'added-after'));
			if (write === 'create') {
				await running.upsert(session, added, 'added-provider');
			} else if (write === 'archive') {
				await running.setArchived(session, movedIn, true);
			} else {
				await running.persistMetadata(session, movedIn, { [AH_META_IS_ARCHIVED_DB_KEY]: 'true' });
			}
			await running.whenIdle();
			assert.deepStrictEqual(await peers(), [
				{ chat: sameFolder.runtimeUri, archived: true, isRead: sameFolder.isRead },
				{ chat: movedIn.toString(), archived: write !== 'create', isRead: true },
				{ chat: runtime(extra.sessionMovedPeer.chat), archived: false, isRead: true },
				...(write === 'create' ? [{ chat: added.toString(), archived: false, isRead: undefined }] : []),
			]);
		});
	}

	test('the 1.141 writer advances the revision and leaves the projection marker, and runs against a version 19 database', async () => {
		const { fixture, sessionData, today } = await publishedNormalizedSession();
		const sqlite = await (today.raw as unknown as { _ensureDatabase(): Promise<Database> })._ensureDatabase();
		const header = () => new Promise<Record<string, unknown>>((resolve, reject) => sqlite.get('SELECT revision, projected_revision, (SELECT user_version FROM pragma_user_version) AS version FROM session_chat_catalogs WHERE session_uri = ?', [fixture.session], (error, row) => error ? reject(error) : resolve(row as Record<string, unknown>)));
		const before = await header();
		await editChatListAsOldBuild(sessionData.createService(), today.raw, fixture, 'centralCatalog', chats => chats.slice(1));
		const after = await header();
		assert.deepStrictEqual({ before, after }, {
			before: { revision: before.revision, projected_revision: before.revision, version: 19 },
			after: { revision: (before.revision as number) + 1, projected_revision: before.revision, version: 19 },
		});
	});

	for (const first of ['import', 'write'] as const) {
		test(`the startup batch racing a normalized write (${first} queued first) imports an old build's edits once and keeps the write`, async () => {
			const { fixture, sessionData, today, extra, createStore, session, runtime, peers } = await publishedNormalizedSession();
			const [, sameFolder, otherFolder] = fixture.chats;
			await editChatListAsOldBuild(sessionData.createService(), today.raw, fixture, 'centralCatalog', chats => chats
				.filter(chat => chat.uri !== otherFolder.uri)
				.map(chat => chat.uri === sameFolder.uri ? { ...chat, archived: true } : chat));

			const restarted = createStore();
			// The conversion batch's per-session step for an already normalized catalog is `reconcileLegacy`.
			const batch = () => restarted.reconcileLegacy(session);
			const write = () => restarted.setRead(session, URI.parse(runtime(extra.movedInPeer)), false);
			await Promise.all(first === 'import' ? [batch(), write()] : [write(), batch()]);
			await restarted.whenIdle();
			assert.deepStrictEqual(await peers(), [
				{ chat: sameFolder.runtimeUri, archived: true, isRead: sameFolder.isRead },
				{ chat: runtime(extra.movedInPeer), archived: false, isRead: false },
				{ chat: runtime(extra.sessionMovedPeer.chat), archived: false, isRead: true },
			]);
		});
	}

	for (const cause of ['a normalized write stopped before its projection', 'a projection this build changed']) {
		test(`a chat list difference from ${cause} is re-projected: no chat is dropped, duplicated or resurrected`, async () => {
			const { fixture, today, extra, createStore, session, runtime, peers, sessionChats } = await publishedNormalizedSession();
			const [, sameFolder, otherFolder] = fixture.chats;
			const sqlite = await (today.raw as unknown as { _ensureDatabase(): Promise<Database> })._ensureDatabase();
			const run = (sql: string, parameters: readonly unknown[]) => new Promise<void>((resolve, reject) => sqlite.run(sql, parameters, error => error ? reject(error) : resolve()));
			const created = buildChatUri(fixture.runtimeSession, 'created-by-normalized-write');
			if (cause === 'a projection this build changed') {
				// session_chats as a projection that hid the moved-in peer left it, at the revision this build published.
				await run('DELETE FROM session_chats WHERE chat_uri = ?', [extra.movedInPeer]);
			} else {
				// A normalized write (archive, delete, create) whose session_chats projection never happened.
				const stale = await sessionChats();
				const catalog = await today.getSessionChatCatalog(fixture.runtimeSession);
				const written = await today.replaceSessionChatCatalog(fixture.runtimeSession, [
					...catalog!.chats.filter(chat => chat.chat !== otherFolder.runtimeUri).map(chat => chat.chat === sameFolder.runtimeUri ? { ...chat, archived: true } : chat),
					{ chat: created, order: catalog!.chats.length, isRead: true },
				].map((chat, order) => ({ ...chat, order })), catalog!.revision);
				assert.strictEqual(written.status, 'applied');
				await run('DELETE FROM session_chats WHERE session_uri = ?', [fixture.session]);
				for (const row of stale) {
					await run(`INSERT INTO session_chats (session_uri, chat_uri, chat_order, is_read, archived, provider_data, origin, inherited_turn_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
						[row.session_uri, row.chat_uri, row.chat_order, row.is_read, row.archived, row.provider_data, row.origin, row.inherited_turn_id]);
				}
			}
			const before = await peers();

			const restarted = createStore();
			await restarted.reconcileLegacy(session);
			await restarted.whenIdle();
			assert.deepStrictEqual({
				unchanged: JSON.stringify(await peers()) === JSON.stringify(before),
				reprojected: (await today.readOlderBuildCopyState(fixture.runtimeSession))?.hasOlderBuildEdits,
				peers: (await peers()).map(peer => peer.chat),
			}, {
				unchanged: true,
				reprojected: false,
				peers: cause === 'a projection this build changed'
					? [sameFolder.runtimeUri, otherFolder.runtimeUri, runtime(extra.movedInPeer), runtime(extra.sessionMovedPeer.chat)]
					: [sameFolder.runtimeUri, runtime(extra.movedInPeer), runtime(extra.sessionMovedPeer.chat), created],
			});
		});
	}

	test('a converted session that had a legacy peerChats copy keeps it current, down to an empty list', async () => {
		const { fixture, sessionData, today, extra, createStore, session, runtime } = await publishedNormalizedSession();
		const writer = createStore();
		for (const peer of [...fixture.chats.slice(1).map(chat => chat.runtimeUri), runtime(extra.movedInPeer), runtime(extra.sessionMovedPeer.chat)]) {
			await writer.remove(session, URI.parse(peer));
		}
		await writer.flushCompatibilityPublishes(undefined, undefined);
		const catalog = await today.raw.getSessionChatCatalog(fixture.session);
		assert.deepStrictEqual({
			peerChats: (await readOldBuildView(sessionData.createService(), today.raw, fixture)).sessionDb.peerChats,
			acknowledged: catalog?.legacyMirroredPayload,
		}, { peerChats: '[]', acknowledged: '[]' });
	});

	test('a normalized session\'s title and default-chat read changes write only main\'s keys to the databases old builds read, and never import their title edits', async () => {
		const sessionData = store.add(new InMemorySessionDataService());
		const today = store.add(new CompatibleAgentHostDatabase(join(directory, 'agent-host.db')));
		await today.initialize();
		const service = sessionData.createService(today.identity);
		const peers = new AgentHostPeerChatStore(today, service, new NullLogService(), createLiveChatOwnership(() => undefined, () => undefined), createTestSessionStateStore(today, service));
		const sessionKey = 'ahp-session:/normalized';
		const defaultChat = 'ahp-chat://default/c2Vzc2lvbjovL2Vsc2V3aGVyZQ';
		const peerChat = 'ahp-chat://peer/c2Vzc2lvbjovL2Vsc2V3aGVyZQ';
		await today.registerRuntimeSession(sessionKey, { provider: 'copilot', startTime: 1, source: 'explicit' }, { checkTombstone: false });
		const registered = await today.registerChatCatalogV2(sessionKey, {
			defaultChat: { chat: defaultChat, order: 0, metadata: { summary: 'Default title' } },
			peers: [{ chat: peerChat, order: 1, origin: '{"kind":"subagent"}', inheritedTurnId: 'turn-1', providerData: 'sdk-peer', workingDirectories: ['file:///workspace/lib'], metadata: { summary: 'Peer title', titleSource: 'user' } }],
			privateDescendants: [],
		});
		assert.strictEqual(registered.status, 'applied');
		const session = URI.parse(sessionKey);
		const read = async (resource: string, keys: readonly string[]) => {
			const reference = service.openDatabase(URI.parse(resource));
			try {
				return await reference.object.getMetadataObject(Object.fromEntries(keys.map(key => [key, true])));
			} finally {
				reference.dispose();
			}
		};
		const peerKeys = [SESSION_CUSTOM_TITLE_KEY, SESSION_CUSTOM_TITLE_SOURCE_KEY, 'agentHost.chatWorkingDirectories'];

		await peers.persistMetadata(session, URI.parse(peerChat), { [SESSION_CUSTOM_TITLE_KEY]: 'Renamed peer' });
		await peers.persistMetadata(session, session, { defaultChatIsRead: 'true' });

		const sessionView = await read(sessionKey, ['peerChats', 'defaultChatIsRead', SESSION_CUSTOM_TITLE_KEY]);
		const [catalog] = await today.readCatalogSnapshot([sessionKey]);
		assert.deepStrictEqual({
			peerChats: sessionView.peerChats,
			defaultChatIsRead: sessionView.defaultChatIsRead,
			defaultTitle: sessionView[SESSION_CUSTOM_TITLE_KEY],
			catalogDefaultIsRead: catalog.chats.find(chat => chat.chat === defaultChat)?.isRead,
			peerDb: await read(peerChat, peerKeys),
		}, {
			// Titles and the default chat's read state are not part of a chats_v2 session's older-build copy, so they publish no `peerChats` mirror.
			peerChats: undefined,
			// As on main, a normalized chat's read state and title live in its catalog: the peer store writes neither into the session database.
			defaultChatIsRead: undefined,
			defaultTitle: undefined,
			catalogDefaultIsRead: true,
			// A title change writes nothing into a chats_v2 peer's own db, whose working directories are written only when they change.
			peerDb: {
				[SESSION_CUSTOM_TITLE_KEY]: undefined,
				[SESSION_CUSTOM_TITLE_SOURCE_KEY]: undefined,
				'agentHost.chatWorkingDirectories': undefined,
			},
		});

		// An old build's edit of a peer's title is not imported over the normalized catalog.
		const reference = service.openDatabase(URI.parse(peerChat));
		await reference.object.setMetadata(SESSION_CUSTOM_TITLE_KEY, 'Old build title');
		reference.dispose();
		const [snapshot] = await today.readCatalogSnapshot([sessionKey]);
		assert.strictEqual(snapshot.chats.find(chat => chat.chat === peerChat)?.metadata?.summary, 'Renamed peer');
	});
});
