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
import { AgentHostDatabase, AGENT_HOST_CATALOG_SNAPSHOT_SESSION_LIMIT } from '../../node/agentHostDatabase.js';
import { SESSION_CUSTOM_TITLE_KEY, SESSION_CUSTOM_TITLE_SOURCE_KEY } from '../../node/shared/persistSessionMetadata.js';
import { AgentHostPeerChatStore, type IPersistedPeerChat } from '../../node/agentHostPeerChatStore.js';
import { SessionDataService } from '../../node/sessionDataService.js';
import { FileService } from '../../../files/common/fileService.js';
import { CompatibleAgentHostDatabase } from '../../node/compatibleAgentHostDatabase.js';
import { migrateChatCatalogV2 } from '../../node/agentHostChatCatalogMigration.js';
import { createLiveChatOwnership } from './chatOwnershipTestUtils.js';
import { createLegacySessionFixture, editChatListAsOldBuild, editChatStateAsOldBuild, InMemorySessionDataService, moveChatAsBlock4, LEGACY_BUILDS, legacyPeerMetadata, legacySessionMetadata, normalizeLegacySessionFixture, readOldBuildView, remirrorChatListAsOldBuildAtQuit, reprojectLegacyFixturePayload, restorePeersAsOldBuild, writeLegacySessionState, type ILegacyChatFixture, type ILegacySessionFixture } from './sessionStateCompatibilityFixtures.js';
import { AH_META_IS_ARCHIVED_DB_KEY, buildChatUri, buildDefaultChatUri, ChatOriginKind, MessageKind } from '../../common/state/sessionState.js';
import { ChatInteractivity } from '../../common/state/protocol/state.js';

suite('Session state compatibility fixtures', () => {
	const store = new DisposableStore();
	let directory: string;

	setup(async () => directory = await mkdtemp(join(tmpdir(), 'ah-session-state-compat-')));
	teardown(async () => {
		sinon.restore();
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

			// Downgraded: the old build lists the moved-in peer first (no build can reorder chats: not imported) and marks it unread, archives two peers, deletes one and creates one.
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
					{ uri: runtime(sameFolder.uri), isRead: sameFolder.isRead, archived: true },
					{ uri: runtime(extra.movedInPeer), isRead: false, archived: false },
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
				republished: { peerChats: [sameFolder.uri, extra.movedInPeer, extra.sessionMovedPeer.chat, created], acknowledged: true },
			});
		});
	}

	suite('what older builds drop by merely opening a session is no edit', () => {
		/** Drops `archived` (1.141 and 1.140) and, like 1.140, `is_read` from an older build's entry. */
		function opened(build: '1.141' | '1.140') {
			return ({ archived: _archived, isRead, ...rest }: IPersistedPeerChat): IPersistedPeerChat => build === '1.140' ? rest : { ...rest, ...(isRead !== undefined ? { isRead } : {}) };
		}

		test('1.140 opening a session rewrites every peer, advances the revision and writes the default chat\'s title: nothing is imported', async () => {
			const { fixture, sessionData, today, createStore, session, peers } = await publishedNormalizedSession();
			const [defaultChat, , otherFolder] = fixture.chats;
			const store = createStore();
			await store.setArchived(session, URI.parse(otherFolder.runtimeUri), true);
			await store.reconcileOlderBuildCopy(session);
			store.dispose();
			const titles = async () => {
				const [snapshot] = await today.readCatalogSnapshot([fixture.runtimeSession]);
				return snapshot.chats.map(chat => chat.metadata?.summary);
			};
			const before = { peers: await peers(), titles: await titles() };
			// Live run (L3): 1.140 rewrites every peer without archived and read state, and the session's title as the default chat's.
			await editChatListAsOldBuild(sessionData.createService(), today.raw, fixture, 'centralCatalog', chats => chats.map(opened('1.140')));
			const sessionDb = sessionData.createService().openDatabase(URI.parse(fixture.session));
			const sessionTitle = await sessionDb.object.getMetadata(SESSION_CUSTOM_TITLE_KEY);
			await sessionDb.object.setMetadataValues({ [`customChatTitle:${defaultChat.uri}`]: sessionTitle ?? defaultChat.title, [`customChatTitleSource:${defaultChat.uri}`]: 'user' });
			sessionDb.dispose();

			await restore(createStore(), sessionData, today, session);

			assert.deepStrictEqual({ peers: await peers(), titles: await titles() }, before);
		});

		test('1.140 renaming a peer while its visit also rewrote and grew the chat list: the membership and the rename both import', async () => {
			const { fixture, sessionData, today, createStore, session, peers } = await publishedNormalizedSession();
			const [, sameFolder] = fixture.chats;
			const store = createStore();
			await store.persistMetadata(session, URI.parse(sameFolder.runtimeUri), { [SESSION_CUSTOM_TITLE_KEY]: 'L2 peer A', [SESSION_CUSTOM_TITLE_SOURCE_KEY]: 'user' });
			await store.flushCompatibilityPublishes(session, undefined);
			store.dispose();
			// Live run (L3): 1.140 opens the session (rewriting every peer), creates a peer and renames one.
			const created = buildChatUri(fixture.session, 'created-by-1-140');
			await editChatListAsOldBuild(sessionData.createService(), today.raw, fixture, 'centralCatalog', chats => [...chats.map(opened('1.140')), { uri: created }]);
			// Its peerChats lists the new peer unread, which session_chats does not record: importing peerChats changes the list too.
			await editChatListAsOldBuild(sessionData.createService(), today.raw, fixture, 'sessionDatabase', chats => chats.map(chat => chat.uri === created ? { ...chat, isRead: false } : chat));
			await editChatStateAsOldBuild(sessionData.createService(), fixture, sameFolder.uri, { title: 'L3 140 peer A', draft: 'L3 140 DRAFT peer A' });

			await restore(createStore(), sessionData, today, session);

			const [snapshot] = await today.readCatalogSnapshot([fixture.runtimeSession]);
			const metadata = snapshot.chats.find(chat => chat.chat === sameFolder.runtimeUri)?.metadata;
			assert.deepStrictEqual({
				created: (await peers()).some(peer => peer.chat === today.identity.toRuntime(created)),
				title: { title: metadata?.summary, titleSource: metadata?.titleSource },
			}, { created: true, title: { title: 'L3 140 peer A', titleSource: 'user' } });
		});

		for (const path of ['restore', 'backgroundPass'] as const) {
			test(`1.141 renaming a peer, then re-mirroring the list unchanged at quit: the rename is imported (${path}), and the list is this build's projection again`, async () => {
				const { fixture, sessionData, today, createStore, session } = await publishedNormalizedSession();
				const [, sameFolder] = fixture.chats;
				// Real data (probe 4a, section 3): 1.141.2 writes its rename to the databases, then re-mirrors session_chats and
				// peerChats unchanged at quit, advancing the revision with the rows equal to the projection.
				await editChatStateAsOldBuild(sessionData.createService(), fixture, sameFolder.uri, { title: 'Renamed by 1.141' });
				await remirrorChatListAsOldBuildAtQuit(sessionData.createService(), today.raw, fixture);

				const candidates = path === 'backgroundPass' ? await today.findOlderBuildChatCatalogEdits(AGENT_HOST_CATALOG_SNAPSHOT_SESSION_LIMIT) : undefined;
				// Both the restore of a normalized session and the background pass import without holding the session database.
				// Read before any deferred publish, which would only come later (and only if the copy's spelling differs).
				const importing = createStore();
				await importing.reconcileLegacy(session);

				const [snapshot] = await today.readCatalogSnapshot([fixture.runtimeSession]);
				const metadata = snapshot.chats.find(chat => chat.chat === sameFolder.runtimeUri)?.metadata;
				assert.deepStrictEqual({
					candidates,
					title: { title: metadata?.summary, titleSource: metadata?.titleSource },
					projectionCurrent: (await today.readOlderBuildCopyState(fixture.runtimeSession))?.projectionBehind,
					nextPass: await today.findOlderBuildChatCatalogEdits(AGENT_HOST_CATALOG_SNAPSHOT_SESSION_LIMIT),
				}, {
					candidates: path === 'backgroundPass' ? [fixture.runtimeSession] : undefined,
					title: { title: 'Renamed by 1.141', titleSource: 'user' },
					projectionCurrent: false,
					nextPass: [],
				});
			});
		}

		test('1.141 rename imported, then the host stops before publishing: a later user rename is not mistaken for an older build\'s edit', async () => {
			const { fixture, sessionData, today, createStore, session } = await publishedNormalizedSession();
			const [, sameFolder] = fixture.chats;
			await editChatStateAsOldBuild(sessionData.createService(), fixture, sameFolder.uri, { title: 'Renamed by 1.141' });
			await remirrorChatListAsOldBuildAtQuit(sessionData.createService(), today.raw, fixture);

			const record = today.recordOlderBuildChatState.bind(today);
			today.recordOlderBuildChatState = async () => { throw new Error('host stopped'); };
			const interrupted = createStore();
			try {
				await assert.rejects(() => interrupted.reconcileLegacy(session), /host stopped/);
			} finally {
				today.recordOlderBuildChatState = record;
				interrupted.dispose();
			}

			const restarted = createStore();
			await restarted.reconcileLegacy(session);
			await restarted.flushCompatibilityPublishes(session, undefined);
			await restarted.persistMetadata(session, URI.parse(sameFolder.runtimeUri), { [SESSION_CUSTOM_TITLE_KEY]: 'User rename', [SESSION_CUSTOM_TITLE_SOURCE_KEY]: 'user' });
			await restarted.flushCompatibilityPublishes(session, undefined);
			await createStore().reconcileLegacy(session);

			const [snapshot] = await today.readCatalogSnapshot([fixture.runtimeSession]);
			const metadata = snapshot.chats.find(chat => chat.chat === sameFolder.runtimeUri)?.metadata;
			assert.deepStrictEqual({ title: metadata?.summary, titleSource: metadata?.titleSource }, { title: 'User rename', titleSource: 'user' });
		});

		test('a normalized catalog no other build touched imports without opening the session database', async () => {
			const { fixture, sessionData, today, session } = await publishedNormalizedSession();
			const opened: string[] = [];
			const base = sessionData.createService(today.identity);
			const counting = {
				...base,
				openDatabase: (resource: URI) => { opened.push(resource.toString()); return base.openDatabase(resource); },
				tryOpenDatabase: async (resource: URI) => { opened.push(resource.toString()); return base.tryOpenDatabase(resource); },
			};
			const peerStore = store.add(new AgentHostPeerChatStore(today, counting, new NullLogService(), createLiveChatOwnership(() => undefined, () => undefined), createTestSessionStateStore(today, counting)));

			await peerStore.reconcileLegacy(session);

			assert.deepStrictEqual({ opened, behind: (await today.readOlderBuildCopyState(fixture.runtimeSession))?.projectionBehind }, { opened: [], behind: false });
		});

		const cases = [
			{ name: '1.141 opening the session drops an archived flag: the chat stays archived', build: '1.141', writer: 'centralCatalog', archiveSameFolder: false },
			{ name: '1.140 opening the session drops archived flags and read states: both are kept', build: '1.140', writer: 'centralCatalog', archiveSameFolder: false },
			{ name: '1.140 opening the session through peerChats only: archived flags and read states are kept', build: '1.140', writer: 'sessionDatabase', archiveSameFolder: false },
			{ name: '1.140 archiving a chat while dropping the rest still imports the archive', build: '1.140', writer: 'centralCatalog', archiveSameFolder: true },
		] as const;
		for (const { name, build, writer, archiveSameFolder } of cases) {
			test(name, async () => {
				const { fixture, sessionData, today, createStore, session, peers } = await publishedNormalizedSession();
				const [, sameFolder, otherFolder] = fixture.chats;
				const store = createStore();
				await store.setArchived(session, URI.parse(otherFolder.runtimeUri), true);
				await store.reconcileOlderBuildCopy(session);
				store.dispose();
				const before = await peers();

				await editChatListAsOldBuild(sessionData.createService(), today.raw, fixture, writer, chats => chats.map(opened(build)).map(chat => archiveSameFolder && chat.uri === sameFolder.uri ? { ...chat, archived: true } : chat));
				await restore(createStore(), sessionData, today, session);

				assert.deepStrictEqual(await peers(), before.map(peer => archiveSameFolder && peer.chat === sameFolder.runtimeUri ? { ...peer, archived: true } : peer));
			});
		}
	});

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

	test('a compatibility session whose legacy catalog orders its peers unlike its aggregate converts, in the aggregate\'s order', async () => {
		const fixture = createLegacySessionFixture('2b');
		const sessionData = store.add(new InMemorySessionDataService());
		await writeOldBuild(fixture, sessionData);
		const today = store.add(new CompatibleAgentHostDatabase(join(directory, 'agent-host.db')));
		await today.initialize();
		const service = sessionData.createService(today.identity);
		const peers = new AgentHostPeerChatStore(today, service, new NullLogService(), createLiveChatOwnership(() => undefined, () => undefined), createTestSessionStateStore(today, service));
		const session = URI.parse(fixture.runtimeSession);
		const [, sameFolder, otherFolder] = fixture.chats;
		// As in the live run: one peer archived, one unread, the payload current.
		await editChatListAsOldBuild(sessionData.createService(), today.raw, fixture, 'centralCatalog', chats => chats.map(chat => chat.uri === otherFolder.uri ? { ...chat, archived: true } : chat));
		await peers.reconcileLegacy(session);
		await reprojectLegacyFixturePayload(sessionData.createService(), today.raw, fixture);
		// The legacy catalog lists the peers in the other order, and a peer's own database records an empty inherited turn.
		const sqlite = await (today.raw as unknown as { _ensureDatabase(): Promise<Database> })._ensureDatabase();
		for (const sql of ['UPDATE session_chats SET chat_order = chat_order + 2 WHERE session_uri = ?', 'UPDATE session_chats SET chat_order = 3 - chat_order WHERE session_uri = ?']) {
			await new Promise<void>((resolve, reject) => sqlite.run(sql, [fixture.session], error => error ? reject(error) : resolve()));
		}
		const own = sessionData.createService().openDatabase(URI.parse(sameFolder.storage));
		await own.object.setMetadata('agentHost.chatInheritedTurnId', '');
		own.dispose();

		const converted = await migrateChatCatalogV2(today, service, session);

		const [stored] = await today.raw.readCatalogSnapshot([fixture.session]);
		assert.deepStrictEqual({
			converted: converted.status,
			peers: stored?.chats.filter(chat => chat.order !== undefined && chat.chat !== stored.header?.defaultChatUri).map(chat => ({ chat: chat.chat, archived: chat.archived, isRead: chat.isRead })),
		}, {
			converted: 'applied',
			peers: [{ chat: sameFolder.uri, archived: false, isRead: sameFolder.isRead }, { chat: otherFolder.uri, archived: true, isRead: otherFolder.isRead }],
		});
	});

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

	/** Opens a session the way restore does: with its session database held, which also reads what older builds wrote there. */
	async function restore(peerStore: AgentHostPeerChatStore, sessionData: InMemorySessionDataService, today: CompatibleAgentHostDatabase, session: URI): Promise<void> {
		const reference = sessionData.createService(today.identity).openDatabase(session);
		try {
			await peerStore.reconcileLegacy(session, reference);
		} finally {
			reference.dispose();
		}
		await peerStore.flushCompatibilityPublishes(session, undefined);
	}

	test('renames of normalized peers by an old build writing like 1.140 and 1.141 are imported on open, its own database first, and win over this build\'s rename of the same peer', async () => {
		const { fixture, sessionData, today, createStore, session } = await publishedNormalizedSession();
		const [, sameFolder, otherFolder] = fixture.chats;
		const writer = createStore();
		await writer.persistMetadata(session, URI.parse(otherFolder.runtimeUri), { [SESSION_CUSTOM_TITLE_KEY]: 'Renamed here', [SESSION_CUSTOM_TITLE_SOURCE_KEY]: 'user' });
		await writer.flushCompatibilityPublishes(session, undefined);
		// The rename as older builds read it: from the session database and the peer's own one.
		const oldBuildTitle = async (chat: ILegacyChatFixture) => {
			const view = await readOldBuildView(sessionData.createService(), today.raw, fixture);
			const reference = sessionData.createService().openDatabase(URI.parse(chat.uri));
			try {
				return { session: view.sessionDb[`customChatTitle:${chat.uri}`], own: await reference.object.getMetadata(SESSION_CUSTOM_TITLE_KEY) };
			} finally {
				reference.dispose();
			}
		};
		const published = await oldBuildTitle(otherFolder);
		// The host then stops after renaming the other peer, before publishing it.
		await writer.persistMetadata(session, URI.parse(sameFolder.runtimeUri), { [SESSION_CUSTOM_TITLE_KEY]: 'Unpublished rename', [SESSION_CUSTOM_TITLE_SOURCE_KEY]: 'user' });
		writer.dispose();

		// Downgraded: the old build renames both peers; a later rename of one reached its own database alone.
		await editChatStateAsOldBuild(sessionData.createService(), fixture, sameFolder.uri, { title: 'Renamed by 1.141' });
		await editChatStateAsOldBuild(sessionData.createService(), fixture, otherFolder.uri, { title: 'Renamed by 1.141 too', ownTitle: 'Renamed again by 1.141' });
		await restore(createStore(), sessionData, today, session);

		const [snapshot] = await today.readCatalogSnapshot([fixture.runtimeSession]);
		const title = (chat: ILegacyChatFixture) => {
			const metadata = snapshot.chats.find(row => row.chat === chat.runtimeUri)?.metadata;
			return { title: metadata?.summary, titleSource: metadata?.titleSource };
		};
		assert.deepStrictEqual({
			published,
			imported: [title(sameFolder), title(otherFolder)],
			republished: [await oldBuildTitle(sameFolder), await oldBuildTitle(otherFolder)],
		}, {
			// This build's rename reaches both places older builds read a peer's title.
			published: { session: 'Renamed here', own: 'Renamed here' },
			imported: [{ title: 'Renamed by 1.141', titleSource: 'user' }, { title: 'Renamed again by 1.141', titleSource: 'user' }],
			republished: [{ session: 'Renamed by 1.141', own: 'Renamed by 1.141' }, { session: 'Renamed again by 1.141', own: 'Renamed again by 1.141' }],
		});
	});

	test('a host stopped after writing a published title, but before recording it, never imports it over a newer rename', async () => {
		const { fixture, sessionData, today, createStore, session } = await publishedNormalizedSession();
		const [, sameFolder] = fixture.chats;
		const writer = createStore();
		await writer.persistMetadata(session, URI.parse(sameFolder.runtimeUri), { [SESSION_CUSTOM_TITLE_KEY]: 'Published T2', [SESSION_CUSTOM_TITLE_SOURCE_KEY]: 'user' });
		const record = today.recordOlderBuildChatState.bind(today);
		sinon.stub(today, 'recordOlderBuildChatState').callsFake(async (session, state) => {
			if (JSON.parse(state).pending !== null) {
				return record(session, state);
			}
			// The user renames the peer once more after T2 reached both databases older builds read; then the host stops.
			const current = (await today.readChatV2(fixture.runtimeSession, sameFolder.runtimeUri)).chat!;
			await today.updateChatV2Metadata(sameFolder.runtimeUri, current, { metadata: { ...current.metadata, summary: 'Renamed T3', titleSource: 'user' } });
			throw new Error('host stopped');
		});
		await writer.flushCompatibilityPublishes(session, undefined);
		sinon.restore();
		writer.dispose();

		await restore(createStore(), sessionData, today, session);

		const [snapshot] = await today.readCatalogSnapshot([fixture.runtimeSession]);
		assert.strictEqual(snapshot.chats.find(row => row.chat === sameFolder.runtimeUri)?.metadata?.summary, 'Renamed T3');
	});

	test('an own database without either title key is no information: an old build\'s rename in the session database is imported', async () => {
		const { fixture, sessionData, today, createStore, session } = await publishedNormalizedSession();
		const [, sameFolder] = fixture.chats;
		const writer = createStore();
		await writer.persistMetadata(session, URI.parse(sameFolder.runtimeUri), { [SESSION_CUSTOM_TITLE_KEY]: 'Renamed here', [SESSION_CUSTOM_TITLE_SOURCE_KEY]: 'user' });
		await writer.flushCompatibilityPublishes(session, undefined);
		writer.dispose();
		const own = sessionData.createService().openDatabase(URI.parse(sameFolder.uri));
		await own.object.deleteMetadata([SESSION_CUSTOM_TITLE_KEY, SESSION_CUSTOM_TITLE_SOURCE_KEY]);
		own.dispose();
		const sessionDb = sessionData.createService().openDatabase(URI.parse(fixture.session));
		await sessionDb.object.setMetadataValues({ [`customChatTitle:${sameFolder.uri}`]: 'Renamed by an old build', [`customChatTitleSource:${sameFolder.uri}`]: 'user' });
		sessionDb.dispose();

		await restore(createStore(), sessionData, today, session);

		const [snapshot] = await today.readCatalogSnapshot([fixture.runtimeSession]);
		assert.strictEqual(snapshot.chats.find(row => row.chat === sameFolder.runtimeUri)?.metadata?.summary, 'Renamed by an old build');
	});

	for (const [name, rewrite] of [
		['without `left`, as earlier builds wrote it', (record: Record<string, unknown>) => ({ published: record.published, pending: null })],
		['with a malformed `pending`', (record: Record<string, unknown>) => ({ published: record.published, pending: 42, left: record.left })],
	] as const) {
		test(`a published-titles record ${name} keeps its published titles: an old build's rename is imported`, async () => {
			const { fixture, sessionData, today, createStore, session } = await publishedNormalizedSession();
			const [, sameFolder] = fixture.chats;
			const writer = createStore();
			await writer.persistMetadata(session, URI.parse(sameFolder.runtimeUri), { [SESSION_CUSTOM_TITLE_KEY]: 'Renamed here', [SESSION_CUSTOM_TITLE_SOURCE_KEY]: 'user' });
			await writer.flushCompatibilityPublishes(session, undefined);
			writer.dispose();
			const sqlite = await (today.raw as unknown as { _ensureDatabase(): Promise<Database> })._ensureDatabase();
			const key = `sessionChatCatalogOlderBuildChatState:${fixture.session}`;
			const [row] = await new Promise<Record<string, unknown>[]>((resolve, reject) => sqlite.all('SELECT value FROM metadata WHERE key = ?', [key], (error, rows) => error ? reject(error) : resolve(rows)));
			await new Promise<void>((resolve, reject) => sqlite.run('UPDATE metadata SET value = ? WHERE key = ?', [JSON.stringify(rewrite(JSON.parse(row.value as string))), key], error => error ? reject(error) : resolve()));
			await editChatStateAsOldBuild(sessionData.createService(), fixture, sameFolder.uri, { title: 'Renamed by 1.141' });

			await restore(createStore(), sessionData, today, session);

			const [snapshot] = await today.readCatalogSnapshot([fixture.runtimeSession]);
			assert.strictEqual(snapshot.chats.find(chat => chat.chat === sameFolder.runtimeUri)?.metadata?.summary, 'Renamed by 1.141');
		});
	}

	test('a peer created by an old build is imported with its title; this build\'s titles written before a crash, or never published, are kept', async () => {
		const { fixture, sessionData, today, createStore, session } = await publishedNormalizedSession();
		const [, sameFolder, otherFolder] = fixture.chats;
		const created = buildChatUri(fixture.session, 'created-by-old-build');
		// This build's rename of one peer reached both databases, but the host stopped before recording it as published; its rename of the other was never published.
		const writer = createStore();
		await writer.persistMetadata(session, URI.parse(sameFolder.runtimeUri), { [SESSION_CUSTOM_TITLE_KEY]: 'Renamed here', [SESSION_CUSTOM_TITLE_SOURCE_KEY]: 'agent' });
		await writer.persistMetadata(session, URI.parse(otherFolder.runtimeUri), { [SESSION_CUSTOM_TITLE_KEY]: 'Never published', [SESSION_CUSTOM_TITLE_SOURCE_KEY]: 'user' });
		writer.dispose();
		for (const [resource, values] of [
			[fixture.session, { [`customChatTitle:${sameFolder.uri}`]: 'Renamed here', [`customChatTitleSource:${sameFolder.uri}`]: 'agent' }],
			[sameFolder.uri, { [SESSION_CUSTOM_TITLE_KEY]: 'Renamed here', [SESSION_CUSTOM_TITLE_SOURCE_KEY]: 'agent' }],
		] as const) {
			const reference = sessionData.createService().openDatabase(URI.parse(resource));
			await reference.object.setMetadataValues(values);
			reference.dispose();
		}
		// Downgraded: the old build creates and names a peer.
		await editChatListAsOldBuild(sessionData.createService(), today.raw, fixture, 'centralCatalog', peers => [...peers, { uri: created, isRead: true }]);
		await editChatStateAsOldBuild(sessionData.createService(), fixture, created, { title: 'Created by 1.141' });

		await restore(createStore(), sessionData, today, session);

		const [snapshot] = await today.readCatalogSnapshot([fixture.runtimeSession]);
		const title = (chat: string) => {
			const metadata = snapshot.chats.find(row => row.chat === chat)?.metadata;
			return { title: metadata?.summary, titleSource: metadata?.titleSource };
		};
		assert.deepStrictEqual([title(sameFolder.runtimeUri), title(otherFolder.runtimeUri), title(today.identity.toRuntime(created))], [
			{ title: 'Renamed here', titleSource: 'agent' },
			// The old build left this title as this build last published it: this build's later rename stands.
			{ title: 'Never published', titleSource: 'user' },
			{ title: 'Created by 1.141', titleSource: 'user' },
		]);
	});

	test('a peer draft an old build wrote into the session database alone, with no other trace, is imported on load', async () => {
		const { fixture, sessionData, today, session } = await publishedNormalizedSession();
		const [, sameFolder] = fixture.chats;
		const service = sessionData.createService(today.identity);
		await createTestSessionStateStore(today, service).load(session);
		await editChatStateAsOldBuild(sessionData.createService(), fixture, sameFolder.uri, { draft: 'Draft by 1.141' });

		const upgraded = createTestSessionStateStore(today, service);
		await upgraded.load(session);

		assert.strictEqual((await upgraded.chatRows.getDraft(session, URI.parse(sameFolder.runtimeUri)))?.text, 'Draft by 1.141');
	});

	test('title keys missing from a lost or recreated session database are no older-build edit: the next publish writes them again', async () => {
		const { fixture, sessionData, today, createStore, session } = await publishedNormalizedSession();
		const [, sameFolder, otherFolder] = fixture.chats;
		const store = createStore();
		await store.persistMetadata(session, URI.parse(sameFolder.runtimeUri), { [SESSION_CUSTOM_TITLE_KEY]: 'Renamed here', [SESSION_CUSTOM_TITLE_SOURCE_KEY]: 'user' });
		await store.flushCompatibilityPublishes(session, undefined);
		const keys = [`customChatTitle:${sameFolder.uri}`, `customChatTitleSource:${sameFolder.uri}`];
		const sessionDb = sessionData.createService().openDatabase(URI.parse(fixture.session));
		await sessionDb.object.deleteMetadata(keys);

		// Another change makes the next publish read the session database's copy.
		await store.setArchived(session, URI.parse(otherFolder.runtimeUri), true);
		await store.flushCompatibilityPublishes(session, undefined);
		store.dispose();

		const [snapshot] = await today.readCatalogSnapshot([fixture.runtimeSession]);
		const metadata = snapshot.chats.find(chat => chat.chat === sameFolder.runtimeUri)?.metadata;
		assert.deepStrictEqual({
			title: { title: metadata?.summary, titleSource: metadata?.titleSource },
			rewritten: Object.values(await sessionDb.object.getMetadataObject(Object.fromEntries(keys.map(key => [key, true])))),
		}, { title: { title: 'Renamed here', titleSource: 'user' }, rewritten: ['Renamed here', 'user'] });
		sessionDb.dispose();
	});

	test('a peer deleted, or moved away, leaves no title keys older builds read in the session it left; a moved chat keeps its own', async () => {
		const { fixture, sessionData, today, createStore, session } = await publishedNormalizedSession();
		const [, deleted, moved] = fixture.chats;
		const destination = 'copilotcli:/destination';
		await today.raw.registerRuntimeSession(destination, { provider: 'copilotcli', startTime: 1, source: 'explicit' }, { checkTombstone: false });
		await today.raw.registerChatCatalogV2(destination, { defaultChat: { chat: buildDefaultChatUri(destination), order: 0 }, peers: [], privateDescendants: [] });
		const store = createStore();
		await store.persistMetadata(session, URI.parse(deleted.runtimeUri), { [SESSION_CUSTOM_TITLE_KEY]: 'Deleted later', [SESSION_CUSTOM_TITLE_SOURCE_KEY]: 'user' });
		await store.persistMetadata(session, URI.parse(moved.runtimeUri), { [SESSION_CUSTOM_TITLE_KEY]: 'Moved later', [SESSION_CUSTOM_TITLE_SOURCE_KEY]: 'user' });
		await store.flushCompatibilityPublishes(session, undefined);
		const keys = async () => {
			const read = async (resource: string, keys: readonly string[]) => {
				const reference = sessionData.createService().openDatabase(URI.parse(resource));
				try {
					return Object.values(await reference.object.getMetadataObject(Object.fromEntries(keys.map(key => [key, true]))));
				} finally {
					reference.dispose();
				}
			};
			return {
				session: await read(fixture.session, [deleted, moved].flatMap(chat => [`customChatTitle:${chat.uri}`, `customChatTitleSource:${chat.uri}`])),
				own: [await read(deleted.uri, [SESSION_CUSTOM_TITLE_KEY]), await read(moved.uri, [SESSION_CUSTOM_TITLE_KEY])],
			};
		};
		const before = await keys();

		await store.remove(session, URI.parse(deleted.runtimeUri));
		await moveChatAsBlock4(today.raw, moved.uri, fixture.session, destination);
		await store.reconcileOlderBuildCopy(session);
		store.dispose();

		assert.deepStrictEqual({ before, after: await keys() }, {
			before: { session: ['Deleted later', 'user', 'Moved later', 'user'], own: [['Deleted later'], ['Moved later']] },
			after: { session: [undefined, undefined, undefined, undefined], own: [[undefined], ['Moved later']] },
		});
	});

	suite('chats Block 4 moved are shown to older builds, and their edits there neutralized', () => {
		/** A published normalized session whose titled peer Block 4 then moved to another normalized session, both copies published. */
		async function movedChat() {
			const published = await publishedNormalizedSession();
			const { fixture, today, createStore, session } = published;
			const destination = 'copilotcli:/destination';
			await today.raw.registerRuntimeSession(destination, { provider: 'copilotcli', startTime: 1, source: 'explicit' }, { checkTombstone: false });
			await today.raw.registerChatCatalogV2(destination, { defaultChat: { chat: buildDefaultChatUri(destination), order: 0 }, peers: [], privateDescendants: [] });
			const [, moved] = fixture.chats;
			await moveChatAsBlock4(today.raw, moved.uri, fixture.session, destination);
			const store = createStore();
			await store.reconcileOlderBuildCopy(session);
			await store.reconcileOlderBuildCopy(URI.parse(destination));
			store.dispose();
			const record = async () => {
				const [snapshot] = await today.readCatalogSnapshot([destination]);
				const chat = snapshot.chats.find(row => row.chat === moved.runtimeUri);
				const owner = (await today.findCentralChatOwners([moved.runtimeUri])).get(moved.runtimeUri);
				return { owner: owner?.ownerSession, deleted: owner?.deleted, listed: chat?.order !== undefined, title: chat?.metadata?.summary };
			};
			return { ...published, destination, moved, record };
		}

		test('a rename and a draft an old build routed to the source session by the moved chat\'s address are imported for the chat under its new owner', async () => {
			const { fixture, sessionData, today, createStore, session, destination, moved, record } = await movedChat();
			// Downgraded: 1.141 renames the moved chat and types a draft in it; both land in the source session's database.
			await editChatStateAsOldBuild(sessionData.createService(), fixture, moved.uri, { title: 'Renamed by 1.141', draft: 'Draft by 1.141' });

			await restore(createStore(), sessionData, today, session);

			const rows = createTestSessionStateStore(today, sessionData.createService(today.identity)).chatRows;
			assert.deepStrictEqual({ record: await record(), draft: (await rows.getDraft(URI.parse(destination), URI.parse(moved.runtimeUri)))?.text }, {
				record: { owner: destination, deleted: false, listed: true, title: 'Renamed by 1.141' },
				draft: 'Draft by 1.141',
			});
		});

		test('a moved chat\'s rename that loses its write to its owner\'s catalog is retried, never dropped', async () => {
			const { fixture, sessionData, today, createStore, session, moved, record } = await movedChat();
			await editChatStateAsOldBuild(sessionData.createService(), fixture, moved.uri, { title: 'Renamed by 1.141' });
			const update = today.updateChatV2Metadata.bind(today);
			let lost = false;
			sinon.stub(today, 'updateChatV2Metadata').callsFake(async (...args: Parameters<typeof today.updateChatV2Metadata>) => {
				if (!lost && args[0] === moved.runtimeUri) {
					lost = true;
					return { status: 'conflict' };
				}
				return update(...args);
			});

			await restore(createStore(), sessionData, today, session);
			await restore(createStore(), sessionData, today, session);

			assert.deepStrictEqual({ lost, title: (await record()).title }, { lost: true, title: 'Renamed by 1.141' });
		});

		test('an older build\'s draft of a moved chat never replaces a newer one, also after a crash right after importing it', async () => {
			const { fixture, sessionData, today, createStore, session, destination, moved } = await movedChat();
			const [, , other] = fixture.chats;
			await moveChatAsBlock4(today.raw, other.uri, fixture.session, destination);
			const mover = createStore();
			await mover.reconcileOlderBuildCopy(session);
			mover.dispose();
			const rows = createTestSessionStateStore(today, sessionData.createService(today.identity)).chatRows;
			const draft = async (chat: ILegacyChatFixture) => (await rows.getDraft(URI.parse(destination), URI.parse(chat.runtimeUri)))?.text;
			// This build's draft of the other chat after the move, then 1.141's drafts of both, routed to the source.
			await rows.setDraft(URI.parse(destination), URI.parse(other.runtimeUri), { text: 'Newer here', origin: { kind: MessageKind.User } });
			await editChatStateAsOldBuild(sessionData.createService(), fixture, moved.uri, { draft: 'Draft by 1.141' });
			await editChatStateAsOldBuild(sessionData.createService(), fixture, other.uri, { draft: 'Other draft by 1.141' });
			// The host stops after importing, before recording the import: the user then types again in the moved chat.
			const record = today.recordOlderBuildChatState.bind(today);
			let writes = 0;
			const stopped = sinon.stub(today, 'recordOlderBuildChatState').callsFake(async (...args: Parameters<typeof today.recordOlderBuildChatState>) => {
				if (++writes === 2) {
					throw new Error('host stopped');
				}
				return record(...args);
			});
			await restore(createStore(), sessionData, today, session).catch(() => undefined);
			const imported = await draft(moved);
			stopped.restore();
			await rows.setDraft(URI.parse(destination), URI.parse(moved.runtimeUri), { text: 'Typed after the crash', origin: { kind: MessageKind.User } });
			await restore(createStore(), sessionData, today, session);

			assert.deepStrictEqual({ imported, moved: await draft(moved), other: await draft(other) }, {
				imported: 'Draft by 1.141',
				moved: 'Typed after the crash',
				other: 'Newer here',
			});
		});

		test('a moved chat whose import fails spares the other moved chats\' imports, and is retried', async () => {
			const { fixture, sessionData, today, createStore, session, destination, moved } = await movedChat();
			const [, , other] = fixture.chats;
			await moveChatAsBlock4(today.raw, other.uri, fixture.session, destination);
			const mover = createStore();
			await mover.reconcileOlderBuildCopy(session);
			mover.dispose();
			await editChatStateAsOldBuild(sessionData.createService(), fixture, moved.uri, { title: 'Moved renamed by 1.141' });
			await editChatStateAsOldBuild(sessionData.createService(), fixture, other.uri, { title: 'Other renamed by 1.141' });
			const read = today.readChatV2.bind(today);
			const failing = sinon.stub(today, 'readChatV2').callsFake(async (...args: Parameters<typeof today.readChatV2>) => {
				if (args[1] === moved.runtimeUri) {
					throw new Error('unreadable');
				}
				return read(...args);
			});
			const titles = async () => {
				const [snapshot] = await today.readCatalogSnapshot([destination]);
				return [moved, other].map(chat => snapshot.chats.find(row => row.chat === chat.runtimeUri)?.metadata?.summary);
			};

			await restore(createStore(), sessionData, today, session);
			const whileFailing = await titles();
			failing.restore();
			await restore(createStore(), sessionData, today, session);

			assert.deepStrictEqual({ whileFailing, after: await titles() }, {
				whileFailing: [moved.title, 'Other renamed by 1.141'],
				after: ['Moved renamed by 1.141', 'Other renamed by 1.141'],
			});
		});

		test('an old build dropping a moved chat from its destination\'s list, or a stale source list naming it, neither deletes, resurrects nor duplicates it', async () => {
			const { fixture, sessionData, today, createStore, session, destination, moved, record, peers } = await movedChat();
			// 1.141 rewriting the destination's list without the moved chat (probe 4a, section 2).
			await editChatListAsOldBuild(sessionData.createService(), today.raw, { session: destination }, 'centralCatalog', chats => chats.filter(chat => chat.uri !== moved.uri));
			await restore(createStore(), sessionData, today, URI.parse(destination));
			// Stale old-build copies still listing it under its source: its session_chats, then its peerChats.
			await editChatListAsOldBuild(sessionData.createService(), today.raw, fixture, 'centralCatalog', chats => [...chats, { uri: moved.uri, isRead: true }]);
			await restore(createStore(), sessionData, today, session);
			await editChatListAsOldBuild(sessionData.createService(), today.raw, fixture, 'sessionDatabase', chats => [...chats, { uri: moved.uri, isRead: true }]);
			await restore(createStore(), sessionData, today, session);

			assert.deepStrictEqual({ record: await record(), inSource: (await peers()).some(peer => peer.chat === moved.runtimeUri) }, {
				record: { owner: destination, deleted: false, listed: true, title: moved.title },
				inSource: false,
			});
		});
	});

	test('a normalized session\'s title and default-chat read changes write nothing inline to the databases old builds read', async () => {
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
			// Nothing is written inline: titles publish with the deferred older-build copy, the default chat's read state never.
			peerChats: undefined,
			// As on main, a normalized chat's read state and title live in its catalog: the peer store writes neither into the session database.
			defaultChatIsRead: undefined,
			defaultTitle: undefined,
			catalogDefaultIsRead: true,
			// Nor into a chats_v2 peer's own db, whose working directories are written only when they change.
			peerDb: {
				[SESSION_CUSTOM_TITLE_KEY]: undefined,
				[SESSION_CUSTOM_TITLE_SOURCE_KEY]: undefined,
				'agentHost.chatWorkingDirectories': undefined,
			},
		});
	});
});
