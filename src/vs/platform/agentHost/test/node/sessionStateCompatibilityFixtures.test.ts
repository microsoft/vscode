/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createTestSessionStateStore } from './chatMetadataTestHelpers.js';
import assert from 'assert';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { join } from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { AgentHostDatabase } from '../../node/agentHostDatabase.js';
import { SESSION_CUSTOM_TITLE_KEY, SESSION_CUSTOM_TITLE_SOURCE_KEY } from '../../node/shared/persistSessionMetadata.js';
import { AgentHostPeerChatStore, type IPersistedPeerChat } from '../../node/agentHostPeerChatStore.js';
import { CompatibleAgentHostDatabase } from '../../node/compatibleAgentHostDatabase.js';
import { createLiveChatOwnership } from './chatOwnershipTestUtils.js';
import { createLegacySessionFixture, editChatListAsOldBuild, InMemorySessionDataService, LEGACY_BUILDS, legacyPeerMetadata, legacySessionMetadata, normalizeLegacySessionFixture, readOldBuildView, restorePeersAsOldBuild, writeLegacySessionState, type ILegacyChatFixture, type ILegacySessionFixture } from './sessionStateCompatibilityFixtures.js';
import { buildChatUri, buildDefaultChatUri, ChatOriginKind } from '../../common/state/sessionState.js';
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

	for (const [build, writer] of [['1.143', 'centralCatalog'], ['2b', 'centralCatalog'], ['1.143', 'sessionDatabase'], ['2b', 'sessionDatabase']] as const) {
		test(`${build}: a normalized session imports the chat list edits of an old build writing ${writer === 'centralCatalog' ? 'session_chats like 1.141' : 'only peerChats'}`, async () => {
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
			const [, sameFolder] = fixture.chats;
			const created = buildChatUri(fixture.session, 'created-by-old-build');
			await editChatListAsOldBuild(sessionData.createService(), today.raw, fixture, writer, peers => {
				const find = (uri: string) => peers.find(peer => peer.uri === uri)!;
				return [
					{ ...find(extra.movedInPeer), isRead: false },
					{ ...find(sameFolder.uri), archived: true },
					{ ...find(extra.sessionMovedPeer.chat), archived: true },
					{ uri: created, isRead: true, origin: { kind: ChatOriginKind.User } },
					{ uri: owned, isRead: true },
				];
			});

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
				sessionMovedStorage: extra.sessionMovedPeer.storage,
				ownedBy: elsewhere,
				republished: { peerChats: [extra.movedInPeer, sameFolder.uri, extra.sessionMovedPeer.chat, created], acknowledged: true },
			});
		});
	}

	test('an old build\'s edit of a peer wins whole over an unpublished normalized edit of the same peer; other normalized edits stay', async () => {
		const fixture = createLegacySessionFixture('1.143');
		const sessionData = store.add(new InMemorySessionDataService());
		await writeOldBuild(fixture, sessionData);
		const today = store.add(new CompatibleAgentHostDatabase(join(directory, 'agent-host.db')));
		await today.initialize();
		await normalizeLegacySessionFixture(today.raw, fixture);
		const service = sessionData.createService(today.identity);
		const createStore = () => new AgentHostPeerChatStore(today, service, new NullLogService(), createLiveChatOwnership(() => undefined, () => undefined), createTestSessionStateStore(today, service));
		const session = URI.parse(fixture.runtimeSession);
		const [, sameFolder, otherFolder] = fixture.chats;
		// The normalized edits are written, but the host stops before their older-build copy is published.
		const interrupted = createStore();
		await interrupted.setRead(session, URI.parse(sameFolder.runtimeUri), true);
		await interrupted.setArchived(session, URI.parse(otherFolder.runtimeUri), true);
		interrupted.dispose();

		await editChatListAsOldBuild(sessionData.createService(), today.raw, fixture, 'sessionDatabase', peers => peers.map(peer => peer.uri === sameFolder.uri ? { ...peer, providerData: 'old-build-provider' } : peer));

		const upgraded = createStore();
		const imported = await upgraded.reconcileLegacy(session);
		await upgraded.whenIdle();
		upgraded.dispose();
		assert.deepStrictEqual(imported?.slice(0, 2).map(peer => ({ uri: peer.uri, isRead: peer.isRead, archived: peer.archived, providerData: peer.providerData })), [
			{ uri: sameFolder.runtimeUri, isRead: sameFolder.isRead, archived: false, providerData: 'old-build-provider' },
			{ uri: otherFolder.runtimeUri, isRead: otherFolder.isRead, archived: true, providerData: otherFolder.providerData },
		]);
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
